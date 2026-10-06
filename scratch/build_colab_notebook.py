import json
import os

def build_notebook():
    server_py_path = os.path.join(os.path.dirname(__file__), "..", "colab", "colab_server.py")
    with open(server_py_path, "r", encoding="utf-8") as f:
        colab_server_code = f.read()

    # Cell 1: Intro Markdown
    cell_intro = {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "# 🎨 Manga Text Cleaner & Inpainting Studio (IOPaint / Lama Cleaner Engine)\n",
            "> **Google Colab GPU Server (T4 GPU / CPU Fallback)**\n",
            ">\n",
            "> ### 🚀 Điểm Nổi Bật:\n",
            "> 1. **Kiến Trúc IOPaint (Lama Cleaner):** Tích hợp chính thức kiến trúc và mô hình từ tác giả Sanster (`anime-manga-big-lama` và `big-lama`).\n",
            "> 2. **Chất Lượng Inpainting Đỉnh Cao:** Đệm đối xứng modulo-8 (`pad_img_to_modulo`), xử lý trame và gradient mượt mà, loại bỏ triệt để hiện tượng vệt trắng hay bệt màu.\n",
            "> 3. **Biên Tập Đơn Trang Tương Tác (Web UI):** Dùng cọ vẽ khoanh vùng muốn xóa, hoặc để trống để AI **Tự Động Quét & Xóa Toàn Bộ Trang**.\n",
            "> 4. **So Sánh Trước / Sau Trực Quan:** Thanh trượt Before / After so sánh nét vẽ và nền sau khi xóa.\n",
            "> 5. **Xử Lý Hàng Loạt Từ Google Drive:** Quét sạch toàn bộ chapter trong thư mục Drive và xuất ảnh đã inpaint sắc nét 1:1.\n",
            "> 6. **Cung Cấp REST API Đầy Đủ:** Kết nối trực tiếp vào Web App Studio (`http://localhost:5173`) hoặc APK điện thoại.\n",
            "> 7. **Tương Thích Tuyệt Đối Python 3.13:** Hoàn toàn không phụ thuộc Gradio / HuggingFace Hub, khởi động cực nhanh và ổn định.\n",
            "\n",
            "---"
        ]
    }

    # Cell 2: Step 1 - Google Drive & Install Packages
    cell_install = {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {
            "cellView": "form"
        },
        "outputs": [],
        "source": [
            "#@title 📁 1. Kết nối Google Drive & Cài đặt thư viện { display-mode: \"form\" }\n",
            "#@markdown Bật kết nối Google Drive nếu bạn muốn xử lý trực tiếp ảnh từ thư mục Google Drive:\n",
            "MOUNT_GOOGLE_DRIVE = False #@param {type:\"boolean\"}\n",
            "\n",
            "if MOUNT_GOOGLE_DRIVE:\n",
            "    try:\n",
            "        from google.colab import drive\n",
            "        drive.mount('/content/drive')\n",
            "        print(\"✅ Đã kết nối Google Drive thành công!\")\n",
            "    except Exception as e:\n",
            "        print(f\"⚠️ Ghi chú Drive: {e}\")\n",
            "\n",
            "print(\"⏳ Đang cài đặt các thư viện cần thiết (FastAPI, Uvicorn, PyNgrok, PyClipper)...\")\n",
            "!pip install -q fastapi uvicorn pyngrok pyclipper\n",
            "print(\"✅ Cài đặt thư viện hoàn tất!\")\n"
        ]
    }

    # Extract sections from colab_server.py
    # Cell 3: Step 2 - Load Models & Core Pipeline
    model_code = """#@title ⏳ 2. Tải & Nạp Models IOPaint (Anime-Manga LaMa & ComicTextDetector) { display-mode: "form" }
import torch
import os
import sys
import time
import io
import re
import json
import base64
import threading
import subprocess
from enum import Enum
from typing import List, Optional, Dict, Any, Tuple

import cv2
import numpy as np
from PIL import Image

device = "cuda" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU (Fallback)"
print(f"🚀 Thiết bị tính toán: {device.upper()} ({gpu_name})")

MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

COMIC_ONNX_PATH = os.path.join(MODEL_DIR, "comictextdetector.pt.onnx")
ANIME_LAMA_PT_PATH = os.path.join(MODEL_DIR, "anime-manga-big-lama.pt")
BIG_LAMA_PT_PATH = os.path.join(MODEL_DIR, "big-lama.pt")

def download_resilient(urls: List[str], dest: str, min_mb: int = 10) -> bool:
    if os.path.exists(dest) and os.path.getsize(dest) >= min_mb * 1024 * 1024:
        return True
    for url in urls:
        try:
            print(f"⏳ Đang tải {os.path.basename(dest)} từ {url}...")
            torch.hub.download_url_to_file(url, dest, progress=True)
            if os.path.exists(dest) and os.path.getsize(dest) >= min_mb * 1024 * 1024:
                print(f"✅ Đã tải {os.path.basename(dest)} ({os.path.getsize(dest) // (1024*1024)} MB)")
                return True
        except Exception as e:
            print(f"⚠️ Mirror note ({url}): {e}")
            if os.path.exists(dest):
                try: os.remove(dest)
                except: pass
    return False

# Download ComicTextDetector ONNX
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

# IOPaint Helpers
def ceil_modulo(x: int, mod: int) -> int:
    if x % mod == 0:
        return x
    return (x // mod + 1) * mod

def pad_img_to_modulo(img: np.ndarray, mod: int = 8, min_size: Optional[int] = None) -> np.ndarray:
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
    if len(np_img.shape) == 2:
        np_img = np_img[:, :, np.newaxis]
    np_img = np.transpose(np_img, (2, 0, 1))
    return np_img.astype("float32") / 255.0

def boxes_from_mask(mask: np.ndarray) -> List[np.ndarray]:
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

# IOPaint Core Engine
class IOPaintEngine:
    def __init__(self, default_model: str = "anime-lama", dev: str = device):
        self.dev = dev
        self.pad_mod = 8
        self.current_model_name = default_model
        self.model = None
        self.ready = False
        self.loaded_models: Dict[str, Any] = {}
        self.load_model(default_model)

    def load_model(self, model_name: str) -> bool:
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
                print(f"⏳ Loading IOPaint model: {canonical_name} ({os.path.basename(target_path)})...")
                loaded = torch.jit.load(target_path, map_location=self.dev)
                loaded.eval()
                self.loaded_models[canonical_name] = loaded
                self.model = loaded
                self.current_model_name = canonical_name
                self.ready = True
                print(f"✅ IOPaint Model '{canonical_name}' loaded successfully on {self.dev.upper()}!")
                return True
            except Exception as e:
                print(f"⚠️ Failed to load IOPaint model {target_path}: {e}")
                self.ready = False
                return False
        return False

    def forward(self, pad_image_rgb: np.ndarray, pad_mask: np.ndarray) -> np.ndarray:
        img_norm = norm_img(pad_image_rgb)
        mask_norm = norm_img(pad_mask)
        mask_norm = (mask_norm > 0) * 1.0

        img_t = torch.from_numpy(img_norm).unsqueeze(0).to(self.dev)
        mask_t = torch.from_numpy(mask_norm).unsqueeze(0).to(self.dev)

        with torch.inference_mode():
            out = self.model(img_t, mask_t)

        cur_res = out[0].permute(1, 2, 0).detach().cpu().numpy()
        cur_res = np.clip(cur_res * 255.0, 0, 255).astype(np.uint8)
        cur_res = cv2.cvtColor(cur_res, cv2.COLOR_RGB2BGR)
        return cur_res

    def _pad_forward(self, image_rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
        if len(mask.shape) == 2:
            mask = mask[:, :, np.newaxis]
        orig_h, orig_w = image_rgb.shape[:2]

        pad_image = pad_img_to_modulo(image_rgb, mod=self.pad_mod)
        pad_mask = pad_img_to_modulo(mask, mod=self.pad_mod)

        result_bgr = self.forward(pad_image, pad_mask)
        result_bgr = result_bgr[0:orig_h, 0:orig_w, :]

        mask_norm = (mask.astype(np.float32) / 255.0)
        orig_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR).astype(np.float32)
        res_bgr = result_bgr.astype(np.float32)
        final_bgr = (res_bgr * mask_norm + orig_bgr * (1.0 - mask_norm)).clip(0, 255).astype(np.uint8)
        return final_bgr

    def _crop_box(self, image: np.ndarray, mask: np.ndarray, box: np.ndarray, margin: int = 128) -> Tuple[np.ndarray, np.ndarray, List[int]]:
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

        elif hd_strategy == HDStrategy.RESIZE and max_dim > 2048:
            ratio = 2048.0 / max_dim
            new_w, new_h = int(w * ratio + 0.5), int(h * ratio + 0.5)
            down_img = cv2.resize(image_rgb, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            down_mask = cv2.resize(mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
            down_res_bgr = self._pad_forward(down_img, down_mask)
            up_res_bgr = cv2.resize(down_res_bgr, (w, h), interpolation=cv2.INTER_CUBIC)

            mask_norm = np.expand_dims(mask.astype(np.float32) / 255.0, axis=2)
            orig_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR).astype(np.float32)
            final_bgr = (up_res_bgr.astype(np.float32) * mask_norm + orig_bgr * (1.0 - mask_norm)).clip(0, 255).astype(np.uint8)
            return final_bgr
        else:
            return self._pad_forward(image_rgb, mask)

    def __call__(self, img_pil: Image.Image, mask_pil: Image.Image) -> Image.Image:
        img_rgb = np.array(img_pil.convert("RGB"))
        mask_l = np.array(mask_pil.convert("L"))
        res_bgr = self.inpaint(img_rgb, mask_l)
        return Image.fromarray(cv2.cvtColor(res_bgr, cv2.COLOR_BGR2RGB))

# ComicTextDetector Engine
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

        img_rgb = img_pil.convert("RGB")
        w, h = img_rgb.size
        img_rgb_arr = np.array(img_rgb)
        img_bgr_arr = cv2.cvtColor(img_rgb_arr, cv2.COLOR_RGB2BGR)

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

        ksize = max(3, dilation_px * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
        dilated_mask = cv2.dilate(raw_mask, kernel)

        res_bgr = self.iopaint.inpaint(img_rgb_arr, dilated_mask)
        res_rgb = cv2.cvtColor(res_bgr, cv2.COLOR_BGR2RGB)

        stats = {
            "model": self.iopaint.current_model_name,
            "engine": "IOPaint",
            "total_regions": 1 if is_custom else boxes_count,
            "mode": "custom_brush" if is_custom else "auto",
            "width": w,
            "height": h
        }

        return Image.fromarray(res_rgb), Image.fromarray(dilated_mask), stats

cleaner_pipeline = MangaCleanerPipeline()
print(f"🎉 Mô hình IOPaint ({cleaner_pipeline.iopaint.current_model_name}) & ComicTextDetector đã sẵn sàng!")
"""

    cell_models = {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {
            "cellView": "form"
        },
        "outputs": [],
        "source": [line + "\n" for line in model_code.strip().split("\n")]
    }

    # Cell 4: Step 3 - Launch Server & Embedded Web UI (Zero Gradio!)
    start_marker = 'WEB_UI_HTML = """'
    end_marker = '"""\n\n@app.get("/"'
    start_pos = colab_server_code.find(start_marker)
    end_pos = colab_server_code.find(end_marker)
    if start_pos == -1 or end_pos == -1:
        raise ValueError("Could not find WEB_UI_HTML block in colab_server.py")

    web_ui_html_content = colab_server_code[start_pos + len(start_marker):end_pos]

    server_template = """#@title 🚀 3. Khởi chạy Web UI Tương Tác & Máy Chủ API (IOPaint Engine) { display-mode: "form" }
#@markdown Nhập Ngrok Token nếu muốn dùng Ngrok (để trống sẽ tự động dùng Cloudflare Tunnel miễn phí):
NGROK_AUTH_TOKEN = "" #@param {type:"string"}
#@markdown Thư mục Input mặc định trên Google Drive (cho xử lý hàng loạt):
DEFAULT_DRIVE_INPUT = "/content/drive/MyDrive/Manga_Input" #@param {type:"string"}
#@markdown Thư mục Output mặc định trên Google Drive:
DEFAULT_DRIVE_OUTPUT = "/content/drive/MyDrive/Manga_Output" #@param {type:"string"}

import time
import io
import re
import json
import base64
import threading
import subprocess
from typing import Optional, Dict, Any, List
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pyngrok import ngrok

app = FastAPI(title="Manga Translator Studio - IOPaint Engine", version="6.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    modelName: Optional[str] = None

class InpaintReq(BaseModel):
    imageBase64: str
    maskBase64: str
    modelName: Optional[str] = None

class DetectReq(BaseModel):
    imageBase64: str

class SwitchModelReq(BaseModel):
    modelName: str

class BatchFolderReq(BaseModel):
    inputDir: str
    outputDir: str
    dilationPx: Optional[int] = 4
    modelName: Optional[str] = None

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
        "engine": "IOPaint (Lama Cleaner) & ComicTextDetector",
        "current_model": cleaner_pipeline.iopaint.current_model_name,
        "iopaint_ready": cleaner_pipeline.iopaint.ready,
        "detector_ready": cleaner_pipeline.detector.ready,
        "available_models": ["anime-lama", "lama"]
    }

@app.get("/api/ping")
def ping():
    return {"status": "ok", "time": time.time()}

@app.post("/api/switch_model")
def api_switch_model(req: SwitchModelReq):
    success = cleaner_pipeline.iopaint.load_model(req.modelName)
    return {
        "success": success,
        "current_model": cleaner_pipeline.iopaint.current_model_name,
        "device": device
    }

@app.post("/api/clean_page")
async def api_clean_page(req: CleanPageReq):
    try:
        img = b64_to_pil(req.imageBase64)
        custom_mask = b64_to_pil(req.maskBase64).convert("L") if req.maskBase64 else None
        cleaned_pil, mask_pil, stats = cleaner_pipeline.clean_image(
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
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/inpaint")
async def api_inpaint(req: InpaintReq):
    try:
        if req.modelName:
            cleaner_pipeline.iopaint.load_model(req.modelName)
        img = b64_to_pil(req.imageBase64)
        mask = b64_to_pil(req.maskBase64).convert("L")
        cleaned = cleaner_pipeline.iopaint(img, mask)
        return {"success": True, "cleanedImageBase64": pil_to_b64(cleaned)}
    except Exception as e:
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
        raise HTTPException(status_code=500, detail=str(e))

def run_batch_thread(input_dir: str, output_dir: str, dilation: int = 4, model_name: str = "anime-lama"):
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

        if model_name:
            cleaner_pipeline.iopaint.load_model(model_name)

        os.makedirs(output_dir, exist_ok=True)
        valid_exts = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
        files = sorted([f for f in os.listdir(input_dir) if f.lower().endswith(valid_exts)])

        if not files:
            batch_status["logs"].append(f"⚠️ Không có ảnh nào trong thư mục '{input_dir}'")
            batch_status["running"] = False
            return

        batch_status["total"] = len(files)
        batch_status["logs"].append(f"📦 Bắt đầu xử lý {len(files)} trang bằng mô hình IOPaint ({cleaner_pipeline.iopaint.current_model_name})...")
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
                    model_name=model_name
                )
                cleaned.save(out_path)
                sec = time.time() - t0
                batch_status["logs"].append(f"[{i}/{len(files)}] ✅ {fname} ({sec:.2f}s) - Kích thước: {img.width}x{img.height}, Vùng: {stats['total_regions']}")
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
        args=(req.inputDir, req.outputDir, req.dilationPx or 4, req.modelName or "anime-lama"),
        daemon=True
    )
    th.start()
    return {"success": True, "message": "Đã khởi chạy tiến trình xử lý hàng loạt IOPaint!"}

@app.get("/api/batch_status")
def api_batch_status():
    global batch_status
    return batch_status

# HTML5 Web UI Content
RAW_HTML = '''__INJECT_WEB_UI_HTML__'''

@app.get("/", response_class=HTMLResponse)
def index_page():
    html = RAW_HTML.replace("/content/drive/MyDrive/Manga_Input", DEFAULT_DRIVE_INPUT)
    html = html.replace("/content/drive/MyDrive/Manga_Output", DEFAULT_DRIVE_OUTPUT)
    return HTMLResponse(content=html)

# Kill old instances on port 8000
os.system("fuser -k 8000/tcp > /dev/null 2>&1")
time.sleep(1)

config = uvicorn.Config(app=app, host="0.0.0.0", port=8000, log_level="error")
server = uvicorn.Server(config)
server_thread = threading.Thread(target=server.run, daemon=True)
server_thread.start()
time.sleep(2)

public_url = None
if NGROK_AUTH_TOKEN and len(NGROK_AUTH_TOKEN.strip()) > 10:
    try:
        for t in ngrok.get_tunnels(): ngrok.disconnect(t.public_url)
        ngrok.kill()
        ngrok.set_auth_token(NGROK_AUTH_TOKEN.strip())
        tunnel = ngrok.connect(8000)
        public_url = tunnel.public_url
    except Exception as e:
        print(f"Ngrok note: {e}")

if not public_url:
    print("⏳ Đang thiết lập Cloudflare Tunnel bảo mật miễn phí...")
    try:
        os.system("curl -L -s https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared")
        os.system("chmod +x /tmp/cloudflared")
        cf_log = open("/tmp/cf.log", "w")
        subprocess.Popen(["/tmp/cloudflared", "tunnel", "--url", "http://localhost:8000"], stdout=cf_log, stderr=cf_log)
        time.sleep(3)
        for _ in range(25):
            if os.path.exists("/tmp/cf.log"):
                content = open("/tmp/cf.log").read()
                m = re.search(r"https://[a-zA-Z0-9-]+\\.trycloudflare\\.com", content)
                if m:
                    public_url = m.group(0)
                    break
            time.sleep(1)
    except Exception as e:
        print(f"Cloudflare note: {e}")

print("="*65)
print("🎉 TẤT CẢ ĐÃ SẴN SÀNG! (IOPAINT ENGINE & COMIC-TEXT-DETECTOR)")
if public_url:
    print(f"🔗 ĐƯỜNG LINK CỦA BẠN:\\n\\n👉 {public_url}\\n")
    print("💡 HƯỚNG DẪN:")
    print("   1. Bấm vào link trên để mở WEB UI TƯƠNG TÁC IOPAINT (Cọ vẽ, So sánh Before/After, Quét thư mục Drive)!")
    print("   2. Hoặc copy link trên dán vào nút [Colab GPU] trên Web App Studio / APK để kết nối tự động!")
else:
    print("🔗 Server chạy tại port 8000: http://localhost:8000")
print("="*65)

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("🛑 Server đã dừng.")
"""

    server_code = server_template.replace("__INJECT_WEB_UI_HTML__", web_ui_html_content)

    cell_server = {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {
            "cellView": "form"
        },
        "outputs": [],
        "source": [line + "\n" for line in server_code.strip().split("\n")]
    }

    notebook_data = {
        "cells": [
            cell_intro,
            cell_install,
            cell_models,
            cell_server
        ],
        "metadata": {
            "accelerator": "GPU",
            "colab": {
                "gpuType": "T4",
                "provenance": []
            },
            "kernelspec": {
                "display_name": "Python 3",
                "name": "python3"
            },
            "language_info": {
                "name": "python"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 0
    }

    out_nb_path = os.path.join(os.path.dirname(__file__), "..", "colab", "Manga_Translator_LaMa_Colab.ipynb")
    with open(out_nb_path, "w", encoding="utf-8") as f:
        json.dump(notebook_data, f, ensure_ascii=False, indent=2)

    print(f"[OK] Generated notebook successfully at: {out_nb_path}")

if __name__ == "__main__":
    build_notebook()
