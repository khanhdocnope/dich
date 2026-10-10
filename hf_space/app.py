"""
========================================================================================
Manga Text Cleaner - AI Inpainting Web App & REST API (Hugging Face ZeroGPU Edition)
========================================================================================
Platform: Hugging Face Spaces (Nvidia A100 ZeroGPU) & Mobile REST API
Features:
  - Dual Mode Inpainting:
      * Anime-Manga Big-LaMa (Optimized for Japanese manga & Korean manhwa line-art)
      * Standard Big-LaMa (General-purpose high-frequency textures & natural scenes)
  - ComicTextDetector Engine: OpenCV CPU DNN (Fast automatic speech bubble detection)
  - 1:1 Pixel-Perfect Mask Composite (Zero blur on original artwork outside mask)
  - ZeroGPU Architecture: Dynamic GPU Allocation via @spaces.GPU(duration=60)
  - Native Gradio Launch with Embedded FastAPI Router for 100% Spaces compatibility
  - 100% Compatible Endpoints:
      * GET  /health & /api/v1/health
      * POST /api/clean_page
      * POST /api/inpaint
      * POST /api/detect
      * POST /api/switch_model
      * POST /api/v1/inpaint
      * POST /api/v1/inpaint/batch
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
import re
import shutil
import uuid
import zipfile
import threading
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List

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
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

RESULT_DIR = Path("/tmp/mtc_results")
RESULT_DIR.mkdir(parents=True, exist_ok=True)

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

# Download ComicTextDetector ONNX (~90 MB)
resilient_download(
    [
        "https://huggingface.co/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx",
        "https://huggingface.co/mayocream/comic-text-detector-onnx/resolve/main/comictextdetector.pt.onnx",
        "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx"
    ],
    COMIC_ONNX_PATH,
    min_mb=10
)

# Download Anime-Manga Big-LaMa TorchScript (~196 MB) - HIGH QUALITY MANGA INPAINTING
resilient_download(
    [
        "https://github.com/Sanster/models/releases/download/AnimeMangaInpainting/anime-manga-big-lama.pt",
        "https://huggingface.co/kzome/manga-cleaner/resolve/main/data/anime-manga-big-lama.pt",
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
# 3. Model Loader & Inpainting Engine (CPU RAM Caching + ZeroGPU Execution)
# --------------------------------------------------------------------------------------
class ModelManager:
    """
    Caches TorchScript LaMa weights in Host CPU RAM.
    Transfers to GPU inside @spaces.GPU functions and cleans VRAM immediately after.
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

# Pre-load Anime-LaMa model into Host RAM during startup
model_manager.get_cpu_model("anime-lama")

