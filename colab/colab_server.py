"""
Manga Translator Studio - AI Backend Server (v2.2 Daemon Thread)
"""

import os
import io
import sys
import base64
import urllib.request
import torch
import numpy as np
from PIL import Image
import uvicorn
import threading
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

app = FastAPI(title="Manga Translator Studio - AI Backend", version="2.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🔥 Running AI Server on device: {device}")

# Standalone LaMa Loader (TorchScript direct)
class StandaloneLama:
    def __init__(self, dev="cuda"):
        self.dev = torch.device(dev if torch.cuda.is_available() else "cpu")
        model_path = os.path.join(os.path.dirname(__file__), "big-lama.pt") if "__file__" in globals() else "big-lama.pt"
        if not os.path.exists(model_path) or os.path.getsize(model_path) < 10000000:
            print("⏳ Downloading LaMa TorchScript model (big-lama.pt ~196MB)...")
            url = "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt"
            urllib.request.urlretrieve(url, model_path)
            print("✅ LaMa model downloaded successfully!")
        
        print("⏳ Loading LaMa into memory...")
        self.model = torch.jit.load(model_path, map_location=self.dev)
        self.model.eval()
        print("✅ LaMa Inpainting model ready!")

    def __call__(self, img: Image.Image, mask: Image.Image) -> Image.Image:
        orig_w, orig_h = img.size
        mod_w = max(8, (orig_w // 8) * 8)
        mod_h = max(8, (orig_h // 8) * 8)
        
        img_resized = img.resize((mod_w, mod_h), Image.Resampling.BILINEAR)
        mask_resized = mask.resize((mod_w, mod_h), Image.Resampling.NEAREST).convert("L")

        img_np = np.array(img_resized).astype(np.float32) / 255.0
        mask_np = np.array(mask_resized).astype(np.float32) / 255.0
        mask_np = (mask_np > 0.5).astype(np.float32)

        img_t = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(self.dev)
        mask_t = torch.from_numpy(mask_np).unsqueeze(0).unsqueeze(0).to(self.dev)

        with torch.no_grad():
            res_t = self.model(img_t, mask_t)

        res_np = res_t[0].permute(1, 2, 0).detach().cpu().numpy()
        res_np = np.clip(res_np * 255.0, 0, 255).astype(np.uint8)
        return Image.fromarray(res_np).resize((orig_w, orig_h), Image.Resampling.BILINEAR)

lama = None
mocr = None

def get_lama():
    global lama
    if lama is None:
        lama = StandaloneLama(dev=device)
    return lama

def get_mocr():
    global mocr
    if mocr is None:
        try:
            from manga_ocr import MangaOcr
            mocr = MangaOcr()
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
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "lama_ready": lama is not None,
        "mocr_ready": mocr is not None,
    }

@app.post("/api/inpaint")
async def do_inpaint(req: InpaintReq):
    try:
        model = get_lama()
        img = b64_to_pil(req.imageBase64)
        mask = b64_to_pil(req.maskBase64).convert("L")
        res = model(img, mask)
        return {"success": True, "cleanedImageBase64": pil_to_b64(res)}
    except Exception as e:
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
                text = ocr_model(crop)
            else:
                text = "(OCR Sample Text)"
            results.append({"box": box, "text": text})
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/translate")
async def do_translate(req: TransReq):
    try:
        if req.engine == "gemini" and req.apiKey:
            import google.generativeai as genai
            genai.configure(api_key=req.apiKey)
            model = genai.GenerativeModel("gemini-2.0-flash")
            prompt = f"Dịch các câu sau sang tiếng Việt manga, trả về mảng JSON string:\n" + "\n".join(f"{i+1}. {t}" for i, t in enumerate(req.texts))
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
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    config = uvicorn.Config(app=app, host="0.0.0.0", port=8000, log_level="info")
    server = uvicorn.Server(config)
    server.run()
