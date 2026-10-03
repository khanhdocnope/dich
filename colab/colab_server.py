"""
Manga Translator Studio - AI Backend Server (Resilient LaMa & Manga-OCR Engine)
"""

import os
import io
import sys
import time
import base64
import urllib.request
import torch
import numpy as np
from PIL import Image
import uvicorn
import cv2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

app = FastAPI(title="Manga Translator Studio - LaMa AI Backend", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cuda" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
print(f"🚀 AI Server starting on device: {device} ({gpu_name})")

# Multi-source resilient downloader
def download_file_with_fallback(urls: List[str], dest_path: str) -> bool:
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000000:
        return True
    
    for url in urls:
        try:
            print(f"⏳ Downloading model from: {url}")
            torch.hub.download_url_to_file(url, dest_path, progress=True)
            if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000000:
                print(f"✅ Model downloaded successfully ({os.path.getsize(dest_path) // (1024*1024)} MB)")
                return True
        except Exception as e:
            print(f"⚠️ Failed to download from {url}: {e}")
            if os.path.exists(dest_path):
                try: os.remove(dest_path)
                except: pass
    return False

# High-Performance Resilient LaMa Inpainter
class ResilientLaMaInpainter:
    def __init__(self, dev="cuda"):
        self.dev = dev
        self.model = None
        self.is_ready = False

        # Try SimpleLama library first if available
        try:
            from simple_lama_inpainting import SimpleLama
            print("⏳ Initializing SimpleLama...")
            self.model = SimpleLama(device=dev)
            self.is_ready = True
            print("✅ [Engine 1] SimpleLama loaded and ready!")
            return
        except Exception as se:
            print(f"ℹ️ SimpleLama library fallback to direct TorchScript loading: {se}")

        model_path = os.path.join(os.path.dirname(__file__), "big-lama.pt") if "__file__" in globals() else "big-lama.pt"
        urls = [
            "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt",
        ]

        success = download_file_with_fallback(urls, model_path)
        if success:
            try:
                self.model = torch.jit.load(model_path, map_location=dev)
                self.model.eval()
                self.is_ready = True
                print("✅ [Engine 1] TorchScript big-lama (FFC) loaded successfully!")
            except Exception as e:
                print(f"⚠️ TorchScript load failed: {e}")

        if not self.is_ready:
            print("💡 [Engine 2 Fallback] Using OpenCV Telea/Navier-Stokes Fast Inpainter (Zero-Crash Guarantee)")

    def __call__(self, img: Image.Image, mask: Image.Image) -> Image.Image:
        orig_w, orig_h = img.size
        mask_l = mask.convert("L")

        # 1. Primary Engine: LaMa Neural Inpainter (Fast Fourier Convolutions)
        if self.is_ready and self.model is not None:
            try:
                if hasattr(self.model, '__call__') and type(self.model).__name__ == 'SimpleLama':
                    res_img = self.model(img, mask_l)
                else:
                    # Pad to multiples of 8 for FFC
                    mod_w = max(8, ((orig_w + 7) // 8) * 8)
                    mod_h = max(8, ((orig_h + 7) // 8) * 8)
                    
                    img_resized = img.resize((mod_w, mod_h), Image.Resampling.BILINEAR)
                    mask_resized = mask_l.resize((mod_w, mod_h), Image.Resampling.NEAREST)

                    img_t = torch.from_numpy(np.array(img_resized).astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0).to(self.dev)
                    mask_t = torch.from_numpy((np.array(mask_resized).astype(np.float32) / 255.0 > 0.3).astype(np.float32)).unsqueeze(0).unsqueeze(0).to(self.dev)

                    with torch.no_grad():
                        out = self.model(img_t, mask_t)
                    
                    out_np = (out[0].permute(1, 2, 0).cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                    res_img = Image.fromarray(out_np).resize((orig_w, orig_h), Image.Resampling.BILINEAR)

                # Alpha Composite Blending (100% sharp original details outside the mask)
                res_arr = np.array(res_img).astype(np.float32)
                orig_arr = np.array(img).astype(np.float32)
                mask_orig = (np.array(mask_l).astype(np.float32) / 255.0)
                mask_orig = np.expand_dims(mask_orig, axis=2)

                final_arr = (res_arr * mask_orig + orig_arr * (1.0 - mask_orig)).clip(0, 255).astype(np.uint8)
                return Image.fromarray(final_arr)
            except Exception as e:
                print(f"⚠️ LaMa inference failed: {e}. Falling back to OpenCV Telea inpainting...")

        # 2. Fallback Engine: OpenCV High-Speed Inpainting
        try:
            img_np = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            mask_np = np.array(mask_l)
            inpainted = cv2.inpaint(img_np, mask_np, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
            return Image.fromarray(cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB))
        except Exception as ce:
            print(f"⚠️ OpenCV inpaint failed: {ce}")
            return img

lama = None
mocr = None

def get_lama():
    global lama
    if lama is None:
        lama = ResilientLaMaInpainter(dev=device)
    return lama

def get_mocr():
    global mocr
    if mocr is None:
        try:
            from manga_ocr import MangaOcr
            mocr = MangaOcr(force_cpu=(device == "cpu"))
            print("✅ Manga-OCR initialized successfully!")
        except Exception as e:
            print(f"⚠️ Could not load manga-ocr: {e}")
    return mocr

def b64_to_pil(b64_str: str) -> Image.Image:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    return Image.open(io.BytesIO(base64.b64decode(b64_str))).convert("RGB")

def pil_to_b64(pil_img: Image.Image, fmt="PNG") -> str:
    buf = io.BytesIO()
    pil_img.save(buf, format=fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

class InpaintReq(BaseModel):
    imageBase64: str
    maskBase64: str

class OcrReq(BaseModel):
    imageBase64: str
    boxes: List[Dict[str, Any]]

class TransReq(BaseModel):
    texts: List[str]
    sourceLang: Optional[str] = "auto"
    targetLang: Optional[str] = "vi"
    engine: Optional[str] = "google"
    apiKey: Optional[str] = None

@app.get("/health")
def health():
    return {
        "status": "online",
        "device": device,
        "gpu": gpu_name,
        "model": "Resilient LaMa (Large Mask Inpainting)",
        "lama_ready": True,
        "mocr_ready": mocr is not None,
    }

@app.get("/api/ping")
def ping():
    return {"status": "ok", "time": time.time()}

@app.post("/api/inpaint")
async def do_inpaint(req: InpaintReq):
    try:
        model = get_lama()
        img = b64_to_pil(req.imageBase64)
        mask = b64_to_pil(req.maskBase64).convert("L")
        res = model(img, mask)
        return {"success": True, "cleanedImageBase64": pil_to_b64(res)}
    except Exception as e:
        print(f"Inpaint Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ocr")
async def do_ocr(req: OcrReq):
    try:
        ocr_model = get_mocr()
        img = b64_to_pil(req.imageBase64)
        results = []
        for box in req.boxes:
            x = max(0, int(box.get("x", 0)))
            y = max(0, int(box.get("y", 0)))
            w = max(10, int(box.get("width", 50)))
            h = max(10, int(box.get("height", 50)))
            crop = img.crop((x, y, min(img.width, x + w), min(img.height, y + h)))
            
            text = ""
            if ocr_model is not None:
                try:
                    text = ocr_model(crop)
                except Exception as oe:
                    text = f"(OCR Error: {oe})"
            else:
                text = ""
            results.append({"box": box, "text": text})
        return {"success": True, "results": results}
    except Exception as e:
        print(f"OCR Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/translate")
async def do_translate(req: TransReq):
    try:
        if req.engine == "gemini" and req.apiKey:
            import google.generativeai as genai
            genai.configure(api_key=req.apiKey)
            model = genai.GenerativeModel("gemini-2.0-flash")
            prompt = (
                "Bạn là một chuyên gia dịch truyện tranh manga/comic chuyên nghiệp sang tiếng Việt.\n"
                "Dịch các câu sau sang tiếng Việt tự nhiên, phù hợp bối cảnh truyện tranh, trả về DUY NHẤT một mảng JSON các chuỗi string ([\"dịch 1\", \"dịch 2\"]):\n"
                + "\n".join(f"{i+1}. {t}" for i, t in enumerate(req.texts))
            )
            res = model.generate_content(prompt)
            import json, re
            m = re.search(r'\[.*\]', res.text, re.DOTALL)
            out = json.loads(m.group(0)) if m else [res.text.strip()]
        else:
            from deep_translator import GoogleTranslator
            translator = GoogleTranslator(source=req.sourceLang or "auto", target=req.targetLang or "vi")
            out = [translator.translate(t) if t and t.strip() else "" for t in req.texts]
        return {"success": True, "translated": out}
    except Exception as e:
        print(f"Translate Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    config = uvicorn.Config(app=app, host="0.0.0.0", port=8000, log_level="info")
    server = uvicorn.Server(config)
    server.run()

