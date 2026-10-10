---
title: Manga Text Cleaner ZeroGPU
emoji: 🎨
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: 5.10.0
app_file: app.py
pinned: false
license: mit
short_description: Production AI Inpainting for Manga & Manhwa on ZeroGPU (Nvidia A100)
---

# 🎨 Manga Text Cleaner (ZeroGPU Edition)

Ứng dụng Web App và Backend REST API phục hồi tranh, xóa bóng thoại & chữ truyện tranh (Manga, Manhwa, Webtoon) chuẩn Production chạy trên nền tảng **Hugging Face Spaces với phần cứng ZeroGPU (Nvidia A100)**.

---

## 🌟 Các tính năng nổi bật:

1. **Tương thích hoàn hảo với ZeroGPU (Nvidia A100):**
   - Sử dụng decorator `@spaces.GPU(duration=60)` cấp phát GPU linh hoạt, tự giải phóng VRAM và garbage collection sau mỗi lượt suy luận để tránh lỗi quota hoặc tràn bộ nhớ.
   - Cache trọng số mô hình trong CPU RAM; chỉ nạp sang GPU khi thực thi inference.

2. **Chất lượng inpainting chuẩn 1:1 Pixel-Perfect:**
   - Đệm đối xứng Modulo-8 (`pad_img_to_modulo`) loại bỏ hiện tượng răng cưa và biến dạng kích thước.
   - Cơ chế ghép mặt nạ Alpha Composite chuẩn xác, giữ nguyên 100% chi tiết tranh không bị che phủ.
   - Hỗ trợ ảnh Webtoon dài (`> 2500px`) thông qua thuật toán cắt theo ngữ cảnh (Context Window Cropping).

3. **Giao diện Web Di Động (Mobile-First):**
   - Canvas vẽ cọ nhạy bén (`gr.ImageEditor`), hỗ trợ cảm ứng mượt mà trên Android Chrome.
   - 2 chế độ linh hoạt: **Quẹt cọ thủ công** hoặc **Tự động quét toàn bộ trang (1-Click Auto-Clean)**.

4. **100% tương thích với Ứng Dụng Manga Studio Client:**
   - Hỗ trợ đầy đủ các endpoint:
     - `GET /health`
     - `POST /api/clean_page`
     - `POST /api/inpaint`
     - `POST /api/detect`
     - `POST /api/switch_model`
     - `POST /api/v1/inpaint` (Multipart/form-data upload)

---

## 🚀 Hướng dẫn Triển Khai Lên Hugging Face Spaces:

### Cách 1: Tạo Space trực tiếp trên giao diện web Hugging Face
1. Truy cập [Hugging Face Spaces](https://huggingface.co/spaces) $\rightarrow$ Chọn **Create new Space**.
2. Đặt tên Space (ví dụ: `manga-text-cleaner`).
3. Chọn License: `MIT`.
4. Chọn **Space SDK: Gradio**.
5. Chọn **Space Hardware: ZeroGPU (Nvidia A100 - Free)**.
6. Sau khi tạo xong, tải lên (hoặc kéo thả) 3 file trong thư mục `hf_space/`:
   - `app.py`
   - `requirements.txt`
   - `README.md`
7. Đợi 1-2 phút để Space tự động build và chạy!

### Cách 2: Triển khai qua Git CLI
```bash
# Clone space của bạn
git clone https://huggingface.co/spaces/<username>/<space-name> hf_deploy
cd hf_deploy

# Sao chép các file từ hf_space vào
cp -r /path/to/dich/hf_space/* .

# Push lên Hugging Face
git add .
git commit -m "Deploy Manga Text Cleaner ZeroGPU"
git push
```

---

## 📱 Cách kết nối với Ứng dụng Manga Studio trên điện thoại / máy tính:

1. Mở Space trên Hugging Face, sao chép đường dẫn Space của bạn (Ví dụ: `https://khanhdocnope-manga-text-cleaner.hf.space`).
2. Mở ứng dụng **Manga Studio** (trên Web hoặc Android APK).
3. Nhấp vào nút **AI Cloud / Kết Nối AI** (biểu tượng đám mây / tia sét ở thanh điều hướng).
4. Dán URL Space của bạn vào ô **URL Colab / Server AI**.
5. Nhấp **Kiểm Tra & Lưu Kết Nối**. Khi hiển thị trạng thái `AI Sẵn Sàng (Nvidia A100 ZeroGPU)`, bạn có thể sử dụng tất cả tính năng xóa chữ ngay lập tức!

---

## 📡 Tài liệu REST API & Payload Mẫu:

### 1. Kiểm tra trạng thái Server (`GET /health`)
```bash
curl -X GET "https://<your-space>.hf.space/health"
```
**Phản hồi:**
```json
{
  "status": "online",
  "online": true,
  "device": "Nvidia A100 (ZeroGPU)",
  "gpu": "Nvidia A100 (ZeroGPU)",
  "engine": "IOPaint LaMa & ComicTextDetector",
  "current_model": "anime-lama",
  "available_models": ["anime-lama", "lama"]
}
```

---

### 2. Xóa chữ tự động toàn trang (`POST /api/clean_page`)
```bash
curl -X POST "https://<your-space>.hf.space/api/clean_page" \
     -H "Content-Type: application/json" \
     -d '{
       "imageBase64": "data:image/png;base64,iVBORw0KGgo...",
       "dilationPx": 4,
       "modelName": "anime-lama"
     }'
```
**Phản hồi:**
```json
{
  "success": true,
  "cleanedImageBase64": "data:image/png;base64,...",
  "maskBase64": "data:image/png;base64,...",
  "stats": {
    "model": "anime-lama",
    "engine": "IOPaint LaMa (ZeroGPU)",
    "mode": "auto_detector",
    "total_regions": 8,
    "inference_ms": 340,
    "width": 1200,
    "height": 1800
  }
}
```

---

### 3. Xóa theo nét cọ vẽ (`POST /api/inpaint`)
```bash
curl -X POST "https://<your-space>.hf.space/api/inpaint" \
     -H "Content-Type: application/json" \
     -d '{
       "imageBase64": "data:image/png;base64,...",
       "maskBase64": "data:image/png;base64,...",
       "modelName": "anime-lama"
     }'
```

---

### 4. Upload file trực tiếp bằng cURL / Mobile Client (`POST /api/v1/inpaint`)
```bash
curl -X POST "https://<your-space>.hf.space/api/v1/inpaint" \
     -F "image=@/duong_dan/trang_truyen.jpg" \
     -F "model_name=anime-lama" \
     -F "dilation=4" \
     --output "trang_truyen_sach.png"
```
