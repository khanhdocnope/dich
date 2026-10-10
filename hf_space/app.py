r"""
========================================================================================
Manga Translator Studio - Core AI Inpainting & Cleaner Engine (Hugging Face ZeroGPU Edition)
========================================================================================
Ported from d:\dich\colab\colab_server.py with 100% Algorithm Fidelity:
  - IOPaint Core Architecture: Symmetric Modulo-8 Padding + 1:1 Pixel-Perfect Composite
  - Models: IOPaint Anime-Manga Big-LaMa (Sanster) & IOPaint Standard Big-LaMa
  - High-Resolution Strategies: Full-Page Coherent (Manga) & Smart Context Cropping (Webtoon)
  - 4-Stage Pipeline: ComicTextDetector + Dilation + IOPaint Inpainting + Alpha Composite
  - Hugging Face ZeroGPU: Dynamic @spaces.GPU(duration=60) Allocation & VRAM Release
  - Native Gradio Launch + Embedded REST Router (/health, /api/clean_page, /api/inpaint, etc.)
========================================================================================
"""

from __future__ import annotations

import os
os.environ.setdefault("GRADIO_SSR_MODE", "False")

import sys
import io
import time
import base64
import gc
from enum import Enum
from typing import List, Optional, Dict, Any, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps
import torch

# --------------------------------------------------------------------------------------
# 1. ZeroGPU SDK Initialization & Graceful Fallback
# --------------------------------------------------------------------------------------
try:
    import spaces
    HAS_ZEROGPU = True
    print("🚀 Hugging Face ZeroGPU SDK detected! GPU will be dynamically allocated per request.")
except ImportError:
    HAS_ZEROGPU = False
    class DummySpaces:
        def GPU(self, duration: int = 60):
            def decorator(fn):
                return fn
            return decorator
    spaces = DummySpaces()
    print("ℹ️ Running in standard environment (ZeroGPU SDK not found, using direct PyTorch).")

from fastapi import APIRouter, FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
import gradio as gr

# --------------------------------------------------------------------------------------
# 2. Paths & Model Downloader
# --------------------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

COMIC_ONNX_PATH = os.path.join(MODEL_DIR, "comictextdetector.pt.onnx")
ANIME_LAMA_PT_PATH = os.path.join(MODEL_DIR, "anime-manga-big-lama.pt")
BIG_LAMA_PT_PATH = os.path.join(MODEL_DIR, "big-lama.pt")

def download_resilient(urls: List[str], dest: str, min_mb: int = 10) -> bool:
    if os.path.exists(dest) and os.path.getsize(dest) >= min_mb * 1024 * 1024:
        return True
    for url in urls:
        try:
            print(f"⏳ Downloading {os.path.basename(dest)} from {url}...")
            torch.hub.download_url_to_file(url, dest, progress=True)
            if os.path.exists(dest) and os.path.getsize(dest) >= min_mb * 1024 * 1024:
                print(f"✅ Downloaded {os.path.basename(dest)} ({os.path.getsize(dest) // (1024*1024)} MB)")
                return True
        except Exception as e:
            print(f"⚠️ Mirror notice ({url}): {e}")
            if os.path.exists(dest):
                try:
                    os.remove(dest)
                except Exception:
                    pass
    return False

# Download ComicTextDetector ONNX (~90 MB)
comic_urls = [
    "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx",
    "https://huggingface.co/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx",
    "https://huggingface.co/mayocream/comic-text-detector-onnx/resolve/main/comictextdetector.pt.onnx"
]
download_resilient(comic_urls, COMIC_ONNX_PATH, 10)

# Download Official IOPaint Models (Sanster)
anime_lama_urls = [
    "https://github.com/Sanster/models/releases/download/AnimeMangaInpainting/anime-manga-big-lama.pt",
    "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/anime-manga-big-lama.pt"
]
download_resilient(anime_lama_urls, ANIME_LAMA_PT_PATH, 50)

big_lama_urls = [
    "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt",
    "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt",
    "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/big-lama.pt"
]
download_resilient(big_lama_urls, BIG_LAMA_PT_PATH, 50)

