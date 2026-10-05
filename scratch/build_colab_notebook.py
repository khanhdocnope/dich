import json
import os

def build_notebook():
    server_py_path = os.path.join(os.path.dirname(__file__), "..", "colab", "colab_server.py")
    with open(server_py_path, "r", encoding="utf-8") as f:
        colab_server_code = f.read()

    # Create the Jupyter Notebook structure
    # Cell 1: Header / Markdown intro
    cell_intro = {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "# 🌸 Manga Text Cleaner & Inpainting Studio (LaMa FFC & ComicTextDetector)\n",
            "> **Google Colab GPU Server (T4 GPU / CPU Fallback)**\n",
            ">\n",
            "> ### 🚀 Điểm Nổi Bật:\n",
            "> 1. **Biên tập đơn trang tương tác (Web UI Tích Hợp):** Mở link Cloudflare trực tiếp trên trình duyệt. Dùng cọ vẽ khoanh vùng muốn xóa, **nếu không vẽ gì thì AI sẽ Tự Động Quét & Xóa Cả Trang**.\n",
            "> 2. **So sánh Trước / Sau trực quan (Before / After Split Slider):** Kéo thanh trượt để so sánh độ nguyên vẹn của nét vẽ và trame sau khi xóa.\n",
            "> 3. **Nạp & Xử lý hàng loạt từ Google Drive:** Quét sạch toàn bộ chapter trong thư mục Google Drive và xuất ảnh đã inpaint sắc nét 1:1.\n",
            "> 4. **Cung cấp REST API:** Kết nối trực tiếp vào Web App Studio (`http://localhost:5173`) hoặc APK điện thoại.\n",
            "> 5. **Tương thích 100% Python 3.13:** Loại bỏ hoàn toàn Gradio / HuggingFace Hub, khởi động cực nhanh và không bao giờ gặp lỗi thư viện!\n",
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
            "print(\"⏳ Đang cài đặt các thư viện cần thiết (FastAPI, OpenCV Headless, Uvicorn, PyNgrok, PyClipper, Shapely)...\")\n",
            "!pip install -q fastapi uvicorn pyngrok opencv-python-headless pyclipper shapely\n",
            "print(\"✅ Cài đặt thư viện hoàn tất!\")\n"
        ]
    }

    # Cell 3: Step 2 - Load Models & Core Pipeline
    model_code = """#@title ⏳ 2. Tải & Nạp Models (ComicTextDetector & LaMa FFC) { display-mode: "form" }
import os
import sys
import time
import io
import re
import json
import base64
import threading
import subprocess
from typing import List, Optional, Dict, Any, Tuple

import cv2
import numpy as np
from PIL import Image
import torch

device = "cuda" if torch.cuda.is_available() else "cpu"
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU (Fallback)"
print(f"🚀 Thiết bị tính toán: {device.upper()} ({gpu_name})")

MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

COMIC_ONNX_PATH = os.path.join(MODEL_DIR, "comictextdetector.pt.onnx")
LAMA_PT_PATH = os.path.join(MODEL_DIR, "big-lama.pt")

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

# Direct HTTPS mirrors (Không cần cài đặt thư viện huggingface_hub)
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

# Stage 3: LaMa Inpainting Engine (FFC TorchScript)
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
                print(f"✅ LaMa FFC Inpainter đã nạp thành công vào {dev.upper()}!")
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
                print(f"⚠️ LaMa inference warning: {e}. Falling back to OpenCV...")

        # Fallback Engine
        img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        mask_cv = np.array(mask_l)
        inpainted = cv2.inpaint(img_cv, mask_cv, inpaintRadius=5, flags=cv2.INPAINT_TELEA)
        return Image.fromarray(cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB))

# Stage 1 & 2: ComicTextDetector & Dilation Engine
class ComicTextDetectorEngine:
    def __init__(self, model_path: str = COMIC_ONNX_PATH):
        self.model_path = model_path
        self.net = None
        self.ready = False

        if os.path.exists(model_path):
            try:
                self.net = cv2.dnn.readNetFromONNX(model_path)
                if device == "cuda":
                    self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
                    self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
                else:
                    self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                    self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                self.ready = True
                print(f"✅ ComicTextDetector (ONNX) đã nạp thành công!")
            except Exception as e:
                print(f"⚠️ ComicTextDetector notice: {e}")

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
                for out in outs:
                    if len(out.shape) == 4 and out.shape[1] in [1, 2]:
                        mask_out = out[0, 0]
                        mask_res = cv2.resize(mask_out, (sub_w, sub_h), interpolation=cv2.INTER_LINEAR)
                        binary = (mask_res > 0.3).astype(np.uint8) * 255
                        full_mask[y:y2] = np.maximum(full_mask[y:y2], binary)
            except Exception as e:
                print(f"Detection error at y={y}: {e}")

            if y2 == h:
                break
            y = y2 - overlap

        contours, _ = cv2.findContours(full_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            if bw > 10 and bh > 10:
                boxes.append({"x": int(bx), "y": int(by), "width": int(bw), "height": int(bh)})

        return full_mask, boxes

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

        ksize = max(3, dilation_px * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
        dilated_mask = cv2.dilate(raw_mask, kernel)

        if is_custom:
            res_pil = self.lama(img_rgb, Image.fromarray(dilated_mask))
            return res_pil, Image.fromarray(dilated_mask), {
                "flat": 0, "lama": 1, "mode": "custom_brush", "total_regions": 1
            }

        joined = cv2.dilate(dilated_mask, np.ones((merge_margin, merge_margin), np.uint8))
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(joined, connectivity=8)
        res_bgr = img_bgr.copy()
        stats_cnt = {"flat": 0, "lama": 0, "total_regions": max(0, num_labels - 1), "mode": "auto"}

        for i in range(1, num_labels):
            rx, ry, rw, rh, area = stats[i]
            if area < 20: continue

            ctx = 20
            x1, y1 = max(0, rx - ctx), max(0, ry - ctx)
            x2, y2 = min(w, rx + rw + ctx), min(h, ry + rh + ctx)

            crop_img = res_bgr[y1:y2, x1:x2]
            crop_m = dilated_mask[y1:y2, x1:x2]
            if not crop_m.any(): continue

            ring = cv2.dilate(crop_m, np.ones((11, 11), np.uint8)) & cv2.bitwise_not(crop_m)
            ring_pix = crop_img[ring > 0]

            if len(ring_pix) > 30 and ring_pix.std(axis=0).max() < flat_threshold:
                crop_img[crop_m > 0] = np.median(ring_pix, axis=0).astype(np.uint8)
                stats_cnt["flat"] += 1
            else:
                c_pil = Image.fromarray(cv2.cvtColor(crop_img, cv2.COLOR_BGR2RGB))
                m_pil = Image.fromarray(crop_m)
                inpaint_res = self.lama(c_pil, m_pil)
                inpaint_bgr = cv2.cvtColor(np.array(inpaint_res), cv2.COLOR_RGB2BGR)
                crop_img[crop_m > 0] = inpaint_bgr[crop_m > 0]
                stats_cnt["lama"] += 1

            res_bgr[y1:y2, x1:x2] = crop_img

        out_pil = Image.fromarray(cv2.cvtColor(res_bgr, cv2.COLOR_BGR2RGB))
        mask_pil = Image.fromarray(dilated_mask)
        return out_pil, mask_pil, stats_cnt

cleaner_pipeline = MangaCleanerPipeline()
print("🎉 Tất cả mô hình AI (LaMa FFC & ComicTextDetector) đã sẵn sàng!")
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

    server_template = """#@title 🚀 3. Khởi chạy Web UI Tương Tác & Máy Chủ API { display-mode: "form" }
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

