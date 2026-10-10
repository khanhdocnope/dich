"""
========================================================================================
Manga Text Cleaner - AI Inpainting Web App & REST API (Hugging Face ZeroGPU Edition)
========================================================================================
Author: Senior AI/Fullstack Engineer
Platform: Hugging Face Spaces (Nvidia A100 ZeroGPU) & Mobile REST API
Features:
  - ZeroGPU Architecture: Dynamic GPU Allocation via @spaces.GPU(duration=60)
  - Memory Safety: Host CPU weight caching + ZeroGPU VRAM release & garbage collection
  - Image Pre/Post-processing: Modulo-8 Symmetric Reflection Padding + 1:1 Pixel-Perfect Mask Composite
  - Webtoon Support: Smart Context Window Cropping for gigantic vertical strips (> 2500px)
  - Dual Mode Inpainting:
      * Anime-Manga Big-LaMa (Optimized for Japanese manga & Korean manhwa line-art)
      * Standard Big-LaMa (General-purpose high-frequency textures & natural scenes)
  - ComicTextDetector Engine: OpenCV CPU DNN (Conserves ZeroGPU quota solely for neural inpainting)
  - Mobile-First Web UI: Responsive Gradio 5 Blocks + Touch-friendly ImageEditor
  - 100% Backward-Compatible REST API:
      * GET  /health           (Server health & GPU status)
      * POST /api/clean_page   (Full page detection + dilation + inpainting)
      * POST /api/inpaint      (Manual brush mask inpainting)
      * POST /api/detect       (ComicTextDetector OCR bounding box detection)
      * POST /api/switch_model (Dynamic model switching)
      * POST /api/v1/inpaint   (Direct multipart/form-data upload for mobile clients/cURL)
========================================================================================
"""

from __future__ import annotations

import os
# Disable Gradio 5 Node.js Server-Side Rendering (SSR) mode to prevent port 7860 conflicts
os.environ["GRADIO_SSR_MODE"] = "False"
import sys
import io
import time
import base64
from enum import Enum
from typing import Optional, Dict, Any, Tuple, List, Union

import cv2
import numpy as np
from PIL import Image
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

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
import gradio as gr

# --------------------------------------------------------------------------------------
# 2. Paths & Model Downloader with Multi-Mirror Redundancy
# --------------------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

COMIC_ONNX_PATH = os.path.join(MODEL_DIR, "comictextdetector.pt.onnx")
ANIME_LAMA_PT_PATH = os.path.join(MODEL_DIR, "anime-manga-big-lama.pt")
BIG_LAMA_PT_PATH = os.path.join(MODEL_DIR, "big-lama.pt")

def resilient_download(urls: List[str], target_path: str, min_mb: int = 10) -> bool:
    """Downloads model weights with retry across Hugging Face Hub and GitHub mirrors."""
    if os.path.exists(target_path) and os.path.getsize(target_path) >= min_mb * 1024 * 1024:
        return True

    for url in urls:
        try:
            print(f"⏳ Downloading {os.path.basename(target_path)} from: {url} ...")
            torch.hub.download_url_to_file(url, target_path, progress=True)
            if os.path.exists(target_path) and os.path.getsize(target_path) >= min_mb * 1024 * 1024:
                file_mb = os.path.getsize(target_path) // (1024 * 1024)
                print(f"✅ Successfully cached {os.path.basename(target_path)} ({file_mb} MB)")
                return True
        except Exception as err:
            print(f"⚠️ Mirror error ({url}): {err}")
            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except Exception:
                    pass
    return False

# Download ComicTextDetector ONNX (~14 MB)
resilient_download(
    [
        "https://huggingface.co/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx",
        "https://huggingface.co/mayocream/comic-text-detector-onnx/resolve/main/comictextdetector.pt.onnx",
        "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx"
    ],
    COMIC_ONNX_PATH,
    min_mb=10
)

# Download Anime-Manga Big-LaMa TorchScript (~196 MB)
resilient_download(
    [
        "https://huggingface.co/kzome/manga-cleaner/resolve/main/data/anime-manga-big-lama.pt",
        "https://github.com/Sanster/models/releases/download/AnimeMangaInpainting/anime-manga-big-lama.pt",
        "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/anime-manga-big-lama.pt"
    ],
    ANIME_LAMA_PT_PATH,
    min_mb=50
)

# Download Standard Big-LaMa TorchScript (~196 MB)
resilient_download(
    [
        "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt",
        "https://huggingface.co/anyisalin/big-lama/resolve/main/big-lama.pt",
        "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt"
    ],
    BIG_LAMA_PT_PATH,
    min_mb=50
)

