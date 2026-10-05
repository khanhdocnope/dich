"""
Manga Translator Studio - Core AI Inpainting & Cleaner Engine
Features:
  - 4-Stage Pipeline: ComicTextDetector + Dilation + LaMa FFC Inpainting + 1:1 Composite
  - Built-in High-Performance HTML5 Web UI (Zero Gradio/HuggingFace dependencies, zero conflicts)
  - Interactive Canvas: Custom mask brush / eraser or 1-Click Auto Clean if left empty
  - Before / After interactive comparison slider
  - Google Drive & Local Directory Batch Processing with real-time progress & gallery
  - Full REST API for Studio Web App & APK (/api/clean_page, /api/inpaint, /api/detect, /health)
"""

from __future__ import annotations

import os
import sys
import time
import io
import re
import json
import argparse
import base64
import threading
import subprocess
from typing import List, Optional, Dict, Any, Tuple

import cv2
import numpy as np
from PIL import Image
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Initialize FastAPI App
app = FastAPI(title="Manga Translator Studio - LaMa & ComicTextCleaner Engine", version="5.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# Device & Model Paths
# -------------------------------------------------------------
import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU (Fallback)"
print(f"🚀 AI Server starting on device: {device.upper()} ({gpu_name})")

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
MODEL_DIR = os.path.join(HERE, "models")
os.makedirs(MODEL_DIR, exist_ok=True)

COMIC_ONNX_PATH = os.path.join(MODEL_DIR, "comictextdetector.pt.onnx")
LAMA_PT_PATH = os.path.join(MODEL_DIR, "big-lama.pt")

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
                try: os.remove(dest)
                except: pass
    return False

# Download models using direct HTTPS mirrors (Zero huggingface_hub python package dependency)
comic_urls = [
    "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx",
    "https://huggingface.co/kzome/manga-cleaner/resolve/main/data/comictextdetector.pt.onnx",
    "https://huggingface.co/mayocream/comic-text-detector-onnx/resolve/main/comictextdetector.pt.onnx"
]
download_resilient(comic_urls, COMIC_ONNX_PATH, 10)

lama_urls = [
    "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt",
    "https://hf-mirror.com/kzome/manga-cleaner/resolve/main/data/big-lama.pt",
    "https://huggingface.co/kzome/manga-cleaner/resolve/main/data/big-lama.pt"
]
download_resilient(lama_urls, LAMA_PT_PATH, 50)

# -------------------------------------------------------------
# Stage 3: LaMa Inpainting Engine (FFC TorchScript)
# -------------------------------------------------------------
class LaMaEngine:
    def __init__(self, model_path: str = LAMA_PT_PATH, dev: str = device):
        self.dev = dev
        self.model = None
        self.ready = False
        if os.path.exists(model_path) and os.path.getsize(model_path) > 10000000:
            try:
                self.model = torch.jit.load(model_path, map_location=dev)
                self.model.eval()
                self.ready = True
                print(f"✅ LaMa FFC Inpainter loaded successfully on {dev.upper()}!")
            except Exception as e:
                print(f"⚠️ Failed to load TorchScript LaMa: {e}")

    def __call__(self, img: Image.Image, mask: Image.Image) -> Image.Image:
        orig_w, orig_h = img.size
        mask_l = mask.convert("L")

        if self.ready and self.model is not None:
            try:
                mod_w = max(8, ((orig_w + 7) // 8) * 8)
                mod_h = max(8, ((orig_h + 7) // 8) * 8)

                img_resized = img.resize((mod_w, mod_h), Image.Resampling.BILINEAR)
                mask_resized = mask_l.resize((mod_w, mod_h), Image.Resampling.NEAREST)

                img_t = torch.from_numpy(np.array(img_resized).astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0).to(self.dev)
                mask_t = torch.from_numpy((np.array(mask_resized).astype(np.float32) / 255.0 > 0.2).astype(np.float32)).unsqueeze(0).unsqueeze(0).to(self.dev)

                with torch.inference_mode():
                    out = self.model(img_t, mask_t)

                out_np = (out[0].permute(1, 2, 0).detach().cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                res_img = Image.fromarray(out_np).resize((orig_w, orig_h), Image.Resampling.BILINEAR)

                # Stage 4: 1:1 Pixel-Perfect Alpha Composite
                res_arr = np.array(res_img).astype(np.float32)
                orig_arr = np.array(img).astype(np.float32)
                mask_arr = np.expand_dims(np.array(mask_l).astype(np.float32) / 255.0, axis=2)

                final_arr = (res_arr * mask_arr + orig_arr * (1.0 - mask_arr)).clip(0, 255).astype(np.uint8)
                return Image.fromarray(final_arr)
            except Exception as e:
                print(f"⚠️ LaMa inference warning: {e}. Falling back to OpenCV Telea...")

        # Fallback Engine (Zero Crash)
        img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        mask_cv = np.array(mask_l)
        inpainted = cv2.inpaint(img_cv, mask_cv, inpaintRadius=5, flags=cv2.INPAINT_TELEA)
        return Image.fromarray(cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB))

# -------------------------------------------------------------
# Stage 1 & 2: ComicTextDetector & Dilation Engine
# -------------------------------------------------------------
class ComicTextDetectorEngine:
    def __init__(self, model_path: str = COMIC_ONNX_PATH):
        self.model_path = model_path
        self.session = None
        self.net = None
        self.input_name = None
        self.ready = False

        if os.path.exists(model_path):
            # 1. Try ONNX Runtime first (High-speed, robust)
            try:
                import onnxruntime as ort
                available_providers = ort.get_available_providers()
                providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if 'CUDAExecutionProvider' in available_providers else ['CPUExecutionProvider']
                self.session = ort.InferenceSession(model_path, providers=providers)
                self.input_name = self.session.get_inputs()[0].name
                self.ready = True
                print(f"✅ ComicTextDetector (ONNX Runtime) initialized: {providers}")
            except Exception:
                pass

            # 2. Fallback to OpenCV DNN (Zero crash CPU fallback)
            if not self.ready:
                try:
                    self.net = cv2.dnn.readNetFromONNX(model_path)
                    if hasattr(cv2, 'cuda') and cv2.cuda.getCudaEnabledDeviceCount() > 0:
                        try:
                            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
                            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
                        except Exception:
                            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                    else:
                        self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                        self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                    self.ready = True
                    print(f"✅ ComicTextDetector (OpenCV DNN CPU) initialized successfully!")
                except Exception as e:
                    print(f"⚠️ ComicTextDetector init notice: {e}")

    def detect_mask(self, img_bgr: np.ndarray, input_size: int = 1024) -> Tuple[np.ndarray, List[Dict[str, int]]]:
        h, w = img_bgr.shape[:2]
        full_mask = np.zeros((h, w), dtype=np.uint8)
        boxes = []

        if not self.ready or (self.session is None and self.net is None):
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
            try:
                if self.session is not None:
                    outs = self.session.run(None, {self.input_name: blob})
                else:
                    self.net.setInput(blob)
                    outs = self.net.forward(self.net.getUnconnectedOutLayersNames())

                for out in outs:
                    if len(out.shape) == 4 and out.shape[1] == 1:
                        mask_out = out[0, 0]
                        mask_res = cv2.resize(mask_out, (sub_w, sub_h), interpolation=cv2.INTER_LINEAR)
                        binary = (mask_res > 0.3).astype(np.uint8) * 255
                        full_mask[y:y2] = np.maximum(full_mask[y:y2], binary)
                    elif len(out.shape) == 4 and out.shape[1] == 2:
                        prob = out[0, 0] if out[0, 0].max() > 0.5 else out[0, 1]
                        mask_res = cv2.resize(prob, (sub_w, sub_h), interpolation=cv2.INTER_LINEAR)
                        binary = (mask_res > 0.3).astype(np.uint8) * 255
                        full_mask[y:y2] = np.maximum(full_mask[y:y2], binary)
            except Exception as e:
                print(f"Detection chunk error at y={y}: {e}")

            if y2 == h:
                break
            y = y2 - overlap

        contours, _ = cv2.findContours(full_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw > 10 and bh > 10:
                boxes.append({"x": int(bx), "y": int(by), "width": int(bw), "height": int(bh)})

        return full_mask, boxes

# -------------------------------------------------------------
# Global Cleaner Pipeline
# -------------------------------------------------------------
class MangaCleanerPipeline:
    def __init__(self):
        self.lama = LaMaEngine()
        self.detector = ComicTextDetectorEngine()

    def clean_image(
        self,
        img_pil: Image.Image,
        dilation_px: int = 4,
        flat_threshold: float = 3.5,
        merge_margin: int = 30,
        custom_mask: Optional[Image.Image] = None
    ) -> Tuple[Image.Image, Image.Image, Dict[str, Any]]:
        img_rgb = img_pil.convert("RGB")
        w, h = img_rgb.size
        img_bgr = cv2.cvtColor(np.array(img_rgb), cv2.COLOR_RGB2BGR)

        # 1. Determine Mask: Custom User Brush vs Auto Detector
        is_custom = False
        if custom_mask is not None:
            mask_arr = np.array(custom_mask.convert("L").resize((w, h), Image.Resampling.NEAREST))
            if mask_arr.max() > 20:
                raw_mask = (mask_arr > 20).astype(np.uint8) * 255
                is_custom = True
            else:
                raw_mask, _ = self.detector.detect_mask(img_bgr)
        else:
            raw_mask, _ = self.detector.detect_mask(img_bgr)

        # 2. Apply Morphological Dilation (2-4px anti-aliasing suppression)
        ksize = max(3, dilation_px * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
        dilated_mask = cv2.dilate(raw_mask, kernel)

        # 3. If Custom Brush: Run LaMa Inpainting on the custom areas
        if is_custom:
            res_pil = self.lama(img_rgb, Image.fromarray(dilated_mask))
            stats = {"flat": 0, "lama": 1, "total_regions": 1, "mode": "custom_brush"}
            return res_pil, Image.fromarray(dilated_mask), stats

        # 4. Auto Clean: Partition into Regions (Flat vs Complex Art)
        joined = cv2.dilate(dilated_mask, np.ones((merge_margin, merge_margin), np.uint8))
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(joined, connectivity=8)

        stats_counter = {"flat": 0, "lama": 0, "total_regions": max(0, num_labels - 1), "mode": "auto"}
        result_bgr = img_bgr.copy()

        for i in range(1, num_labels):
            rx, ry, rw, rh, area = stats[i]
            if area < 20:
                continue

            ctx = 20
            x1, y1 = max(0, rx - ctx), max(0, ry - ctx)
            x2, y2 = min(w, rx + rw + ctx), min(h, ry + rh + ctx)

            crop_img = result_bgr[y1:y2, x1:x2]
            crop_mask = dilated_mask[y1:y2, x1:x2]

            if not crop_mask.any():
                continue

            # Check if region is a flat speech bubble
            ring = cv2.dilate(crop_mask, np.ones((11, 11), np.uint8)) & cv2.bitwise_not(crop_mask)
            ring_pixels = crop_img[ring > 0]

            is_flat = False
            if len(ring_pixels) > 30 and ring_pixels.std(axis=0).max() < flat_threshold:
                is_flat = True

            if is_flat:
                # Flat Speech Bubble: Pure median fill (100% sharp)
                median_col = np.median(ring_pixels, axis=0).astype(np.uint8)
                crop_img[crop_mask > 0] = median_col
                stats_counter["flat"] += 1
            else:
                # Complex Screentone / SFX / Art: LaMa Inpainting Engine
                crop_pil = Image.fromarray(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB))
                mask_pil = Image.fromarray(crop_mask)
                res_pil = self.lama(crop_pil, mask_pil)
                res_bgr = cv2.cvtColor(np.array(res_pil), cv2.COLOR_BGR2RGB)

                crop_img[crop_mask > 0] = res_bgr[crop_mask > 0]
                stats_counter["lama"] += 1

            result_bgr[y1:y2, x1:x2] = crop_img

        final_pil = Image.fromarray(cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB))
        final_mask_pil = Image.fromarray(dilated_mask)

        return final_pil, final_mask_pil, stats_counter

cleaner_pipeline = MangaCleanerPipeline()

# -------------------------------------------------------------
# REST API Helpers & Models
# -------------------------------------------------------------
def b64_to_pil(b64_str: str) -> Image.Image:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    return Image.open(io.BytesIO(base64.b64decode(b64_str))).convert("RGB")

def pil_to_b64(pil_img: Image.Image, fmt="PNG") -> str:
    buf = io.BytesIO()
    pil_img.save(buf, format=fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

class CleanPageReq(BaseModel):
    imageBase64: str
    maskBase64: Optional[str] = None
    dilationPx: Optional[int] = 4
    flatThreshold: Optional[float] = 3.5
    mergeMargin: Optional[int] = 30

class InpaintReq(BaseModel):
    imageBase64: str
    maskBase64: str

class DetectReq(BaseModel):
    imageBase64: str

class BatchFolderReq(BaseModel):
    inputDir: str
    outputDir: str
    dilationPx: Optional[int] = 4
    flatThreshold: Optional[float] = 3.5

# Batch Progress State
batch_status = {
    "running": False,
    "current": 0,
    "total": 0,
    "currentFile": "",
    "logs": [],
    "sampleUrls": []
}

@app.get("/health")
def health():
    return {
        "status": "online",
        "device": device,
        "gpu": gpu_name,
        "engine": "LaMa FFC & ComicTextDetector",
        "lama_ready": cleaner_pipeline.lama.ready,
        "detector_ready": cleaner_pipeline.detector.ready,
    }

@app.get("/api/ping")
def ping():
    return {"status": "ok", "time": time.time()}

@app.post("/api/clean_page")
async def api_clean_page(req: CleanPageReq):
    try:
        img = b64_to_pil(req.imageBase64)
        custom_mask = b64_to_pil(req.maskBase64).convert("L") if req.maskBase64 else None
        cleaned_pil, mask_pil, stats = cleaner_pipeline.clean_image(
            img_pil=img,
            dilation_px=req.dilationPx or 4,
            flat_threshold=req.flatThreshold or 3.5,
            merge_margin=req.mergeMargin or 30,
            custom_mask=custom_mask
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

@app.post("/api/inpaint")
async def api_inpaint(req: InpaintReq):
    try:
        img = b64_to_pil(req.imageBase64)
        mask = b64_to_pil(req.maskBase64).convert("L")
        cleaned = cleaner_pipeline.lama(img, mask)
        return {
            "success": True,
            "cleanedImageBase64": pil_to_b64(cleaned)
        }
    except Exception as e:
        print(f"Inpaint Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/detect")
async def api_detect(req: DetectReq):
    try:
        img = b64_to_pil(req.imageBase64)
        img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        mask, boxes = cleaner_pipeline.detector.detect_mask(img_bgr)
        return {
            "success": True,
            "boxes": boxes,
            "maskBase64": pil_to_b64(Image.fromarray(mask))
        }
    except Exception as e:
        print(f"Detect Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------------------
# Batch Drive & Directory Runner
# -------------------------------------------------------------
def run_batch_thread(input_dir: str, output_dir: str, dilation: int = 4, flat_thresh: float = 3.5):
    global batch_status
    batch_status["running"] = True
    batch_status["logs"] = []
    batch_status["sampleUrls"] = []

    try:
        input_dir = input_dir.strip()
        output_dir = output_dir.strip()
        if not os.path.exists(input_dir):
            batch_status["logs"].append(f"❌ Không tìm thấy thư mục: '{input_dir}'")
            batch_status["running"] = False
            return

        os.makedirs(output_dir, exist_ok=True)
        valid_exts = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
        files = sorted([f for f in os.listdir(input_dir) if f.lower().endswith(valid_exts)])

        if not files:
            batch_status["logs"].append(f"⚠️ Không có ảnh nào trong thư mục '{input_dir}'")
            batch_status["running"] = False
            return

        batch_status["total"] = len(files)
        batch_status["logs"].append(f"📦 Bắt đầu xử lý {len(files)} trang truyện...")
        batch_status["logs"].append(f"📂 Nguồn: {input_dir}")
        batch_status["logs"].append(f"📂 Xuất: {output_dir}")

        for i, fname in enumerate(files, 1):
            batch_status["current"] = i
            batch_status["currentFile"] = fname
            in_path = os.path.join(input_dir, fname)
            out_path = os.path.join(output_dir, fname)
            t0 = time.time()
            try:
                img = Image.open(in_path)
                cleaned, _, stats = cleaner_pipeline.clean_image(
                    img,
                    dilation_px=dilation,
                    flat_threshold=flat_thresh
                )
                cleaned.save(out_path)
                sec = time.time() - t0
                batch_status["logs"].append(f"[{i}/{len(files)}] ✅ {fname} ({sec:.2f}s) - Thoại: {stats['flat']}, LaMa: {stats['lama']}")
                if len(batch_status["sampleUrls"]) < 8:
                    batch_status["sampleUrls"].append(pil_to_b64(cleaned.resize((200, int(200 * cleaned.height / cleaned.width)))))
            except Exception as e:
                batch_status["logs"].append(f"[{i}/{len(files)}] ❌ {fname} lỗi: {e}")

        batch_status["logs"].append(f"🎉 Đã hoàn tất xử lý {len(files)} trang vào '{output_dir}'!")
    finally:
        batch_status["running"] = False

@app.post("/api/batch_start")
async def api_batch_start(req: BatchFolderReq):
    global batch_status
    if batch_status["running"]:
        return {"success": False, "error": "Đang có tiến trình batch chạy ngầm!"}
    th = threading.Thread(
        target=run_batch_thread,
        args=(req.inputDir, req.outputDir, req.dilationPx or 4, req.flatThreshold or 3.5),
        daemon=True
    )
    th.start()
    return {"success": True, "message": "Đã khởi chạy tiến trình xử lý hàng loạt!"}

@app.get("/api/batch_status")
def api_batch_status():
    global batch_status
    return batch_status

# -------------------------------------------------------------
# Embedded Standalone HTML5 Web UI (Zero Gradio Dependency)
# -------------------------------------------------------------
WEB_UI_HTML = """<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manga Text Cleaner & Inpainting Studio (LaMa FFC)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0b0f19; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
    .split-container { position: relative; overflow: hidden; user-select: none; }
    .split-after { position: absolute; top: 0; left: 0; height: 100%; overflow: hidden; }
    .split-divider { position: absolute; top: 0; bottom: 0; width: 3px; background: #6366f1; cursor: ew-resize; z-index: 30; }
    .split-handle { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 28px; height: 28px; background: #6366f1; border-radius: 9999px; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold; box-shadow: 0 0 10px rgba(99,102,241,0.8); }
    .canvas-box { position: relative; display: inline-block; }
    .mask-overlay { position: absolute; top: 0; left: 0; pointer-events: none; opacity: 0.55; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <!-- Header -->
  <header class="bg-slate-900/90 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
    <div class="flex items-center space-x-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-500/20">🌸</div>
      <div>
        <h1 class="text-base font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">Manga Text Cleaner & Inpainting Studio</h1>
        <p class="text-[11px] text-slate-400">LaMa FFC & ComicTextDetector Engine</p>
      </div>
    </div>
    <div class="flex items-center space-x-2">
      <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span id="device-badge">AI Server Online</span>
      </span>
    </div>
  </header>

  <!-- Navigation Tabs -->
  <div class="bg-slate-900/50 border-b border-slate-800 px-6 flex space-x-4">
    <button onclick="switchTab('single')" id="tab-single" class="py-3 px-4 text-xs font-semibold border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-2">
      <span>🖌️</span> <span>Biên Tập & Xóa Đơn Trang (Interactive)</span>
    </button>
    <button onclick="switchTab('batch')" id="tab-batch" class="py-3 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2">
      <span>📂</span> <span>Xử Lý Hàng Loạt Từ Google Drive</span>
    </button>
    <button onclick="switchTab('api')" id="tab-api" class="py-3 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2">
      <span>🔗</span> <span>Kết Nối API Studio</span>
    </button>
  </div>

  <!-- Main Content -->
  <main class="flex-1 p-6 max-w-7xl mx-auto w-full">
    <!-- TAB 1: SINGLE PAGE INTERACTIVE -->
    <section id="sec-single" class="space-y-6">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <label class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs cursor-pointer transition shadow-lg shadow-indigo-600/20">
            📁 Tải Ảnh Manga Lên
            <input type="file" id="file-input" accept="image/*" class="hidden" onchange="loadImage(event)">
          </label>
          <span id="file-name" class="text-xs text-slate-400 italic">Chưa chọn ảnh</span>
        </div>

        <!-- Brush & Eraser Controls -->
        <div id="brush-controls" class="flex items-center space-x-3 hidden">
          <div class="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center space-x-1">
            <button onclick="setBrushMode('brush')" id="btn-brush" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white">🖌️ Cọ Tô</button>
            <button onclick="setBrushMode('eraser')" id="btn-eraser" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white">🧹 Cục Tẩy</button>
          </div>
          <div class="flex items-center space-x-2 text-xs text-slate-400">
            <span>Cỡ:</span>
            <input type="range" id="brush-size" min="10" max="100" value="35" class="w-20 accent-red-500">
            <span id="brush-size-val" class="font-mono text-white">35px</span>
          </div>
          <button onclick="clearMask()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold">Xóa nét vẽ</button>
        </div>

        <!-- Action Button -->
        <button onclick="processSingle()" id="btn-clean" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 flex items-center gap-2">
          <span>⚡</span> <span id="clean-btn-text">XÓA TEXT & KHÔI PHỤC CHI TIẾT</span>
        </button>
      </div>

      <!-- Hint Banner -->
      <div class="text-xs bg-indigo-950/40 border border-indigo-500/20 text-indigo-300 p-3 rounded-xl flex items-center justify-between">
        <span>💡 <b>Mẹo:</b> Bạn có thể dùng cọ khoanh vùng chữ cần xóa. <b>Nếu không vẽ gì</b>, AI sẽ <b>Tự Động Quét & Xóa Toàn Bộ Trang</b>!</span>
        <span id="single-status" class="font-semibold text-emerald-400"></span>
      </div>

      <!-- Canvas & Result Container -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Input Canvas Area -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[500px] overflow-auto">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 self-start">Trang Gốc & Vùng Chọn</h3>
          <div id="canvas-wrapper" class="canvas-box hidden">
            <canvas id="main-canvas" class="border border-slate-700 rounded-lg"></canvas>
            <canvas id="mask-canvas" class="mask-overlay"></canvas>
          </div>
          <div id="drop-hint" class="text-center p-8 space-y-2">
            <div class="w-16 h-16 mx-auto rounded-2xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-2xl">🖼️</div>
            <p class="text-xs text-slate-400">Chọn hoặc kéo thả ảnh truyện vào đây</p>
          </div>
        </div>

        <!-- Output / Before-After Comparison -->
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[500px] overflow-auto">
          <div class="flex items-center justify-between w-full mb-2">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Kết Quả So Sánh Trước / Sau</h3>
            <a id="download-link" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 hidden" download="cleaned_manga.png">💾 Tải ảnh sạch về</a>
          </div>
          <div id="split-box" class="split-container rounded-lg border border-slate-700 hidden">
            <img id="img-before" class="block max-w-full">
            <div id="split-after-wrap" class="split-after">
              <img id="img-after" class="block max-w-none">
            </div>
            <div id="split-divider" class="split-divider">
              <div class="split-handle">↔</div>
            </div>
          </div>
          <div id="output-placeholder" class="text-xs text-slate-500 italic">Kết quả khôi phục sẽ hiển thị tại đây</div>
        </div>
      </div>
    </section>

    <!-- TAB 2: GOOGLE DRIVE BATCH -->
    <section id="sec-batch" class="space-y-6 hidden">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 class="text-base font-bold text-white flex items-center gap-2"><span>📦</span> Dọn Sạch Toàn Bộ Chapter Từ Google Drive</h2>
        <p class="text-xs text-slate-400 leading-relaxed">
          Tự động duyệt qua toàn bộ các trang manga trong thư mục Google Drive, quét bong bóng thoại, nở biên triệt tiêu viền anti-aliasing và tái tạo nét vẽ bằng LaMa FFC.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Thư mục Input (Nguồn):</label>
            <input type="text" id="batch-input" value="/content/drive/MyDrive/Manga_Input" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-300 mb-1">Thư mục Output (Đích):</label>
            <input type="text" id="batch-output" value="/content/drive/MyDrive/Manga_Output" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono">
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <div class="flex items-center space-x-3 text-xs text-slate-400">
            <span>Nở biên (Dilation):</span>
            <input type="number" id="batch-dilation" value="4" min="2" max="8" class="w-14 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-center">
            <span>px</span>
          </div>
          <button onclick="startBatch()" id="btn-batch-start" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center gap-2">
            <span>🚀</span> <span>BẮT ĐẦU XỬ LÝ HÀNG LOẠT</span>
          </button>
        </div>
      </div>

      <!-- Batch Progress Console & Gallery -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[400px]">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">📋 Tiến Độ & Nhật Ký Xử Lý</h3>
          <div id="batch-console" class="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-emerald-400 overflow-y-auto space-y-1">
            <span class="text-slate-500">Chờ lệnh xử lý...</span>
          </div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[400px]">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">🖼️ Thư Viện Ảnh Mẫu Đã Xử Lý</h3>
          <div id="batch-gallery" class="flex-1 grid grid-cols-3 gap-2 overflow-y-auto p-1">
            <div class="col-span-3 text-center text-xs text-slate-500 py-12">Chưa có ảnh mẫu</div>
          </div>
        </div>
      </div>
    </section>

    <!-- TAB 3: API INFO -->
    <section id="sec-api" class="space-y-6 hidden">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 class="text-base font-bold text-white flex items-center gap-2"><span>🔗</span> Thông Tin Kết Nối REST API Cho Studio App / APK</h2>
        <p class="text-xs text-slate-300 leading-relaxed">
          Bạn có thể copy đường link URL public của Colab (Cloudflare / Ngrok) và dán thẳng vào nút <b>Colab GPU</b> trên Web App Studio (<code class="bg-slate-800 px-1 py-0.5 rounded text-indigo-300">http://localhost:5173</code>) hoặc APK điện thoại.
        </p>

        <div class="space-y-2 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-300">
          <div><b class="text-emerald-400">POST</b> /api/clean_page <span class="text-slate-500">// Quét và tự động làm sạch cả trang</span></div>
          <div><b class="text-emerald-400">POST</b> /api/inpaint <span class="text-slate-500">// Inpaint vùng chọn từ cọ vẽ</span></div>
          <div><b class="text-emerald-400">POST</b> /api/detect <span class="text-slate-500">// Lấy danh sách hộp thoại manga</span></div>
          <div><b class="text-indigo-400">GET</b>  /health <span class="text-slate-500">// Kiểm tra thiết bị & GPU status</span></div>
        </div>
      </div>
    </section>
  </main>

  <script>
    let currentRawBase64 = null;
    let brushMode = 'brush';
    let brushSize = 35;
    let isDrawing = false;
    let hasCustomMask = false;

    const mainCanvas = document.getElementById('main-canvas');
    const maskCanvas = document.getElementById('mask-canvas');
    const mctx = mainCanvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');

    // Tab Navigation
    function switchTab(tab) {
      ['single', 'batch', 'api'].forEach(t => {
        document.getElementById('sec-' + t).classList.toggle('hidden', t !== tab);
        const btn = document.getElementById('tab-' + t);
        if (t === tab) {
          btn.className = "py-3 px-4 text-xs font-semibold border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-2";
        } else {
          btn.className = "py-3 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2";
        }
      });
    }

    // Brush Controls
    function setBrushMode(mode) {
      brushMode = mode;
      document.getElementById('btn-brush').className = mode === 'brush' ? "px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white" : "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white";
      document.getElementById('btn-eraser').className = mode === 'eraser' ? "px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white" : "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white";
    }

    document.getElementById('brush-size').addEventListener('input', (e) => {
      brushSize = Number(e.target.value);
      document.getElementById('brush-size-val').innerText = brushSize + 'px';
    });

    function clearMask() {
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      hasCustomMask = false;
      document.getElementById('single-status').innerText = "";
    }

    // Load Image
    function loadImage(e) {
      const file = e.target.files[0];
      if (!file) return;
      document.getElementById('file-name').innerText = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          currentRawBase64 = event.target.result;
          const maxDim = 800;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          mainCanvas.width = w; mainCanvas.height = h;
          maskCanvas.width = w; maskCanvas.height = h;
          mctx.drawImage(img, 0, 0, w, h);
          maskCtx.clearRect(0, 0, w, h);

          document.getElementById('canvas-wrapper').classList.remove('hidden');
          document.getElementById('brush-controls').classList.remove('hidden');
          document.getElementById('drop-hint').classList.add('hidden');
          hasCustomMask = false;
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }

    // Canvas Drawing
    function getCoords(e) {
      const rect = maskCanvas.getBoundingClientRect();
      const scaleX = maskCanvas.width / rect.width;
      const scaleY = maskCanvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }

    maskCanvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      draw(e);
    });
    window.addEventListener('mouseup', () => { isDrawing = false; });
    maskCanvas.addEventListener('mousemove', draw);

    function draw(e) {
      if (!isDrawing) return;
      const { x, y } = getCoords(e);
      if (brushMode === 'eraser') {
        maskCtx.globalCompositeOperation = 'destination-out';
        maskCtx.beginPath();
        maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        maskCtx.fill();
      } else {
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.fillStyle = '#ef4444';
        maskCtx.beginPath();
        maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        maskCtx.fill();
        hasCustomMask = true;
      }
    }

    // Single Page Inpaint Execution
    async function processSingle() {
      if (!currentRawBase64) {
        alert("Vui lòng tải ảnh lên trước!");
        return;
      }
      const btn = document.getElementById('btn-clean');
      const btnText = document.getElementById('clean-btn-text');
      btn.disabled = true;
      btnText.innerText = "ĐANG XỬ LÝ (LAMA FFC)...";

      let maskBase64 = null;
      if (hasCustomMask) {
        // Convert to binary
        const binCanvas = document.createElement('canvas');
        binCanvas.width = maskCanvas.width; binCanvas.height = maskCanvas.height;
        const bctx = binCanvas.getContext('2d');
        bctx.fillStyle = '#000000';
        bctx.fillRect(0, 0, binCanvas.width, binCanvas.height);
        bctx.drawImage(maskCanvas, 0, 0);
        const idata = bctx.getImageData(0, 0, binCanvas.width, binCanvas.height);
        for (let i = 0; i < idata.data.length; i += 4) {
          if (idata.data[i + 3] > 20) {
            idata.data[i] = 255; idata.data[i+1] = 255; idata.data[i+2] = 255; idata.data[i+3] = 255;
          } else {
            idata.data[i] = 0; idata.data[i+1] = 0; idata.data[i+2] = 0; idata.data[i+3] = 255;
          }
        }
        bctx.putImageData(idata, 0, 0);
        maskBase64 = binCanvas.toDataURL('image/png');
      }

      try {
        const res = await fetch('/api/clean_page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: currentRawBase64,
            maskBase64: maskBase64,
            dilationPx: 4,
            flatThreshold: 3.5
          })
        });
        const data = await res.json();
        if (data.success) {
          showBeforeAfter(currentRawBase64, data.cleanedImageBase64);
          document.getElementById('single-status').innerText = hasCustomMask ? "✅ Đã inpaint vùng chọn cọ vẽ" : `✅ Auto xóa ${data.stats.total_regions} vùng thoại`;
        } else {
          alert("Lỗi: " + (data.detail || "Không thể xử lý ảnh"));
        }
      } catch (err) {
        alert("Lỗi kết nối tới AI: " + err);
      } finally {
        btn.disabled = false;
        btnText.innerText = "XÓA TEXT & KHÔI PHỤC CHI TIẾT";
      }
    }

    // Before / After Comparison Split View
    function showBeforeAfter(beforeUrl, afterUrl) {
      const box = document.getElementById('split-box');
      const imgB = document.getElementById('img-before');
      const imgA = document.getElementById('img-after');
      const dLink = document.getElementById('download-link');

      imgB.src = beforeUrl;
      imgA.src = afterUrl;
      dLink.href = afterUrl;
      dLink.classList.remove('hidden');

      imgB.onload = () => {
        imgA.style.width = imgB.clientWidth + 'px';
        imgA.style.height = imgB.clientHeight + 'px';
        setSplitPos(0.5);
      };

      box.classList.remove('hidden');
      document.getElementById('output-placeholder').classList.add('hidden');
    }

    function setSplitPos(pos) {
      const box = document.getElementById('split-box');
      const wrap = document.getElementById('split-after-wrap');
      const div = document.getElementById('split-divider');
      const w = box.clientWidth;
      const x = w * pos;
      wrap.style.width = x + 'px';
      div.style.left = x + 'px';
    }

    // Split drag handling
    let isSplitDragging = false;
    const splitDivider = document.getElementById('split-divider');
    splitDivider.addEventListener('mousedown', () => { isSplitDragging = true; });
    window.addEventListener('mouseup', () => { isSplitDragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!isSplitDragging) return;
      const box = document.getElementById('split-box');
      const rect = box.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setSplitPos(pos);
    });

    // Batch Drive Runner
    async function startBatch() {
      const inDir = document.getElementById('batch-input').value.trim();
      const outDir = document.getElementById('batch-output').value.trim();
      const dilation = Number(document.getElementById('batch-dilation').value) || 4;

      const res = await fetch('/api/batch_start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputDir: inDir, outputDir: outDir, dilationPx: dilation })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error);
        return;
      }
      pollBatchStatus();
    }

    function pollBatchStatus() {
      const interval = setInterval(async () => {
        const res = await fetch('/api/batch_status');
        const data = await res.json();
        const consoleEl = document.getElementById('batch-console');
        consoleEl.innerHTML = data.logs.map(l => `<div>${l}</div>`).join('');
        consoleEl.scrollTop = consoleEl.scrollHeight;

        if (data.sampleUrls && data.sampleUrls.length > 0) {
          const gallery = document.getElementById('batch-gallery');
          gallery.innerHTML = data.sampleUrls.map(u => `<img src="${u}" class="rounded-lg border border-slate-700 max-h-28 object-contain bg-black">`).join('');
        }

        if (!data.running) {
          clearInterval(interval);
        }
      }, 1500);
    }

    // Load server status
    fetch('/health').then(r => r.json()).then(d => {
      document.getElementById('device-badge').innerText = d.device.toUpperCase() + ' (' + d.gpu + ')';
    }).catch(() => {});
  </script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
def index_page():
    return HTMLResponse(content=WEB_UI_HTML)

# -------------------------------------------------------------
# CLI Entry Point
# -------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manga Cleaner & LaMa Inpainting Server")
    parser.add_argument("--batch", action="store_true", help="Run in Batch CLI mode")
    parser.add_argument("--input-dir", type=str, default="", help="Input directory for batch mode")
    parser.add_argument("--output-dir", type=str, default="", help="Output directory for batch mode")
    parser.add_argument("--port", type=int, default=8000, help="Server port")
    args = parser.parse_args()

    if args.batch:
        if not args.input_dir or not args.output_dir:
            print("❌ Error: --input-dir and --output-dir are required for batch mode!")
            sys.exit(1)
        run_batch_thread(args.input_dir, args.output_dir)
    else:
        config = uvicorn.Config(app=app, host="0.0.0.0", port=args.port, log_level="info")
        server = uvicorn.Server(config)
        server.run()