app = FastAPI(title="Manga Translator Studio AI Server", version="5.2.0")
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
    return {"status": "online", "device": device, "gpu": gpu_name, "engine": "LaMa FFC & ComicTextDetector"}

@app.post("/api/clean_page")
async def api_clean_page(req: CleanPageReq):
    try:
        img = b64_to_pil(req.imageBase64)
        custom_mask = b64_to_pil(req.maskBase64) if req.maskBase64 else None
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
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/inpaint")
async def api_inpaint(req: InpaintReq):
    try:
        img = b64_to_pil(req.imageBase64)
        mask = b64_to_pil(req.maskBase64).convert("L")
        cleaned = cleaner_pipeline.lama(img, mask)
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

# HTML5 Web UI Content
RAW_HTML = '''__INJECT_WEB_UI_HTML__'''

@app.get("/", response_class=HTMLResponse)
def index_page():
    # Inject user configured Drive paths
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
print("🎉 TẤT CẢ ĐÃ SẴN SÀNG! (LAMA FFC & COMIC-TEXT-DETECTOR)")
if public_url:
    print(f"🔗 ĐƯỜNG LINK CỦA BẠN:\\n\\n👉 {public_url}\\n")
    print("💡 HƯỚNG DẪN:")
    print("   1. Bấm vào link trên để mở WEB UI TƯƠNG TÁC (Cọ vẽ, So sánh Before/After, Quét thư mục Drive)!")
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