# --------------------------------------------------------------------------------------
# 3. Image Preprocessing & Padding Engine (Modulo-8 Reflection & 1:1 Composite)
# --------------------------------------------------------------------------------------
def ceil_modulo(val: int, mod: int = 8) -> int:
    return val if val % mod == 0 else (val // mod + 1) * mod

def pad_img_to_modulo(img: np.ndarray, mod: int = 8) -> np.ndarray:
    """
    Symmetrically reflects boundary pixels so dimensions are divisible by mod (8),
    guaranteeing LaMa Fast Fourier Convolutions run without dimensional mismatch.
    """
    if len(img.shape) == 2:
        img = img[:, :, np.newaxis]
    height, width = img.shape[:2]
    out_height = ceil_modulo(height, mod)
    out_width = ceil_modulo(width, mod)

    pad_bottom = out_height - height
    pad_right = out_width - width

    return np.pad(
        img,
        ((0, pad_bottom), (0, pad_right), (0, 0)),
        mode="symmetric"
    )

def normalize_tensor_image(np_img: np.ndarray) -> np.ndarray:
    """Converts uint8 image into normalized (C, H, W) float32 in [0, 1]."""
    if len(np_img.shape) == 2:
        np_img = np_img[:, :, np.newaxis]
    transposed = np.transpose(np_img, (2, 0, 1))
    return transposed.astype("float32") / 255.0

def boxes_from_binary_mask(mask: np.ndarray, min_area: int = 25) -> List[np.ndarray]:
    """Extracts bounding boxes [x1, y1, x2, y2] from a binary mask for smart cropping."""
    height, width = mask.shape[:2]
    _, thresh = cv2.threshold(mask, 127, 255, 0)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    boxes = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w * h >= min_area:
            box = np.array([x, y, x + w, y + h], dtype=int)
            box[::2] = np.clip(box[::2], 0, width)
            box[1::2] = np.clip(box[1::2], 0, height)
            boxes.append(box)
    return boxes

def crop_box_with_context(
    image: np.ndarray,
    mask: np.ndarray,
    box: np.ndarray,
    margin: int = 128
) -> Tuple[np.ndarray, np.ndarray, List[int]]:
    """Crops an inpainting sub-region with ample surrounding context for coherent textures."""
    box_w = box[2] - box[0]
    box_h = box[3] - box[1]
    cx = (box[0] + box[2]) // 2
    cy = (box[1] + box[3]) // 2
    img_h, img_w = image.shape[:2]

    w = box_w + margin * 2
    h = box_h + margin * 2

    left = cx - w // 2
    right = cx + w // 2
    top = cy - h // 2
    bottom = cy + h // 2

    l = max(left, 0)
    r = min(right, img_w)
    t = max(top, 0)
    b = min(bottom, img_h)

    if left < 0:
        r = min(img_w, r + abs(left))
    if right > img_w:
        l = max(0, l - (right - img_w))
    if top < 0:
        b = min(img_h, b + abs(top))
    if bottom > img_h:
        t = max(0, t - (bottom - img_h))

    crop_img = image[t:b, l:r, :]
    crop_mask = mask[t:b, l:r]
    return crop_img, crop_mask, [l, t, r, b]

# --------------------------------------------------------------------------------------
# 4. ZeroGPU Model Loader & Inpainting Engine
# --------------------------------------------------------------------------------------
class ModelManager:
    """
    Manages TorchScript LaMa models in Host CPU RAM.
    Models are only transferred to GPU inside @spaces.GPU functions to prevent ZeroGPU crashes.
    """
    def __init__(self):
        self._cpu_models: Dict[str, torch.jit.ScriptModule] = {}
        self.active_model_name = "anime-lama"

    def get_cpu_model(self, model_name: str) -> Optional[torch.jit.ScriptModule]:
        canonical = "anime-lama" if "anime" in model_name.lower() else "lama"
        if canonical in self._cpu_models:
            return self._cpu_models[canonical]

        target_path = ANIME_LAMA_PT_PATH if canonical == "anime-lama" else BIG_LAMA_PT_PATH
        if not os.path.exists(target_path) or os.path.getsize(target_path) < 10 * 1024 * 1024:
            # Fallback to whichever is available
            target_path = BIG_LAMA_PT_PATH if os.path.exists(BIG_LAMA_PT_PATH) else ANIME_LAMA_PT_PATH

        if os.path.exists(target_path) and os.path.getsize(target_path) >= 10 * 1024 * 1024:
            try:
                print(f"📦 Loading {canonical} into Host CPU RAM ({os.path.basename(target_path)})...")
                model = torch.jit.load(target_path, map_location="cpu")
                model.eval()
                self._cpu_models[canonical] = model
                self.active_model_name = canonical
                return model
            except Exception as e:
                print(f"❌ Failed to load TorchScript model: {e}")
                return None
        return None

model_manager = ModelManager()

# Pre-load default model into CPU RAM during container startup
model_manager.get_cpu_model("anime-lama")

@spaces.GPU(duration=60)
def predict_inpaint_forward_gpu(
    image_rgb: np.ndarray,
    mask: np.ndarray,
    model_name: str = "anime-lama"
) -> np.ndarray:
    """
    Primary neural inpainting inference wrapped in @spaces.GPU.
    Dynamically transfers weights to Nvidia A100 VRAM and releases GPU memory on completion.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    cpu_model = model_manager.get_cpu_model(model_name)

    if cpu_model is None:
        # Emergency Telea fallback if weights unavailable
        orig_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        return cv2.inpaint(orig_bgr, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

    # Move model to allocated GPU device
    gpu_model = cpu_model.to(device)

    try:
        orig_h, orig_w = image_rgb.shape[:2]
        pad_image = pad_img_to_modulo(image_rgb, mod=8)
        pad_mask = pad_img_to_modulo(mask, mod=8)

        img_norm = normalize_tensor_image(pad_image)
        mask_norm = normalize_tensor_image(pad_mask)
        mask_norm = (mask_norm > 0).astype(np.float32)

        img_tensor = torch.from_numpy(img_norm).unsqueeze(0).to(device, dtype=torch.float32)
        mask_tensor = torch.from_numpy(mask_norm).unsqueeze(0).to(device, dtype=torch.float32)

        with torch.inference_mode():
            output_tensor = gpu_model(img_tensor, mask_tensor)

        res_np = output_tensor[0].permute(1, 2, 0).detach().cpu().numpy()
        res_np = np.clip(res_np * 255.0, 0, 255).astype(np.uint8)
        res_bgr = cv2.cvtColor(res_np, cv2.COLOR_RGB2BGR)

        # Un-pad precisely to original dimensions
        res_bgr = res_bgr[0:orig_h, 0:orig_w, :]

        # 1:1 Pixel-Perfect Mask Composite: 100% preserves unmasked artwork
        mask_f = (mask.astype(np.float32) / 255.0)
        if len(mask_f.shape) == 2:
            mask_f = mask_f[:, :, np.newaxis]
        orig_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR).astype(np.float32)
        final_bgr = (res_bgr.astype(np.float32) * mask_f + orig_bgr * (1.0 - mask_f))
        return final_bgr.clip(0, 255).astype(np.uint8)

    finally:
        # ZeroGPU Best Practice: Transfer model back to CPU and clear VRAM cache
        gpu_model.to("cpu")
        if device.type == "cuda":
            torch.cuda.empty_cache()

def execute_inpaint_pipeline(
    image_rgb: np.ndarray,
    mask: np.ndarray,
    model_name: str = "anime-lama"
) -> np.ndarray:
    """
    Handles standard manga coherent pass vs high-resolution webtoon context cropping.
    """
    h, w = image_rgb.shape[:2]
    max_dim = max(h, w)

    # For gigantic webtoon strips (> 2500px), apply smart bounding box cropping
    if max_dim > 2500:
        boxes = boxes_from_binary_mask(mask, min_area=30)
        if not boxes:
            return cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        final_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR).copy()
        for box in boxes:
            crop_img, crop_mask, [l, t, r, b] = crop_box_with_context(image_rgb, mask, box, margin=140)
            if not crop_mask.any():
                continue
            crop_result_bgr = predict_inpaint_forward_gpu(crop_img, crop_mask, model_name=model_name)
            final_bgr[t:b, l:r, :] = crop_result_bgr
        return final_bgr

    # Standard Manga Coherent Pass
    return predict_inpaint_forward_gpu(image_rgb, mask, model_name=model_name)

# --------------------------------------------------------------------------------------
# 5. ComicTextDetector Engine (OpenCV CPU DNN - ZeroGPU Saver)
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
                print("✅ ComicTextDetector initialized successfully on CPU!")
            except Exception as e:
                print(f"⚠️ ComicTextDetector init notice: {e}")

    def detect_mask(
        self,
        img_bgr: np.ndarray,
        input_size: int = 1024
    ) -> Tuple[np.ndarray, List[Dict[str, int]]]:
        h, w = img_bgr.shape[:2]
        full_mask = np.zeros((h, w), dtype=np.uint8)
        boxes = []

        if not self.ready or self.net is None:
            # Fallback high-contrast thresholding for white bubbles
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
                        det_prob = out[0, 0]

                if det_prob is not None and seg_prob is not None:
                    comb_prob = np.maximum(det_prob, seg_prob)
                elif det_prob is not None:
                    comb_prob = det_prob
                elif seg_prob is not None:
                    comb_prob = seg_prob
                else:
                    comb_prob = np.zeros((input_size, input_size), dtype=np.float32)

                mask_res = cv2.resize(comb_prob, (sub_w, sub_h), interpolation=cv2.INTER_LINEAR)
                # Highly sensitive threshold for stylized & colored sound effects
                binary = (mask_res > 0.20).astype(np.uint8) * 255
                full_mask[y:y2] = np.maximum(full_mask[y:y2], binary)
            except Exception as err:
                print(f"Detector chunk error: {err}")

            if y2 == h:
                break
            y = y2 - overlap

        # Collect bounding boxes
        contours, _ = cv2.findContours(full_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw > 8 and bh > 8:
                boxes.append({"x": int(bx), "y": int(by), "width": int(bw), "height": int(bh)})

        return full_mask, boxes

detector_engine = ComicTextDetectorEngine()

# --------------------------------------------------------------------------------------
# 6. High-Level Processing Pipeline
# --------------------------------------------------------------------------------------
def process_manga_cleaning(
    image_pil: Image.Image,
    custom_mask_pil: Optional[Image.Image] = None,
    dilation_px: int = 4,
    model_name: str = "anime-lama"
) -> Tuple[Image.Image, Image.Image, Dict[str, Any]]:
    """
    Unified entry point for both Web UI and REST API.
    """
    img_rgb = image_pil.convert("RGB")
    orig_w, orig_h = img_rgb.size
    img_rgb_arr = np.array(img_rgb)
    img_bgr_arr = cv2.cvtColor(img_rgb_arr, cv2.COLOR_RGB2BGR)

    is_custom = False
    detected_boxes_count = 0

    if custom_mask_pil is not None:
        mask_l = custom_mask_pil.convert("L").resize((orig_w, orig_h), Image.Resampling.NEAREST)
        mask_arr = np.array(mask_l)
        if mask_arr.max() > 10:
            raw_mask = (mask_arr > 10).astype(np.uint8) * 255
            is_custom = True
        else:
            raw_mask, boxes = detector_engine.detect_mask(img_bgr_arr)
            detected_boxes_count = len(boxes)
    else:
        raw_mask, boxes = detector_engine.detect_mask(img_bgr_arr)
        detected_boxes_count = len(boxes)

    # Morphological dilation: eliminates text border anti-aliasing artifacts
    if dilation_px > 0:
        ksize = max(3, dilation_px * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
        dilated_mask = cv2.dilate(raw_mask, kernel)
    else:
        dilated_mask = raw_mask

    # Run Inpainting
    t_start = time.time()
    result_bgr = execute_inpaint_pipeline(img_rgb_arr, dilated_mask, model_name=model_name)
    elapsed_ms = int((time.time() - t_start) * 1000)

    result_rgb = cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB)
    result_pil = Image.fromarray(result_rgb)
    mask_pil = Image.fromarray(dilated_mask)

    stats = {
        "model": model_name,
        "engine": "IOPaint LaMa (ZeroGPU)",
        "mode": "custom_brush" if is_custom else "auto_detector",
        "total_regions": 1 if is_custom else detected_boxes_count,
        "inference_ms": elapsed_ms,
        "width": orig_w,
        "height": orig_h
    }

    return result_pil, mask_pil, stats

# --------------------------------------------------------------------------------------
# 7. Helper Utilities for Base64 and Image Parsing
# --------------------------------------------------------------------------------------
def base64_to_pil(b64_str: str) -> Image.Image:
    if not b64_str:
        raise ValueError("Chuỗi Base64 ảnh không được rỗng.")
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    decoded = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(decoded)).convert("RGB")

def pil_to_base64(img: Image.Image, fmt: str = "PNG") -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/{fmt.lower()};base64," + encoded

def extract_image_and_mask_from_editor(
    editor_data: Union[Dict[str, Any], np.ndarray, Image.Image, None]
) -> Tuple[Optional[Image.Image], Optional[Image.Image]]:
    """
    Robustly extracts background image and binary mask from Gradio 4/5 gr.ImageEditor dictionary.
    Handles multiple brush layers, alpha channels, and composite fallbacks.
    """
    if editor_data is None:
        return None, None

    if isinstance(editor_data, dict):
        bg = editor_data.get("background")
        layers = editor_data.get("layers", [])
        composite = editor_data.get("composite")

        if bg is None and composite is not None:
            bg = composite
        if bg is None:
            return None, None

        if isinstance(bg, np.ndarray):
            bg_pil = Image.fromarray(bg).convert("RGB")
        elif isinstance(bg, Image.Image):
            bg_pil = bg.convert("RGB")
        else:
            return None, None

        w, h = bg_pil.size
        combined_mask = np.zeros((h, w), dtype=np.uint8)
        has_brush = False

        if layers:
            for layer in layers:
                if layer is None:
                    continue
                layer_arr = np.array(layer)
                # RGBA alpha channel
                if len(layer_arr.shape) == 3 and layer_arr.shape[2] == 4:
                    alpha = layer_arr[:, :, 3]
                    layer_mask = (alpha > 10).astype(np.uint8) * 255
                    if layer_mask.shape[:2] != (h, w):
                        layer_mask = cv2.resize(layer_mask, (w, h), interpolation=cv2.INTER_NEAREST)
                    combined_mask = np.maximum(combined_mask, layer_mask)
                    if combined_mask.any():
                        has_brush = True
                elif len(layer_arr.shape) == 2:
                    layer_mask = (layer_arr > 10).astype(np.uint8) * 255
                    if layer_mask.shape != (h, w):
                        layer_mask = cv2.resize(layer_mask, (w, h), interpolation=cv2.INTER_NEAREST)
                    combined_mask = np.maximum(combined_mask, layer_mask)
                    if combined_mask.any():
                        has_brush = True

        mask_pil = Image.fromarray(combined_mask, mode="L") if has_brush else None
        return bg_pil, mask_pil

    elif isinstance(editor_data, np.ndarray):
        return Image.fromarray(editor_data).convert("RGB"), None
    elif isinstance(editor_data, Image.Image):
        return editor_data.convert("RGB"), None

    return None, None

# --------------------------------------------------------------------------------------
# 8. REST API (FastAPI Backend Mount)
# --------------------------------------------------------------------------------------
api_app = FastAPI(
    title="Manga Text Cleaner API - ZeroGPU",
    description="High-performance REST API for Manga/Manhwa text removal & inpainting",
    version="1.0.0"
)

api_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CleanPagePayload(BaseModel):
    imageBase64: str
    maskBase64: Optional[str] = None
    dilationPx: Optional[int] = 4
    flatThreshold: Optional[float] = 3.5
    modelName: Optional[str] = "anime-lama"

class InpaintPayload(BaseModel):
    imageBase64: str
    maskBase64: str
    modelName: Optional[str] = "anime-lama"

class DetectPayload(BaseModel):
    imageBase64: str

class SwitchModelPayload(BaseModel):
    modelName: str

@api_app.get("/health")
def health_check():
    """Health check compatible with Manga Studio Web App / Android Client."""
    device_name = "Nvidia A100 (ZeroGPU)" if HAS_ZEROGPU else ("CUDA" if torch.cuda.is_available() else "CPU")
    return {
        "status": "online",
        "online": True,
        "device": device_name,
        "gpu": device_name,
        "gpu_name": device_name,
        "engine": "IOPaint LaMa & ComicTextDetector",
        "current_model": model_manager.active_model_name,
        "zerogpu": HAS_ZEROGPU,
        "available_models": ["anime-lama", "lama"]
    }

@api_app.post("/api/clean_page")
async def api_clean_page(req: CleanPagePayload):
    """Full-page inpainting endpoint (matches current frontend client)."""
    try:
        img_pil = base64_to_pil(req.imageBase64)
        mask_pil = base64_to_pil(req.maskBase64).convert("L") if req.maskBase64 else None
        model = req.modelName or "anime-lama"

        cleaned_pil, mask_res_pil, stats = process_manga_cleaning(
            image_pil=img_pil,
            custom_mask_pil=mask_pil,
            dilation_px=req.dilationPx or 4,
            model_name=model
        )

        return {
            "success": True,
            "cleanedImageBase64": pil_to_base64(cleaned_pil),
            "maskBase64": pil_to_base64(mask_res_pil),
            "stats": stats
        }
    except Exception as e:
        print(f"API clean_page Error: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý trang: {str(e)}")

@api_app.post("/api/inpaint")
async def api_inpaint(req: InpaintPayload):
    """Manual brush mask inpainting endpoint (matches current frontend client)."""
    try:
        img_pil = base64_to_pil(req.imageBase64)
        mask_pil = base64_to_pil(req.maskBase64).convert("L")
        model = req.modelName or "anime-lama"

        cleaned_pil, _, _ = process_manga_cleaning(
            image_pil=img_pil,
            custom_mask_pil=mask_pil,
            dilation_px=0,
            model_name=model
        )

        return {
            "success": True,
            "cleanedImageBase64": pil_to_base64(cleaned_pil)
        }
    except Exception as e:
        print(f"API inpaint Error: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi inpaint: {str(e)}")

@api_app.post("/api/detect")
async def api_detect(req: DetectPayload):
    """ComicTextDetector bounding boxes detection (matches current frontend client)."""
    try:
        img_pil = base64_to_pil(req.imageBase64)
        img_bgr = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
        mask, boxes = detector_engine.detect_mask(img_bgr)

        return {
            "success": True,
            "boxes": boxes,
            "maskBase64": pil_to_base64(Image.fromarray(mask))
        }
    except Exception as e:
        print(f"API detect Error: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi nhận diện văn bản: {str(e)}")

@api_app.post("/api/switch_model")
def api_switch_model(req: SwitchModelPayload):
    """Switch active model between 'anime-lama' and 'lama'."""
    canonical = "anime-lama" if "anime" in req.modelName.lower() else "lama"
    model_manager.active_model_name = canonical
    return {
        "success": True,
        "current_model": canonical
    }

@api_app.post("/api/v1/inpaint")
async def api_multipart_inpaint(
    image: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    model_name: str = Form("anime-lama"),
    dilation: int = Form(4)
):
    """Multipart/form-data upload endpoint for cURL / Android HTTP Client."""
    try:
        img_bytes = await image.read()
        img_pil = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        mask_pil = None
        if mask is not None:
            mask_bytes = await mask.read()
            if len(mask_bytes) > 0:
                mask_pil = Image.open(io.BytesIO(mask_bytes)).convert("L")

        cleaned_pil, _, _ = process_manga_cleaning(
            image_pil=img_pil,
            custom_mask_pil=mask_pil,
            dilation_px=dilation,
            model_name=model_name
        )

        out_buf = io.BytesIO()
        cleaned_pil.save(out_buf, format="PNG")
        return Response(content=out_buf.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inpainting failed: {str(e)}")

# --------------------------------------------------------------------------------------
# 9. Gradio Web Application UI (Mobile-First / Android Chrome Optimized)
# --------------------------------------------------------------------------------------
CUSTOM_CSS = """
/* Responsive Mobile-First Enhancements */
.gradio-container {
    max-width: 1200px !important;
    margin: 0 auto !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.header-badge {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}
.mobile-canvas-container {
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid #334155;
    background: #0f172a;
}
.action-btn {
    font-weight: 700 !important;
    border-radius: 12px !important;
    padding: 12px 20px !important;
    transition: all 0.2s ease !important;
}
.action-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4) !important;
}
@media (max-width: 768px) {
    .gradio-container {
        padding: 8px !important;
    }
    .mobile-stack {
        flex-direction: column !important;
    }
}
"""

def create_gradio_ui() -> gr.Blocks:
    with gr.Blocks(title="Manga Text Cleaner - ZeroGPU A100") as demo:
        gr.HTML(f"<style>{CUSTOM_CSS}</style>")
        with gr.Row(elem_classes="items-center justify-between"):
            with gr.Column(scale=8):
                gr.Markdown(
                    """
                    # 🎨 Manga Text Cleaner (ZeroGPU Nvidia A100)
                    **Xóa chữ & bóng thoại manga/manhwa siêu sạch bằng mô hình AI LaMa Inpainting & ComicTextDetector.**
                    """
                )
            with gr.Column(scale=4, min_width=200):
                gr.HTML(
                    """
                    <div style="text-align: right; padding-top: 10px;">
                        <span class="header-badge">⚡ ZeroGPU Nvidia A100 Active</span>
                    </div>
                    """
                )

        with gr.Tabs():
            # -------------------------------------------------------------------------
            # TAB 1: Vẽ Cọ Thủ Công (Interactive Image Editor)
            # -------------------------------------------------------------------------
            with gr.TabItem("🖌️ Quẹt Cọ Xóa Nền (Interactive Canvas)"):
                with gr.Row(elem_classes="mobile-stack"):
                    with gr.Column(scale=6):
                        gr.Markdown("### 1. Tải ảnh & Dùng cọ vẽ vùng chữ cần xóa")
                        editor_input = gr.ImageEditor(
                            type="numpy",
                            label="Khung vẽ cọ (Dùng ngón tay/chuột bôi vùng chữ)",
                            brush=gr.Brush(colors=["#ff0000"], default_color="#ff0000", default_size=28),
                            eraser=gr.Eraser(default_size=28),
                            elem_classes="mobile-canvas-container"
                        )

                        with gr.Accordion("⚙️ Tùy chọn nâng cao", open=False):
                            model_choice_tab1 = gr.Radio(
                                choices=[("Anime-Manga Big-LaMa (Nét vẽ truyện tranh)", "anime-lama"), ("Standard Big-LaMa (Cảnh vật chi tiết)", "lama")],
                                value="anime-lama",
                                label="Mô hình AI Inpainting"
                            )
                            dilation_slider_tab1 = gr.Slider(
                                minimum=0,
                                maximum=15,
                                value=4,
                                step=1,
                                label="Độ mở rộng viền nét vẽ (Dilation Pixels)",
                                info="Tự động mở rộng nhẹ nét cọ để xóa sạch viền bóng chữ"
                            )

                        btn_inpaint = gr.Button(
                            "🚀 AI Xóa Nền Vùng Chọn (ZeroGPU)",
                            variant="primary",
                            size="lg",
                            elem_classes="action-btn"
                        )

                    with gr.Column(scale=6):
                        gr.Markdown("### 2. Kết quả phục hồi tranh gốc")
                        output_image_tab1 = gr.Image(
                            label="Tranh đã xóa chữ hoàn thiện (1:1 Pixel-Perfect)",
                            type="pil",
                            interactive=False
                        )
                        output_mask_tab1 = gr.Image(
                            label="Mask vùng đã xóa",
                            type="pil",
                            interactive=False,
                            visible=False
                        )
                        output_stats_tab1 = gr.JSON(label="Thông số xử lý", visible=True)

                def on_run_interactive_inpaint(editor_data, model_name, dilation_val):
                    bg_pil, custom_mask_pil = extract_image_and_mask_from_editor(editor_data)
                    if bg_pil is None:
                        raise gr.Error("Vui lòng tải ít nhất một trang truyện lên khung vẽ!")

                    result_pil, mask_res_pil, stats = process_manga_cleaning(
                        image_pil=bg_pil,
                        custom_mask_pil=custom_mask_pil,
                        dilation_px=int(dilation_val),
                        model_name=model_name
                    )
                    return result_pil, mask_res_pil, stats

                btn_inpaint.click(
                    fn=on_run_interactive_inpaint,
                    inputs=[editor_input, model_choice_tab1, dilation_slider_tab1],
                    outputs=[output_image_tab1, output_mask_tab1, output_stats_tab1]
                )

            # -------------------------------------------------------------------------
            # TAB 2: Tự Động Quét & Xóa Toàn Bộ (ComicTextDetector + LaMa)
            # -------------------------------------------------------------------------
            with gr.TabItem("⚡ Tự Động Xóa Toàn Bộ (1-Click Auto Clean)"):
                with gr.Row(elem_classes="mobile-stack"):
                    with gr.Column(scale=6):
                        gr.Markdown("### 1. Nạp ảnh truyện cần tự động xóa chữ")
                        auto_input_image = gr.Image(
                            type="pil",
                            label="Tải ảnh gốc (Manga / Manhwa)",
                            elem_classes="mobile-canvas-container"
                        )

                        with gr.Accordion("⚙️ Cấu hình bộ lọc ký tự", open=False):
                            model_choice_tab2 = gr.Radio(
                                choices=[("Anime-Manga Big-LaMa", "anime-lama"), ("Standard Big-LaMa", "lama")],
                                value="anime-lama",
                                label="Mô hình AI"
                            )
                            dilation_slider_tab2 = gr.Slider(
                                minimum=0,
                                maximum=12,
                                value=4,
                                step=1,
                                label="Độ mở rộng viền ký tự (Dilation)",
                                info="Bao phủ trọn vẹn nét viền đen của chữ bóng thoại"
                            )

                        btn_auto_clean = gr.Button(
                            "🪄 Tự Động Quét & Xóa Toàn Bộ Trang (AI Auto-Clean)",
                            variant="primary",
                            size="lg",
                            elem_classes="action-btn"
                        )

                    with gr.Column(scale=6):
                        gr.Markdown("### 2. So sánh Trước & Sau khi xóa")
                        with gr.Tabs():
                            with gr.TabItem("🖼️ Tranh Đã Phục Hồi"):
                                auto_output_cleaned = gr.Image(label="Kết quả sạch chữ", type="pil", interactive=False)
                            with gr.TabItem("🎭 Mask Tự Động Nhận Diện"):
                                auto_output_mask = gr.Image(label="Mask ComicTextDetector", type="pil", interactive=False)
                        auto_output_stats = gr.JSON(label="Thống kê kết quả", visible=True)

                def on_run_auto_clean(img_pil, model_name, dilation_val):
                    if img_pil is None:
                        raise gr.Error("Vui lòng tải một trang truyện lên trước!")

                    result_pil, mask_res_pil, stats = process_manga_cleaning(
                        image_pil=img_pil,
                        custom_mask_pil=None,
                        dilation_px=int(dilation_val),
                        model_name=model_name
                    )
                    return result_pil, mask_res_pil, stats

                btn_auto_clean.click(
                    fn=on_run_auto_clean,
                    inputs=[auto_input_image, model_choice_tab2, dilation_slider_tab2],
                    outputs=[auto_output_cleaned, auto_output_mask, auto_output_stats]
                )

            # -------------------------------------------------------------------------
            # TAB 3: Hướng Dẫn Kết Nối Ứng Dụng Mobile / API Payload
            # -------------------------------------------------------------------------
            with gr.TabItem("📱 Kết Nối Ứng Dụng Mobile (REST API Guide)"):
                gr.Markdown(
                    """
                    ### 🔗 Cách kết nối trực tiếp với ứng dụng Manga Translator Studio (Mobile / Web)

                    Hệ thống backend này được cấu hình **100% tương thích** với ứng dụng Manga Studio của bạn. Bạn không cần sửa đổi mã nguồn client!

                    #### 1. Dán URL Hugging Face Space vào Ứng Dụng:
                    1. Sao chép địa chỉ của Space (VD: `https://<ten-user>-<ten-space>.hf.space`).
                    2. Mở ứng dụng **Manga Studio**, bấm biểu tượng **AI Cloud / Colab** (hoặc nút **Kết Nối AI** ở thanh điều hướng dưới cùng).
                    3. Dán URL vào ô **URL Colab / Server AI**, bấm **Kiểm Tra & Lưu Kết Nối**.
                    4. Khi biểu tượng chuyển sang màu xanh lá (`AI Sẵn Sàng`), bạn có thể dùng tính năng **AI Xóa Trang** hoặc **Cọ Xóa** trực tiếp!

                    ---

                    #### 2. Cấu trúc REST API Endpoints:

                    | Phương thức | Endpoint | Mô tả | Định dạng dữ liệu |
                    | :--- | :--- | :--- | :--- |
                    | `GET` | `/health` | Kiểm tra tình trạng server & GPU | JSON |
                    | `POST` | `/api/clean_page` | Xóa chữ tự động toàn bộ trang | JSON (Base64) |
                    | `POST` | `/api/inpaint` | Xóa nền theo mask cọ vẽ | JSON (Base64) |
                    | `POST` | `/api/detect` | Nhận diện bounding boxes | JSON (Base64) |
                    | `POST` | `/api/switch_model` | Đổi model (`anime-lama` / `lama`) | JSON |
                    | `POST` | `/api/v1/inpaint` | Upload trực tiếp file ảnh | Multipart Form Data |

                    ---

                    #### 3. Ví dụ cURL (Gửi file ảnh trực tiếp qua Terminal / Android):
                    ```bash
                    # Gửi ảnh qua REST API và lưu kết quả
                    curl -X POST "https://<ten-user>-<ten-space>.hf.space/api/v1/inpaint" \\
                         -F "image=@/duong_dan_anh/trang_01.jpg" \\
                         -F "model_name=anime-lama" \\
                         -F "dilation=4" \\
                         --output "trang_01_cleaned.png"
                    ```

                    #### 4. Ví dụ JSON Payload (Base64 POST):
                    ```json
                    POST /api/clean_page HTTP/1.1
                    Host: <ten-user>-<ten-space>.hf.space
                    Content-Type: application/json

                    {
                      "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
                      "dilationPx": 4,
                      "modelName": "anime-lama"
                    }
                    ```
                    """
                )

        gr.HTML(
            """
            <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #64748b;">
                Manga Text Cleaner Studio &bull; Powered by IOPaint LaMa &amp; Hugging Face ZeroGPU (Nvidia A100) &bull; Production Ready
            </div>
            """
        )

    return demo

# --------------------------------------------------------------------------------------
# 10. Mount Gradio to FastAPI & Server Bootstrap
# --------------------------------------------------------------------------------------
demo_app = create_gradio_ui()

# Mount Gradio UI at root path "/" on top of FastAPI
app = gr.mount_gradio_app(api_app, demo_app, path="/")

def release_port(port: int = 7860):
    """
    Releases target port if held by a zombie/orphan process.
    Prevents Errno 98: Address already in use during container restarts on Hugging Face Spaces.
    """
    import socket
    import subprocess
    import signal
    import glob

    # Quick test if port is in use
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    is_busy = sock.connect_ex(("127.0.0.1", port)) == 0
    sock.close()

    if not is_busy:
        return

    print(f"⚠️ Port {port} is currently in use. Attempting to release ghost process...")

    # Method 1: fuser
    try:
        subprocess.run(["fuser", "-k", f"{port}/tcp"], capture_output=True, timeout=5)
    except Exception:
        pass

    # Method 2: Inspect /proc/net/tcp and kill owning PID
    try:
        hex_port = f"{port:04X}"
        inodes = set()
        for tcp_file in ["/proc/net/tcp", "/proc/net/tcp6"]:
            if os.path.exists(tcp_file):
                with open(tcp_file, "r") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 10 and parts[1].endswith(f":{hex_port}"):
                            inodes.add(parts[9])

        if inodes:
            my_pid = os.getpid()
            for fd_path in glob.glob("/proc/[0-9]*/fd/*"):
                try:
                    target = os.readlink(fd_path)
                    for inode in inodes:
                        if f"socket:[{inode}]" in target:
                            pid = int(fd_path.split("/")[2])
                            if pid != my_pid:
                                print(f"⚠️ Killing orphan PID {pid} on port {port}...")
                                os.kill(pid, signal.SIGKILL)
                except Exception:
                    pass
    except Exception as e:
        print(f"Notice during port cleanup: {e}")

    time.sleep(1.0)


def wait_for_port_availability(port: int = 7860, max_retries: int = 5) -> bool:
    """Waits for the port socket to be fully unbound before launching uvicorn."""
    import socket
    for attempt in range(max_retries):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", port))
            s.close()
            return True
        except OSError:
            print(f"⏳ Waiting for port {port} to become free (attempt {attempt + 1}/{max_retries})...")
            release_port(port)
            time.sleep(1.5)
    return False


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))

    release_port(port)
    wait_for_port_availability(port)

    print(f"🌟 Starting Manga Text Cleaner on http://0.0.0.0:{port} ...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        timeout_keep_alive=65,
        access_log=True
    )
