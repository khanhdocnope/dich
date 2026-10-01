# 📖 Manga Translator Studio (AI LaMa & Visual Typesetting)

> **Manga Translator Studio** là ứng dụng biên dịch truyện tranh tự động & chỉnh sửa trực quan cao cấp. Ứng dụng tích hợp mô hình **LaMa (Large Mask Inpainting)** chạy trên **Google Colab GPU** để xóa nền chữ sạch sẽ, hệ thống đa engine dịch thuật chống kiểm duyệt (NSFW / Censorship Bypass), cùng trình chỉnh sửa Canvas chuẩn Figma/Photoshop.

![Manga Translator Studio Banner](https://img.shields.io/badge/Vite-React-6366F1?style=for-the-badge&logo=vite&logoColor=white)
![Python Backend](https://img.shields.io/badge/Python-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Google Colab GPU](https://img.shields.io/badge/Google_Colab-T4_GPU-F9AB00?style=for-the-badge&logo=googlecolab&logoColor=white)
![License MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🌟 Tính Năng Nổi Bật (Key Features)

### 🎨 1. Trình Chỉnh Sửa Trực Quan Canvas (Visual Canvas Editor)
- **Hệ thống Thu Phóng & Di Chuyển Mượt Ma (Zoom & Pan):**
  - **Lăn chuột (Mouse Wheel Zoom):** Phóng to / Thu nhỏ mượt mà ngay tại vị trí con trỏ chuột (từ 10% đến 450%).
  - **Di chuyển ảnh (Pan):** Giữ phím `Space` + Kéo chuột trái, hoặc kéo chuột giữa/chuột phải.
  - Phím tắt & Nút Zoom nhanh: `Fit Screen`, `Fit Width`, `100%`, `200%`.
- **Canvas Đa Lớp (Multi-layer View):** Chuyển đổi linh hoạt giữa *Ảnh hoàn chỉnh*, *Ảnh gốc*, *Ảnh đã xóa chữ (LaMa)*, và *Chế độ so sánh Trước / Sau (Split Slider)*.
- **Cọ Xóa Thủ Công (LaMa Brush):** Dùng cọ tô trực tiếp lên ảnh để xóa watermark hoặc nét chữ khó.
- **8 Điểm Nút Neo Kéo Dãn (8-Point Resize Handles):** Co kéo 4 góc và 4 cạnh của ô thoại dễ dàng.

### 🎨 2. Phủ Nền Hộp Thoại Siêu Tốc (1-Click Box Background Presets)
- **4 Nút Chọn Nhanh:** `Trong suốt`, `Nền Trắng #FFF` (xóa chữ cũ tức thì không cần AI), `Nền Đen #000`, `Màu tùy chọn`.
- **Tùy chỉnh linh hoạt:** Độ mờ đục (Opacity 0-100%), Bo góc tròn (Border Radius), Khoảng đệm chữ (Padding), Viền hộp (Border Stroke), Viền chữ (Text Outline).

### 🛡️ 3. Giải Pháp Đa Engine Chống Kiểm Duyệt (NSFW / Censorship Bypass)
- **Mode 1 - AI Vision (Gemini 2.0 Flash / GPT-4o-mini):** Dịch thông minh, hiểu ngữ cảnh mượt mà cho truyện thông thường.
- **Mode 2 - Uncensored (Manga-OCR Offline + DeepL / Google Translate):** 100% Offline trên GPU Colab đối với tiếng Nhật/Trung, không bao giờ bị dính bộ lọc khóa nội dung nhạy cảm của các AI thương mại.

### ⚡ 4. Dịch & Xuất Hàng Loạt (Batch Auto-Translator)
- Tự động quét toàn bộ thư mục `raw materials`, chạy xóa nền LaMa + OCR + Dịch tự động và xuất ảnh sắc nét vào thư mục `test-case`.

---

## 📁 Cấu Trúc Thư Mục (Folder Structure)

```text
d:\dich/
├── raw materials/                # Thư mục ảnh đầu vào (.webp, .png, .jpg)
├── test-case/                    # Thư mục chứa ảnh kết quả đã xuất
├── colab/                        # Notebook & Python Script chạy trên Google Colab
│   ├── Manga_Translator_LaMa_Colab.ipynb  # Notebook 1-Click Execution trên Colab GPU
│   └── colab_server.py           # FastAPI AI Server script
├── server/                       # Node.js Local Bridge Server
│   └── server.js                 # API bridge đọc/ghi file từ raw materials sang test-case
├── src/                          # Mã nguồn React Frontend
│   ├── components/               # Header, Sidebar, CanvasEditor, BubbleInspector, Modals
│   ├── services/                 # Canvas Typesetting Engine, Colab API Client, Local API
│   ├── types/                    # TypeScript interfaces & definitions
│   └── App.tsx                   # Main App Component
├── package.json
├── vite.config.ts
└── README.md
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy (Quick Start)

### 1. Khởi chạy Ứng dụng Cục bộ (Local Web App)

Yêu cầu: [Node.js](https://nodejs.org/) (v18 trở lên).

```bash
# 1. Cài đặt các thư viện
npm install

# 2. Khởi chạy Server Local & Web App
npm run dev
```
Trình duyệt sẽ tự động mở tại: `http://localhost:5173`

---

### 2. Khởi chạy AI Server trên Google Colab (Mô hình GPU LaMa)

1. Tải tệp [`colab/Manga_Translator_LaMa_Colab.ipynb`](colab/Manga_Translator_LaMa_Colab.ipynb) lên [Google Colab](https://colab.research.google.com/).
2. Chọn Menu **Runtime > Change runtime type > T4 GPU**.
3. Bấm nút Play **▶ (Run Cell)** duy nhất ở **Bước 1**.
4. Khi quá trình hoàn tất, copy đường dẫn ngrok công khai dạng `https://xxxx.ngrok-free.app`.
5. Trên Web App (`http://localhost:5173`), bấm **Kết nối Colab GPU**, dán link ngrok vào và bấm **Lưu Cấu Hình**.

---

## ⌨️ Bảng Phím Tắt (Keyboard Shortcuts)

| Phím Tắt | Thao Tác |
| :--- | :--- |
| **Lăn chuột (Scroll Wheel)** | Phóng to / Thu nhỏ tại vị trí con trỏ chuột |
| **Space + Kéo chuột** | Di chuyển khung hình (Pan) |
| **Phím V** | Chuyển sang công cụ Chọn ô thoại |
| **Phím B** | Chuyển sang công cụ Thêm ô thoại mới |
| **Delete / Backspace** | Xóa ô thoại đang chọn |
| **Esc** | Bỏ chọn ô thoại |

---

## 📜 Giấy Phép (License)

Dự án phát hành theo giấy phép [MIT License](LICENSE).