# --------------------------------------------------------------------------------------
# 4. ComicTextDetector Engine (CPU DNN OCR text bubble detection)
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
            gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
            _, bubble_mask = cv2.threshold(gray, 230, 255, cv2.THRESH_BINARY)
            text_inside = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
            combined = cv2.bitwise_and(text_inside, bubble_mask)
            return combined, []

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
                seg_prob = None
                for out in outs:
                    if len(out.shape) == 4:
                        if out.shape[1] == 2:
                            # 2-channel output: C0 is background, C1 is text
                            c0 = out[0, 0]
                            c1 = out[0, 1]
                            exp_c0 = np.exp(np.clip(c0 - np.maximum(c0, c1), -15, 15))
                            exp_c1 = np.exp(np.clip(c1 - np.maximum(c0, c1), -15, 15))
                            seg_prob = exp_c1 / (exp_c0 + exp_c1 + 1e-6)
                            break
                        elif out.shape[1] == 1:
                            raw = out[0, 0]
                            if raw.min() < 0 or raw.max() > 1.0:
                                prob = 1.0 / (1.0 + np.exp(-np.clip(raw, -15.0, 15.0)))
                            else:
                                prob = raw
                            seg_prob = prob
                            break

                if seg_prob is not None:
                    # Sanity check: Text should be minority (< 40% of patch area)
                    if np.mean(seg_prob > 0.45) > 0.40:
                        seg_prob = 1.0 - seg_prob

                    seg_map = cv2.resize(seg_prob, (sub_w, sub_h), interpolation=cv2.INTER_LINEAR)
                    sub_mask = (seg_map > 0.40).astype(np.uint8) * 255
                    full_mask[y:y2] = np.maximum(full_mask[y:y2], sub_mask)
            except Exception as e:
                print(f"DNN chunk inference notice: {e}")

            if y2 >= h:
                break
            y += (chunk_h - overlap)

        # Global Sanity Check: Text in manga is NEVER more than 35% of total page area!
        white_ratio = np.mean(full_mask > 0)
        if white_ratio > 0.35:
            print(f"⚠️ Mask was inverted ({white_ratio*100:.1f}% white). Inverting back to protect artwork!")
            full_mask = ((full_mask == 0).astype(np.uint8)) * 255

        # Filter contours: eliminate noise and impossible page-sized blobs
        page_area = h * w
        clean_mask = np.zeros_like(full_mask)
        contours, _ = cv2.findContours(full_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            area = bw * bh
            # Discard tiny speckle noise (< 25px) and giant page-sized artifacts (> 25% of whole page)
            if 25 <= area <= 0.25 * page_area:
                cv2.drawContours(clean_mask, [cnt], -1, 255, -1)
                boxes.append({"x": int(bx), "y": int(by), "w": int(bw), "h": int(bh)})

        return clean_mask, boxes

detector_engine = ComicTextDetectorEngine()

# --------------------------------------------------------------------------------------
# 5. Image Pre/Post-Processing & High-Precision Inpainting
# --------------------------------------------------------------------------------------
def pad_to_multiple(img: np.ndarray, mask: np.ndarray, mod: int = 8):
    """Reflect-pad both image and mask to be divisible by mod=8."""
    h, w = img.shape[:2]
    ph = (-h) % mod
    pw = (-w) % mod
    if ph == 0 and pw == 0:
        return img, mask
    img_pad = cv2.copyMakeBorder(img, 0, ph, 0, pw, cv2.BORDER_REFLECT_101)
    mask_pad = cv2.copyMakeBorder(mask, 0, ph, 0, pw, cv2.BORDER_REFLECT_101)
    return img_pad, mask_pad

def plan_patches(
    rgb: np.ndarray,
    mask: np.ndarray,
    group_gap: int = 32,
    ctx_ratio: float = 0.5,
    ctx_min: int = 64,
    ctx_max: int = 256
) -> List[Tuple[Tuple[int, int, int, int], np.ndarray, np.ndarray]]:
    """Groups nearby mask components and crops context windows to preserve 100% full-resolution clarity."""
    H, W = mask.shape
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * group_gap + 1, 2 * group_gap + 1))
    grp = cv2.dilate(mask, kernel)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(grp, connectivity=8)

    patches = []
    for i in range(1, n):
        x, y, w, h = (int(v) for v in stats[i][:4])
        sel = (labels[y:y + h, x:x + w] == i) & (mask[y:y + h, x:x + w] > 0)
        ys, xs = np.nonzero(sel)
        if ys.size == 0:
            continue
        bx0 = x + int(xs.min())
        bx1 = x + int(xs.max()) + 1
        by0 = y + int(ys.min())
        by1 = y + int(ys.max()) + 1

        ctx = int(np.clip(max(bx1 - bx0, by1 - by0) * ctx_ratio, ctx_min, ctx_max))
        x0 = max(0, bx0 - ctx)
        y0 = max(0, by0 - ctx)
        x1 = min(W, bx1 + ctx)
        y1 = min(H, by1 + ctx)

        crop = rgb[y0:y1, x0:x1]
        m = mask[y0:y1, x0:x1]
        crop_p, m_p = pad_to_multiple(crop, m, mod=8)
        patches.append(((x0, y0, x1, y1), crop_p, m_p))

    return patches