# --------------------------------------------------------------------------------------
# 3. IOPaint Core Preprocessing & Helpers (Direct from colab_server.py)
# --------------------------------------------------------------------------------------
def ceil_modulo(x: int, mod: int) -> int:
    if x % mod == 0:
        return x
    return (x // mod + 1) * mod

def pad_img_to_modulo(img: np.ndarray, mod: int = 8, min_size: Optional[int] = None) -> np.ndarray:
    """
    IOPaint symmetric modulo padding.
    Symmetrically reflects boundary pixels so that dimensions are divisible by mod (8),
    avoiding black border padding artifacts and bilinear downscaling degradation.
    """
    if len(img.shape) == 2:
        img = img[:, :, np.newaxis]
    height, width = img.shape[:2]
    out_height = ceil_modulo(height, mod)
    out_width = ceil_modulo(width, mod)

    if min_size is not None:
        out_width = max(min_size, out_width)
        out_height = max(min_size, out_height)

    return np.pad(
        img,
        ((0, out_height - height), (0, out_width - width), (0, 0)),
        mode="symmetric"
    )

def norm_img(np_img: np.ndarray) -> np.ndarray:
    """IOPaint image normalization to (C, H, W) float32 in [0, 1]."""
    if len(np_img.shape) == 2:
        np_img = np_img[:, :, np.newaxis]
    np_img = np.transpose(np_img, (2, 0, 1))
    return np_img.astype("float32") / 255.0

def boxes_from_mask(mask: np.ndarray) -> List[np.ndarray]:
    """Extracts bounding boxes [x1, y1, x2, y2] from a binary mask (IOPaint standard)."""
    height, width = mask.shape[:2]
    _, thresh = cv2.threshold(mask, 127, 255, 0)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w > 4 and h > 4:
            box = np.array([x, y, x + w, y + h]).astype(int)
            box[::2] = np.clip(box[::2], 0, width)
            box[1::2] = np.clip(box[1::2], 0, height)
            boxes.append(box)
    return boxes

class HDStrategy(str, Enum):
    ORIGINAL = "ORIGINAL"
    CROP = "CROP"
    RESIZE = "RESIZE"

# --------------------------------------------------------------------------------------
# 4. IOPaint Inpainting Engine with ZeroGPU Support
# --------------------------------------------------------------------------------------
class IOPaintEngine:
    def __init__(self, default_model: str = "anime-lama"):
        self.pad_mod = 8
        self.current_model_name = default_model
        self.model = None
        self.ready = False
        self.loaded_models: Dict[str, Any] = {}
        self.load_model(default_model)

    def load_model(self, model_name: str) -> bool:
        """Loads or switches active IOPaint model (anime-lama or lama) in Host CPU RAM."""
        model_name = model_name.lower().strip()
        if model_name in self.loaded_models:
            self.model = self.loaded_models[model_name]
            self.current_model_name = model_name
            self.ready = True
            print(f"🔄 Switched active IOPaint model to: {model_name}")
            return True

        target_path = None
        if "anime" in model_name:
            target_path = ANIME_LAMA_PT_PATH
            canonical_name = "anime-lama"
        else:
            target_path = BIG_LAMA_PT_PATH
            canonical_name = "lama"

        if not os.path.exists(target_path) or os.path.getsize(target_path) < 10000000:
            if target_path == ANIME_LAMA_PT_PATH and os.path.exists(BIG_LAMA_PT_PATH):
                target_path = BIG_LAMA_PT_PATH
                canonical_name = "lama"
            elif target_path == BIG_LAMA_PT_PATH and os.path.exists(ANIME_LAMA_PT_PATH):
                target_path = ANIME_LAMA_PT_PATH
                canonical_name = "anime-lama"

        if os.path.exists(target_path) and os.path.getsize(target_path) > 10000000:
            try:
                print(f"⏳ Loading IOPaint model into CPU RAM: {canonical_name} ({os.path.basename(target_path)})...")
                loaded = torch.jit.load(target_path, map_location="cpu")
                loaded.eval()
                self.loaded_models[canonical_name] = loaded
                self.model = loaded
                self.current_model_name = canonical_name
                self.ready = True
                print(f"✅ IOPaint Model '{canonical_name}' ready in CPU RAM!")
                return True
            except Exception as e:
                print(f"⚠️ Failed to load IOPaint model {target_path}: {e}")
                self.ready = False
                return False
        return False

    @spaces.GPU(duration=60)
    def forward(self, pad_image_rgb: np.ndarray, pad_mask: np.ndarray) -> np.ndarray:
        """
        IOPaint forward pass wrapped in @spaces.GPU for ZeroGPU Nvidia A100.
        pad_image_rgb: [H, W, 3] RGB uint8 (modulo-8 padded)
        pad_mask: [H, W, 1] uint8 (0 or 255)
        returns: [H, W, 3] BGR uint8
        """
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        gpu_model = self.model.to(dev)

        try:
            img_norm = norm_img(pad_image_rgb)
            mask_norm = norm_img(pad_mask)
            mask_norm = (mask_norm > 0).astype(np.float32)

            img_t = torch.from_numpy(img_norm).unsqueeze(0).to(dev, dtype=torch.float32)
            mask_t = torch.from_numpy(mask_norm).unsqueeze(0).to(dev, dtype=torch.float32)

            with torch.inference_mode():
                out = gpu_model(img_t, mask_t)

            cur_res = out[0].permute(1, 2, 0).detach().cpu().numpy()
            cur_res = np.clip(cur_res * 255.0, 0, 255).astype(np.uint8)
            cur_res = cv2.cvtColor(cur_res, cv2.COLOR_RGB2BGR)
            return cur_res
        finally:
            gpu_model.to("cpu")
            if dev == "cuda":
                torch.cuda.empty_cache()
            gc.collect()

    def _pad_forward(self, image_rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """
        Runs IOPaint forward pass with symmetric padding and 1:1 pixel-perfect compositing.
        image_rgb: [H, W, 3] RGB uint8
        mask: [H, W] or [H, W, 1] uint8 (0 or 255)
        returns: [H, W, 3] BGR uint8
        """
        if len(mask.shape) == 2:
            mask = mask[:, :, np.newaxis]
        orig_h, orig_w = image_rgb.shape[:2]

        pad_image = pad_img_to_modulo(image_rgb, mod=self.pad_mod)
        pad_mask = pad_img_to_modulo(mask, mod=self.pad_mod)

        result_bgr = self.forward(pad_image, pad_mask)
        result_bgr = result_bgr[0:orig_h, 0:orig_w, :]

        # 1:1 Pixel-Perfect Mask Composite (Preserves untouched original pixels perfectly)
        mask_norm = (mask.astype(np.float32) / 255.0)
        orig_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR).astype(np.float32)
        res_bgr = result_bgr.astype(np.float32)
        final_bgr = (res_bgr * mask_norm + orig_bgr * (1.0 - mask_norm)).clip(0, 255).astype(np.uint8)
        return final_bgr

    def _crop_box(self, image: np.ndarray, mask: np.ndarray, box: np.ndarray, margin: int = 128) -> Tuple[np.ndarray, np.ndarray, List[int]]:
        """IOPaint bounding box crop with generous context expansion."""
        box_h = box[3] - box[1]
        box_w = box[2] - box[0]
        cx = (box[0] + box[2]) // 2
        cy = (box[1] + box[3]) // 2
        img_h, img_w = image.shape[:2]

        w = box_w + margin * 2
        h = box_h + margin * 2

        _l = cx - w // 2
        _r = cx + w // 2
        _t = cy - h // 2
        _b = cy + h // 2

        l = max(_l, 0)
        r = min(_r, img_w)
        t = max(_t, 0)
        b = min(_b, img_h)

        if _l < 0: r = min(img_w, r + abs(_l))
        if _r > img_w: l = max(0, l - (_r - img_w))
        if _t < 0: b = min(img_h, b + abs(_t))
        if _b > img_h: t = max(0, t - (_b - img_h))

        crop_img = image[t:b, l:r, :]
        crop_mask = mask[t:b, l:r]
        return crop_img, crop_mask, [l, t, r, b]

    def inpaint(
        self,
        image_rgb: np.ndarray,
        mask: np.ndarray,
        hd_strategy: HDStrategy = HDStrategy.ORIGINAL,
        crop_trigger_size: int = 2500,
        crop_margin: int = 128
    ) -> np.ndarray:
        """
        IOPaint Main Inpainting Routine (100% matched with colab_server.py).
        - For regular Manga pages (<= 2500px): Uses full-image coherent pass for flawless global context.
        - For gigantic Webtoons (> 2500px): Uses IOPaint CROP strategy with ample context windows.
        image_rgb: [H, W, 3] uint8
        mask: [H, W] uint8 (0 or 255)
        returns: [H, W, 3] BGR uint8
        """
        if not self.ready or self.model is None:
            orig_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
            return cv2.inpaint(orig_bgr, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

        h, w = image_rgb.shape[:2]
        max_dim = max(h, w)
        use_crop = (hd_strategy == HDStrategy.CROP) or (max_dim > crop_trigger_size)

        if use_crop:
            boxes = boxes_from_mask(mask)
            if not boxes:
                return cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

            inpaint_res_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR).copy()
            for box in boxes:
                crop_img, crop_mask, [l, t, r, b] = self._crop_box(image_rgb, mask, box, margin=crop_margin)
                if not crop_mask.any():
                    continue
                crop_res_bgr = self._pad_forward(crop_img, crop_mask)
                inpaint_res_bgr[t:b, l:r, :] = crop_res_bgr
            return inpaint_res_bgr
        else:
            # Full-Page Coherent Pass: Highest quality for Manga (LaMa FFC sees entire page structure & tones)
            return self._pad_forward(image_rgb, mask)

# --------------------------------------------------------------------------------------
# 5. ComicTextDetector Engine (100% identical to colab_server.py lines 365-445)
# --------------------------------------------------------------------------------------
class ComicTextDetectorEngine:
    def __init__(self, model_path: str = COMIC_ONNX_PATH):
        self.model_path = model_path
        self.net = None
        self.ready = False

        if os.path.exists(model_path):
            try:
                self.net = cv2.dnn.readNetFromONNX(model_path)
                self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                self.ready = True
                print("✅ ComicTextDetector (OpenCV Engine) initialized successfully!")
            except Exception as e:
                print(f"⚠️ ComicTextDetector init notice: {e}")

    def detect_mask(self, img_bgr: np.ndarray, input_size: int = 1024) -> Tuple[np.ndarray, List[Dict[str, int]]]:
        h, w = img_bgr.shape[:2]
        full_mask = np.zeros((h, w), dtype=np.uint8)
        boxes = []

        if not self.ready or self.net is None:
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
            return thresh, []

        chunk_h = 1200
        overlap = 100
        y = 0

        while y < h:
            y2 = min(y + chunk_h, h)
            sub_img = img_bgr[y:y2]
            sub_h, sub_w = sub_img.shape[:2]

            blob = cv2.dnn.blobFromImage(
                sub_img,
                scalefactor=1.0 / 255.0,
                size=(input_size, input_size),
                swapRB=True,
                crop=False
            )
            self.net.setInput(blob)
            try:
                outs = self.net.forward(self.net.getUnconnectedOutLayersNames())
                det_prob = None
                seg_prob = None
                for out in outs:
                    if len(out.shape) == 4 and out.shape[1] == 1:
                        seg_prob = out[0, 0]
                    elif len(out.shape) == 4 and out.shape[1] == 2:
                        det_prob = out[0, 0]  # Channel 0 is text probability

                if det_prob is not None and seg_prob is not None:
                    comb_prob = np.maximum(det_prob, seg_prob)
                elif det_prob is not None:
                    comb_prob = det_prob
                elif seg_prob is not None:
                    comb_prob = seg_prob
                else:
                    comb_prob = np.zeros((input_size, input_size), dtype=np.float32)

                mask_res = cv2.resize(comb_prob, (sub_w, sub_h), interpolation=cv2.INTER_LINEAR)
                # Sensitive threshold to capture colored, stylized, and Japanese manga text
                binary = (mask_res > 0.20).astype(np.uint8) * 255
                full_mask[y:y2] = np.maximum(full_mask[y:y2], binary)
            except Exception as e:
                print(f"Detection chunk error at y={y}: {e}")

            if y2 == h:
                break
            y = y2 - overlap

        contours, _ = cv2.findContours(full_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw > 8 and bh > 8:
                boxes.append({"x": int(bx), "y": int(by), "width": int(bw), "height": int(bh)})

        return full_mask, boxes

# --------------------------------------------------------------------------------------
# 6. Manga Cleaner Pipeline (100% matched with colab_server.py)
# --------------------------------------------------------------------------------------
class MangaCleanerPipeline:
    def __init__(self):
        self.iopaint = IOPaintEngine(default_model="anime-lama")
        self.detector = ComicTextDetectorEngine()

    def clean_image(
        self,
        img_pil: Image.Image,
        dilation_px: int = 4,
        custom_mask: Optional[Image.Image] = None,
        model_name: Optional[str] = None
    ) -> Tuple[Image.Image, Image.Image, Dict[str, Any]]:
        if model_name:
            self.iopaint.load_model(model_name)

        # Preserve alpha channel if present
        img_pil = ImageOps.exif_transpose(img_pil)
        has_alpha = img_pil.mode in ("RGBA", "LA")
        alpha_channel = img_pil.split()[-1] if has_alpha else None

        img_rgb = img_pil.convert("RGB")
        w, h = img_rgb.size
        img_rgb_arr = np.array(img_rgb)
        img_bgr_arr = cv2.cvtColor(img_rgb_arr, cv2.COLOR_RGB2BGR)

        # 1. Determine Mask: Custom User Brush vs Auto ComicTextDetector
        is_custom = False
        boxes_count = 0
        if custom_mask is not None:
            mask_arr = np.array(custom_mask.convert("L").resize((w, h), Image.Resampling.NEAREST))
            if mask_arr.max() > 20:
                raw_mask = (mask_arr > 20).astype(np.uint8) * 255
                is_custom = True
            else:
                raw_mask, boxes = self.detector.detect_mask(img_bgr_arr)
                boxes_count = len(boxes)
        else:
            raw_mask, boxes = self.detector.detect_mask(img_bgr_arr)
            boxes_count = len(boxes)

        # 2. Morphological Elliptical Dilation (eliminates anti-aliasing text stroke fringes)
        ksize = max(3, dilation_px * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
        dilated_mask = cv2.dilate(raw_mask, kernel)

        # 3. Execute IOPaint Inpainting (Full-Page Coherent or Smart Crop)
        res_bgr = self.iopaint.inpaint(img_rgb_arr, dilated_mask)
        res_rgb = cv2.cvtColor(res_bgr, cv2.COLOR_BGR2RGB)

        cleaned_pil = Image.fromarray(res_rgb)
        if alpha_channel is not None:
            cleaned_pil = cleaned_pil.convert("RGBA")
            cleaned_pil.putalpha(alpha_channel)

        stats = {
            "model": self.iopaint.current_model_name,
            "engine": f"IOPaint ({'ZeroGPU' if HAS_ZEROGPU else 'CPU'})",
            "total_regions": 1 if is_custom else boxes_count,
            "mode": "custom_brush" if is_custom else "auto",
            "width": w,
            "height": h
        }

        return cleaned_pil, Image.fromarray(dilated_mask), stats

cleaner_pipeline = MangaCleanerPipeline()

# --------------------------------------------------------------------------------------
# 7. Base64 & Format Helpers
# --------------------------------------------------------------------------------------
def b64_to_pil(b64_str: str) -> Image.Image:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    return Image.open(io.BytesIO(base64.b64decode(b64_str))).convert("RGB")

def pil_to_b64(pil_img: Image.Image, fmt="PNG") -> str:
    buf = io.BytesIO()
    pil_img.save(buf, format=fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

def extract_image_and_mask_from_editor(editor_data: Any) -> Tuple[Optional[Image.Image], Optional[Image.Image]]:
    if not editor_data:
        return None, None
    if isinstance(editor_data, dict):
        bg = editor_data.get("background")
        layers = editor_data.get("layers", [])
        if bg is None:
            return None, None

        bg_pil = Image.fromarray(bg).convert("RGB") if isinstance(bg, np.ndarray) else bg.convert("RGB")
        w, h = bg_pil.size
        combined_mask = np.zeros((h, w), dtype=np.uint8)
        has_brush = False

        if layers:
            for layer in layers:
                if layer is None:
                    continue
                layer_arr = np.array(layer)
                if len(layer_arr.shape) == 3 and layer_arr.shape[2] == 4:
                    alpha = layer_arr[:, :, 3]
                    layer_mask = (alpha > 10).astype(np.uint8) * 255
                    if layer_mask.shape[:2] != (h, w):
                        layer_mask = cv2.resize(layer_mask, (w, h), interpolation=cv2.INTER_NEAREST)
                    combined_mask = np.maximum(combined_mask, layer_mask)
                    if combined_mask.any():
                        has_brush = True

        mask_pil = Image.fromarray(combined_mask, mode="L") if has_brush else None
        return bg_pil, mask_pil

    return None, None

# --------------------------------------------------------------------------------------
# 8. REST API Endpoints (100% matched with Studio App and colab_server.py)
# --------------------------------------------------------------------------------------
api_router = APIRouter()

class CleanPagePayload(BaseModel):
    imageBase64: str
    maskBase64: Optional[str] = None
    dilationPx: Optional[int] = 4
    modelName: Optional[str] = None

class InpaintPayload(BaseModel):
    imageBase64: str
    maskBase64: str
    modelName: Optional[str] = None

class DetectPayload(BaseModel):
    imageBase64: str

class SwitchModelPayload(BaseModel):
    modelName: str

@api_router.get("/health")
@api_router.get("/api/v1/health")
def health():
    device_name = "Nvidia A100 (ZeroGPU)" if HAS_ZEROGPU else ("CUDA" if torch.cuda.is_available() else "CPU")
    return {
        "status": "online",
        "device": device_name,
        "gpu": device_name,
        "engine": "IOPaint (Lama Cleaner) & ComicTextDetector",
        "current_model": cleaner_pipeline.iopaint.current_model_name,
        "iopaint_ready": cleaner_pipeline.iopaint.ready,
        "detector_ready": cleaner_pipeline.detector.ready,
        "available_models": ["anime-lama", "lama"]
    }

@api_router.post("/api/clean_page")
async def api_clean_page(req: CleanPagePayload):
    try:
        img = b64_to_pil(req.imageBase64)
        custom_mask = b64_to_pil(req.maskBase64).convert("L") if req.maskBase64 else None
        cleaned_pil, mask_pil, stats = await run_in_threadpool(
            cleaner_pipeline.clean_image,
            img_pil=img,
            dilation_px=req.dilationPx or 4,
            custom_mask=custom_mask,
            model_name=req.modelName
        )
        return {
            "success": True,
            "cleanedImageBase64": pil_to_b64(cleaned_pil),
            "maskBase64": pil_to_b64(mask_pil),
            "stats": stats
        }
    except Exception as e:
        print(f"Clean Page Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/api/inpaint")
async def api_inpaint(req: InpaintPayload):
    try:
        img = b64_to_pil(req.imageBase64)
        custom_mask = b64_to_pil(req.maskBase64).convert("L")
        cleaned_pil, mask_pil, stats = await run_in_threadpool(
            cleaner_pipeline.clean_image,
            img_pil=img,
            dilation_px=4,
            custom_mask=custom_mask,
            model_name=req.modelName
        )
        return {
            "success": True,
            "cleanedImageBase64": pil_to_b64(cleaned_pil),
            "maskBase64": pil_to_b64(mask_pil),
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/api/detect")
async def api_detect(req: DetectPayload):
    try:
        img_pil = b64_to_pil(req.imageBase64)
        rgb_arr = np.array(img_pil)
        bgr_arr = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)
        mask_arr, boxes = cleaner_pipeline.detector.detect_mask(bgr_arr)
        mask_pil = Image.fromarray(mask_arr, mode="L")
        return {
            "success": True,
            "maskBase64": pil_to_b64(mask_pil),
            "boxes": boxes,
            "count": len(boxes)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/api/switch_model")
def api_switch_model(req: SwitchModelPayload):
    success = cleaner_pipeline.iopaint.load_model(req.modelName)
    return {
        "success": success,
        "current_model": cleaner_pipeline.iopaint.current_model_name
    }

@api_router.post("/api/v1/inpaint")
async def api_v1_inpaint(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    dilation: int = Form(4),
    model_name: str = Form("anime-lama")
):
    try:
        img_bytes = await image.read()
        img_pil = Image.open(io.BytesIO(img_bytes))

        mask_pil = None
        if mask is not None:
            mask_bytes = await mask.read()
            if mask_bytes:
                mask_pil = Image.open(io.BytesIO(mask_bytes)).convert("L")

        cleaned_pil, _, _ = await run_in_threadpool(
            cleaner_pipeline.clean_image,
            img_pil=img_pil,
            dilation_px=dilation,
            custom_mask=mask_pil,
            model_name=model_name
        )

        out_buffer = io.BytesIO()
        cleaned_pil.save(out_buffer, format="PNG")
        return Response(content=out_buffer.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API error: {str(e)}")

# --------------------------------------------------------------------------------------
# 9. Gradio Mobile-First Web UI
# --------------------------------------------------------------------------------------
CUSTOM_CSS = """
.gradio-container {
    max-width: 100% !important;
    padding: 12px !important;
}
.mobile-canvas-container {
    min-height: 550px !important;
}
.action-btn {
    min-height: 52px !important;
    font-size: 16px !important;
    font-weight: 600 !important;
}
"""

def create_gradio_ui() -> gr.Blocks:
    with gr.Blocks(title="Manga Text Cleaner - ZeroGPU A100") as demo:
        gr.HTML(f"<style>{CUSTOM_CSS}</style>")
        gr.Markdown(
            """
            # 🎨 Manga Text Cleaner (Nvidia A100 ZeroGPU)
            **Phục hồi tranh & xóa chữ manga/manhwa siêu sạch bằng Anime-Manga Big-LaMa & ComicTextDetector (IOPaint Engine).**
            """
        )

        with gr.Tabs():
            with gr.TabItem("🖌️ Quẹt Cọ Xóa Nền (Interactive Canvas)"):
                with gr.Row():
                    with gr.Column(scale=6):
                        editor_input = gr.ImageEditor(
                            type="numpy",
                            label="Khung vẽ cọ (Dùng ngón tay/chuột bôi vùng chữ)",
                            brush=gr.Brush(colors=["#ff0000"], default_color="#ff0000", default_size=28),
                            eraser=gr.Eraser(default_size=28),
                            elem_classes="mobile-canvas-container"
                        )
                        with gr.Accordion("⚙️ Tùy chọn", open=False):
                            model_choice_tab1 = gr.Radio(
                                choices=[("Anime-Manga Big-LaMa (Nét vẽ truyện tranh)", "anime-lama"), ("Standard Big-LaMa (Cảnh vật chi tiết)", "lama")],
                                value="anime-lama",
                                label="Mô hình AI"
                            )
                            dilation_slider_tab1 = gr.Slider(0, 15, value=4, step=1, label="Độ mở rộng viền nét vẽ (px)")
                        btn_inpaint = gr.Button("🚀 AI Xóa Nền Vùng Chọn (ZeroGPU)", variant="primary", elem_classes="action-btn")

                    with gr.Column(scale=6):
                        output_image_tab1 = gr.Image(label="Tranh đã phục hồi (1:1 Pixel-Perfect)", type="pil", interactive=False)
                        output_stats_tab1 = gr.JSON(label="Thông số xử lý")

                def on_run_interactive_inpaint(editor_data, model_name, dilation_val):
                    bg_pil, custom_mask_pil = extract_image_and_mask_from_editor(editor_data)
                    if bg_pil is None:
                        raise gr.Error("Vui lòng tải một trang truyện lên trước!")
                    result_pil, _, stats = cleaner_pipeline.clean_image(
                        img_pil=bg_pil,
                        dilation_px=int(dilation_val),
                        custom_mask=custom_mask_pil,
                        model_name=model_name
                    )
                    return result_pil, stats

                btn_inpaint.click(
                    fn=on_run_interactive_inpaint,
                    inputs=[editor_input, model_choice_tab1, dilation_slider_tab1],
                    outputs=[output_image_tab1, output_stats_tab1]
                )

            with gr.TabItem("⚡ Tự Động Xóa Toàn Bộ (1-Click Auto Clean)"):
                with gr.Row():
                    with gr.Column(scale=6):
                        auto_input_image = gr.Image(type="pil", label="Tải ảnh gốc Manga / Manhwa", elem_classes="mobile-canvas-container")
                        with gr.Accordion("⚙️ Tùy chọn", open=False):
                            model_choice_tab2 = gr.Radio(
                                choices=[("Anime-Manga Big-LaMa", "anime-lama"), ("Standard Big-LaMa", "lama")],
                                value="anime-lama",
                                label="Mô hình AI"
                            )
                            dilation_slider_tab2 = gr.Slider(0, 12, value=4, step=1, label="Độ mở rộng viền ký tự (Dilation)")
                        btn_auto_clean = gr.Button("🪄 Tự Động Quét & Xóa Toàn Bộ (AI Auto-Clean)", variant="primary", elem_classes="action-btn")

                    with gr.Column(scale=6):
                        auto_output_cleaned = gr.Image(label="Kết quả sạch chữ", type="pil", interactive=False)
                        auto_output_mask = gr.Image(label="Mask ComicTextDetector", type="pil", interactive=False)
                        auto_output_stats = gr.JSON(label="Thống kê kết quả")

                def on_run_auto_clean(img_pil, model_name, dilation_val):
                    if img_pil is None:
                        raise gr.Error("Vui lòng tải một trang truyện lên trước!")
                    result_pil, mask_res_pil, stats = cleaner_pipeline.clean_image(
                        img_pil=img_pil,
                        dilation_px=int(dilation_val),
                        custom_mask=None,
                        model_name=model_name
                    )
                    return result_pil, mask_res_pil, stats

                btn_auto_clean.click(
                    fn=on_run_auto_clean,
                    inputs=[auto_input_image, model_choice_tab2, dilation_slider_tab2],
                    outputs=[auto_output_cleaned, auto_output_mask, auto_output_stats]
                )

            with gr.TabItem("📱 Kết Nối Ứng Dụng Mobile (REST API Guide)"):
                gr.Markdown(
                    """
                    ### 🔗 Hướng dẫn kết nối Manga Studio (Web / Android)
                    Dán URL Space này vào mục **URL Colab / Server AI** trong ứng dụng Manga Studio.
                    
                    **Các API Endpoint hỗ trợ:**
                    - `GET /health` : Kiểm tra server và GPU
                    - `POST /api/clean_page` : Xóa toàn trang tự động
                    - `POST /api/inpaint` : Xóa theo nét cọ
                    - `POST /api/detect` : Nhận diện bounding box
                    - `POST /api/v1/inpaint` : Upload file trực tiếp bằng cURL / Mobile Client
                    """
                )

    demo.queue(max_size=32, default_concurrency_limit=2)
    return demo

# --------------------------------------------------------------------------------------
# 10. Server Bootstrap: Native Gradio Launch + Embedded FastAPI Router
# --------------------------------------------------------------------------------------
demo = create_gradio_ui()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    print(f"🌟 Launching Manga Text Cleaner on http://0.0.0.0:{port} ...")

    app, local_url, share_url = demo.launch(
        server_name="0.0.0.0",
        server_port=port,
        prevent_thread_lock=True,
        show_error=True
    )

    if hasattr(app, "include_router"):
        app.include_router(api_router)
        print("✅ REST API endpoints (/health, /api/clean_page, /api/inpaint, /api/v1/inpaint) successfully attached!")

    demo.block_thread()