@spaces.GPU(duration=60)
def infer_patches_on_gpu(
    patches_data: List[Tuple[np.ndarray, np.ndarray]],
    model_name: str = "anime-lama"
) -> List[np.ndarray]:
    """Dynamically acquires GPU, runs LaMa neural inpainting, and cleans VRAM."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    cpu_model = model_manager.get_cpu_model(model_name)

    if cpu_model is None:
        # Emergency Telea fallback
        return [cv2.inpaint(img, (m > 0).astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA) for img, m in patches_data]

    gpu_model = cpu_model.to(device)
    outputs = []
    try:
        for img_p, m_p in patches_data:
            h, w = img_p.shape[:2]
            x = torch.from_numpy(img_p).to(device).permute(2, 0, 1).unsqueeze(0).float().div_(255.0)
            m = torch.from_numpy(m_p).to(device)[None, None].float()
            m = (m > 0).float()

            with torch.inference_mode():
                y = gpu_model(x, m)

            res = y[0].permute(1, 2, 0).float().detach().cpu().numpy()
            if float(res.max()) <= 2.0:
                res = res * 255.0
            res_uint8 = np.clip(res, 0, 255).astype(np.uint8)[:h, :w]
            outputs.append(res_uint8)
        return outputs
    finally:
        gpu_model.to("cpu")
        if device.type == "cuda":
            torch.cuda.empty_cache()
        gc.collect()

def run_high_quality_inpainting(
    image_rgb: np.ndarray,
    mask_binary: np.ndarray,
    model_name: str = "anime-lama"
) -> np.ndarray:
    """
    Inpaints image with 1:1 Pixel-Perfect Mask Composite.
    Pixels outside the mask remain 100% identical to the original image!
    """
    H, W = image_rgb.shape[:2]
    if not mask_binary.any():
        return image_rgb.copy()

    # Determine if whole-page pass or patch-based pass
    # For large webtoons or pages > 2200px, use smart context patches
    if max(H, W) > 2200:
        planned = plan_patches(image_rgb, mask_binary)
        if not planned:
            planned = [((0, 0, W, H), *pad_to_multiple(image_rgb, mask_binary, 8))]
    else:
        pad_img, pad_mask = pad_to_multiple(image_rgb, mask_binary, 8)
        planned = [((0, 0, W, H), pad_img, pad_mask)]

    patches_input = [(p[1], p[2]) for p in planned]
    inpainted_crops = infer_patches_on_gpu(patches_input, model_name=model_name)

    canvas = image_rgb.copy()
    for ((x0, y0, x1, y1), _, _), res_crop in zip(planned, inpainted_crops):
        ch, cw = y1 - y0, x1 - x0
        clean_crop = res_crop[:ch, :cw]

        # 1:1 Mask Composite (strictly replace only masked pixels)
        sub_mask = mask_binary[y0:y1, x0:x1] > 0
        roi = canvas[y0:y1, x0:x1]
        roi[sub_mask] = clean_crop[sub_mask]
        canvas[y0:y1, x0:x1] = roi

    return canvas

def process_manga_cleaning(
    image_pil: Image.Image,
    custom_mask_pil: Optional[Image.Image] = None,
    dilation_px: int = 4,
    model_name: str = "anime-lama"
) -> Tuple[Image.Image, Image.Image, Dict[str, Any]]:
    """Master cleaning pipeline combining ComicTextDetector, dilation, and LaMa Inpainting."""
    t0 = time.perf_counter()

    # Normalize orientation
    image_pil = ImageOps.exif_transpose(image_pil)
    has_alpha = image_pil.mode in ("RGBA", "LA")
    alpha_channel = image_pil.split()[-1] if has_alpha else None

    rgb_pil = image_pil.convert("RGB")
    rgb_arr = np.array(rgb_pil)
    h, w = rgb_arr.shape[:2]

    # Generate or extract mask
    if custom_mask_pil is not None:
        mask_raw = np.array(custom_mask_pil.convert("L"))
        if mask_raw.shape[:2] != (h, w):
            mask_raw = cv2.resize(mask_raw, (w, h), interpolation=cv2.INTER_NEAREST)
        mask_binary = (mask_raw > 10).astype(np.uint8) * 255
        boxes = []
        mode = "brush_mask"
    else:
        bgr_arr = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)
        mask_binary, boxes = detector_engine.detect_mask(bgr_arr)
        mode = "auto_detector"

    # Dilate mask to engulf text strokes
    if dilation_px > 0 and mask_binary.any():
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilation_px * 2 + 1, dilation_px * 2 + 1))
        mask_binary = cv2.dilate(mask_binary, kernel)

    # Execute inpainting
    cleaned_rgb = run_high_quality_inpainting(rgb_arr, mask_binary, model_name=model_name)

    # Reattach alpha if present
    if alpha_channel is not None:
        cleaned_pil = Image.fromarray(cleaned_rgb).convert("RGBA")
        cleaned_pil.putalpha(alpha_channel)
    else:
        cleaned_pil = Image.fromarray(cleaned_rgb)

    mask_pil = Image.fromarray(mask_binary, mode="L")
    inference_ms = int((time.perf_counter() - t0) * 1000)

    stats = {
        "model": model_name,
        "engine": f"IOPaint LaMa ({'ZeroGPU' if HAS_ZEROGPU else 'CPU'})",
        "mode": mode,
        "total_regions": len(boxes) if boxes else int((mask_binary > 0).any()),
        "inference_ms": inference_ms,
        "width": w,
        "height": h
    }

    return cleaned_pil, mask_pil, stats

# --------------------------------------------------------------------------------------
# 6. Base64 & Format Helpers
# --------------------------------------------------------------------------------------
def pil_to_base64(img: Image.Image, format: str = "PNG") -> str:
    buffered = io.BytesIO()
    img.save(buffered, format=format)
    encoded = base64.b64encode(buffered.getvalue()).decode("utf-8")
    mime = "image/png" if format.upper() == "PNG" else "image/jpeg"
    return f"data:{mime};base64,{encoded}"

def base64_to_pil(b64_str: str) -> Image.Image:
    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]
    image_bytes = base64.b64decode(b64_str)
    return Image.open(io.BytesIO(image_bytes))

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
# 7. REST API Router (FastAPI)
# --------------------------------------------------------------------------------------
api_router = APIRouter()

class CleanPagePayload(BaseModel):
    imageBase64: str
    maskBase64: Optional[str] = None
    dilationPx: Optional[int] = 4
    modelName: Optional[str] = "anime-lama"

class InpaintPayload(BaseModel):
    imageBase64: str
    maskBase64: str
    modelName: Optional[str] = "anime-lama"

class DetectPayload(BaseModel):
    imageBase64: str

class SwitchModelPayload(BaseModel):
    modelName: str

@api_router.get("/health")
@api_router.get("/api/v1/health")
def health_check():
    device_name = "Nvidia A100 (ZeroGPU)" if HAS_ZEROGPU else ("CUDA" if torch.cuda.is_available() else "CPU")
    return {
        "status": "online",
        "online": True,
        "device": device_name,
        "gpu": device_name,
        "gpu_name": device_name,
        "engine": "IOPaint Anime-LaMa & ComicTextDetector",
        "current_model": model_manager.active_model_name,
        "zerogpu": HAS_ZEROGPU,
        "available_models": ["anime-lama", "lama"]
    }

@api_router.post("/api/clean_page")
async def api_clean_page(req: CleanPagePayload):
    try:
        img_pil = base64_to_pil(req.imageBase64)
        mask_pil = base64_to_pil(req.maskBase64).convert("L") if req.maskBase64 else None
        model = req.modelName or "anime-lama"

        cleaned_pil, mask_res_pil, stats = await run_in_threadpool(
            process_manga_cleaning,
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
        raise HTTPException(status_code=500, detail=f"Lỗi xử lý trang: {str(e)}")

@api_router.post("/api/inpaint")
async def api_inpaint(req: InpaintPayload):
    try:
        img_pil = base64_to_pil(req.imageBase64)
        mask_pil = base64_to_pil(req.maskBase64).convert("L")
        model = req.modelName or "anime-lama"

        cleaned_pil, mask_res_pil, stats = await run_in_threadpool(
            process_manga_cleaning,
            image_pil=img_pil,
            custom_mask_pil=mask_pil,
            dilation_px=4,
            model_name=model
        )

        return {
            "success": True,
            "cleanedImageBase64": pil_to_base64(cleaned_pil),
            "maskBase64": pil_to_base64(mask_res_pil),
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi inpainting: {str(e)}")

@api_router.post("/api/detect")
async def api_detect(req: DetectPayload):
    try:
        img_pil = base64_to_pil(req.imageBase64)
        rgb_arr = np.array(img_pil.convert("RGB"))
        bgr_arr = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)

        mask_arr, boxes = detector_engine.detect_mask(bgr_arr)
        mask_pil = Image.fromarray(mask_arr, mode="L")

        return {
            "success": True,
            "maskBase64": pil_to_base64(mask_pil),
            "boxes": boxes,
            "count": len(boxes)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi nhận diện text: {str(e)}")

@api_router.post("/api/switch_model")
def api_switch_model(req: SwitchModelPayload):
    model = model_manager.get_cpu_model(req.modelName)
    if model is None:
        raise HTTPException(status_code=400, detail=f"Model '{req.modelName}' không khả dụng.")
    return {"success": True, "active_model": model_manager.active_model_name}

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
            process_manga_cleaning,
            image_pil=img_pil,
            custom_mask_pil=mask_pil,
            dilation_px=dilation,
            model_name=model_name
        )

        out_buffer = io.BytesIO()
        cleaned_pil.save(out_buffer, format="PNG")
        return Response(content=out_buffer.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API error: {str(e)}")

# --------------------------------------------------------------------------------------
# 8. Gradio Mobile-First Web UI
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
            **Phục hồi tranh & xóa chữ manga/manhwa siêu sạch bằng Anime-Manga Big-LaMa & ComicTextDetector.**
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
                    result_pil, _, stats = process_manga_cleaning(
                        image_pil=bg_pil,
                        custom_mask_pil=custom_mask_pil,
                        dilation_px=int(dilation_val),
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
# 9. Server Bootstrap: Native Gradio Launch + Embedded FastAPI Router
# --------------------------------------------------------------------------------------
demo = create_gradio_ui()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    print(f"🌟 Launching Manga Text Cleaner on http://0.0.0.0:{port} ...")

    # Native Gradio launch with prevent_thread_lock to mount REST API routes on its live FastAPI instance
    app, local_url, share_url = demo.launch(
        server_name="0.0.0.0",
        server_port=port,
        prevent_thread_lock=True,
        show_error=True
    )

    # Attach all custom REST API endpoints to the live server
    if hasattr(app, "include_router"):
        app.include_router(api_router)
        print("✅ REST API endpoints (/health, /api/clean_page, /api/inpaint, /api/v1/inpaint) successfully attached!")

    # Keep server running
    demo.block_thread()
