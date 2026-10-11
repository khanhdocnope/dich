# System Prompt: Kiến Trúc & Xây Dựng Ứng Dụng Manga Text Cleaner (Hugging Face Spaces ZeroGPU A100 & REST API)

Bạn là một Kỹ sư Trí tuệ Nhân tạo và Lập trình viên Full-Stack cấp cao (Senior AI & Python Engineer). Hãy tạo một file mã nguồn duy nhất `app.py` hoàn chỉnh, chuẩn Production để triển khai lên nền tảng **Hugging Face Spaces** với phần cứng **ZeroGPU (Nvidia A100)**. Ứng dụng này đồng thời phục vụ 2 mục đích:
1. **Giao diện Web tương tác hoàn chỉnh** viết bằng Gradio (phiên bản >= 5.10.0), tối ưu hóa trải nghiệm trên thiết bị di động (Mobile-First).
2. **Backend REST API hiệu năng cao** tích hợp sẵn thông qua FastAPI, phục vụ kết nối cho ứng dụng web và di động bên ngoài (CORS đầy đủ).

---

### YÊU CẦU KỸ THUẬT VÀ TÍNH NĂNG CHI TIẾT

#### 1. MÔI TRƯỜNG & TƯƠNG THÍCH PHẦN CỨNG ZEROGPU (NVIDIA A100):
- Import thư viện `spaces` ở đầu file. Tạo lớp giả lập `DummySpaces` nếu chạy ở môi trường không có ZeroGPU để ứng dụng không bao giờ bị lỗi crash.
- Sử dụng decorator `@spaces.GPU(duration=60)` cho hàm suy luận inpainting chính.
- **Quản lý VRAM nghiêm ngặt:** Cache trọng số mô hình trong CPU RAM (`torch.device("cpu")`), chỉ đẩy sang GPU khi thực thi inference và tự động thu hồi VRAM ngay sau khi hoàn thành bằng `torch.cuda.empty_cache()` và `gc.collect()`.
- **Cơ chế Fallback CPU RAM:** Hỗ trợ tham số `force_cpu=True` hoặc tự động chuyển đổi sang CPU khi quota ZeroGPU trong ngày bị cạn kiệt, đảm bảo tính liên tục của dịch vụ.

#### 2. CÁC MÔ HÌNH AI & PIPELINE XỬ LÝ TRANH (IOPAINT & COMIC TEXT DETECTOR):
- **Tự động tải mô hình linh hoạt (Resilient Downloader):**
  - Tải mô hình ComicTextDetector ONNX (`comictextdetector.pt.onnx`, ~90MB) hỗ trợ mirror Hugging Face.
  - Tải 2 mô hình IOPaint LaMa chính thức từ Sanster:
    1. `anime-manga-big-lama.pt` (Mô hình chuyên biệt cho nét vẽ manga/manhwa/anime).
    2. `big-lama.pt` (Mô hình chuẩn cho phong cảnh và chi tiết phức tạp).
  - Kiểm tra dung lượng tối thiểu trước khi tải; thử qua danh sách mirror nếu link chính bị lỗi.
- **Thuật toán Inpainting chuẩn 1:1 Pixel-Perfect:**
  - Áp dụng đệm đối xứng Modulo-8 (`pad_img_to_modulo`) để loại bỏ hiện tượng răng cưa và biến dạng kích thước ảnh.
  - Xử lý tranh Webtoon dọc dài (> 2500px) bằng thuật toán cắt theo cửa sổ ngữ cảnh (Context Window Cropping).
  - Bảo toàn 100% kênh trong suốt Alpha (nếu có).
- **Phát hiện bóng thoại & chữ (ComicTextDetector):**
  - Chạy mô hình ONNX qua OpenCV DNN Engine.
  - Áp dụng phép giãn nở hình thái học hình elip (Elliptical Morphological Dilation) với bán kính tùy chỉnh để xóa sạch hoàn toàn viền chữ, bóng đổ và răng cưa khử răng cưa (anti-aliasing).

#### 3. XỬ LÝ ẢNH & ĐỊNH DẠNG ĐẦU RA SẮC NÉT:
- Hàm `save_pil_to_high_quality_jpg_bytes`: Lưu ảnh định dạng JPEG chất lượng cao (mặc định Quality 95, Subsampling 0 / 4:4:4, Optimize=True) để đường nét manga đen trắng và họa tiết raster giữ trọn 100% độ sắc nét gốc.
- Bảo toàn tên file gốc của người dùng (ví dụ: `2.png` -> `2_clean.jpg`).
- Xuất kèm nút bấm tải file trực tiếp (`gr.DownloadButton`) và thẻ tệp (`gr.File`) để người dùng tải trực tiếp file `.jpg`, tuyệt đối ngăn chặn việc trình duyệt tự động nén/tải về dưới dạng `.webp`.

#### 4. GIAO DIỆN WEB GRADIO (4 TABS CHUYÊN BIỆT):
- **Tab 1: 🖌️ Quẹt Cọ Xóa Nền (Interactive Canvas - Quy Trình 2 Bước Tối Ưu RAM):**
  - Giải quyết triệt để vấn đề lag và tràn RAM trên trình duyệt di động bằng kiến trúc Proxy Editing:
    - **Bước 1:** Tải ảnh gốc 1:1 lên server. Server lưu bản gốc và tự động tạo một bản Proxy thu nhỏ (mặc định cạnh lớn nhất 1280px, tiết kiệm >90% RAM canvas).
    - **Bước 2:** Người dùng quẹt cọ bôi đỏ vùng cần xóa trên `gr.ImageEditor` siêu mượt mà ở 60 FPS.
    - **Thực thi:** Server tự động phóng to mask bằng `cv2.INTER_NEAREST` về khớp 100% kích thước ảnh gốc và chạy AI inpainting trên ảnh gốc.
- **Tab 2: ⚡ Tự Động Xóa Toàn Bộ (1-Click Auto Clean):**
  - Nhận diện toàn bộ chữ và xóa tự động 1 chạm. Xuất ảnh sạch, ảnh mask, thông số thống kê và nút tải file `.jpg` sắc nét.
- **Tab 3: 📦 Xử Lý Hàng Loạt Tệp ZIP (Batch ZIP Cleaner):**
  - Tải lên tệp `.zip` chứa nhiều trang truyện.
  - Sắp xếp thứ tự tự nhiên (Natural Numerical Sort: 1, 2, ..., 10).
  - Xử lý dạng Streaming tuần tự từng ảnh trong bộ nhớ (đọc -> xóa -> nén vào zip đích -> giải phóng RAM).
  - Đặt tên file đầu ra là `{tên_gốc}_clean.jpg`.
  - **Chống quá tải máy chủ:** Cấu hình `concurrency_limit=1` riêng cho nút bấm ZIP để hàng đợi Gradio xếp hàng tuần tự, không ngốn RAM hay sập GPU server khi nhiều người dùng tải cùng lúc.
  - **Lưu trữ cố định chống mất file:** Lưu kết quả vào thư mục `outputs/`, hiển thị lịch sử Dropdown cho phép tải lại bất kỳ lúc nào. Tự động dọn dẹp các file cũ khi vượt quá 50 tệp (`cleanup_old_zips(50)`).
- **Tab 4: 📱 Kết Nối Ứng Dụng Mobile (REST API Guide):**
  - Hướng dẫn cấu hình kết nối từ các ứng dụng Client bên ngoài.

#### 5. HỆ THỐNG REST API & XỬ LÝ XUNG ĐỘT ROUTING GRADIO:
- Sử dụng FastAPI `APIRouter` với đầy đủ hỗ trợ CORS (`CORSMiddleware`, `allow_origins=["*"]`).
- **Khắc phục lỗi 405 Method Not Allowed của Gradio:**
  - Gradio 5 nội bộ bắt chặn các đường dẫn bắt đầu bằng `/api/*`. Do đó, mỗi endpoint phải được đăng ký dưới dạng **đường dẫn kép (Dual Routes)**:
    - `POST /clean_page` và `POST /api/clean_page`
    - `POST /inpaint` và `POST /api/inpaint`
    - `POST /detect` và `POST /api/detect`
    - `POST /switch_model` và `POST /api/switch_model`
    - `POST /clean_zip` và `POST /api/clean_zip`
    - `POST /v1/inpaint` và `POST /api/v1/inpaint`
    - `GET /health` và `GET /api/v1/health`
  - Khi gắn router vào ứng dụng thông qua `app.include_router(api_router)`, **tự động sắp xếp lại danh sách `app.router.routes`**, đưa các route tùy chỉnh lên vị trí đầu tiên (Index 0) để chúng được ưu tiên khớp trước khi rơi vào bộ lọc nội bộ của Gradio.
- **Khởi chạy Server:** Sử dụng cơ chế khởi chạy bản địa của Gradio `demo.launch(server_name="0.0.0.0", server_port=7860, prevent_thread_lock=True)` để tương thích hoàn toàn với container ZeroGPU của Hugging Face Spaces (tránh lỗi `Errno 98 address already in use`), sau đó gắn router và gọi `demo.block_thread()`.

---

Hãy viết toàn bộ mã nguồn Python vào file `app.py`, bao gồm tất cả các hàm tiền xử lý, cấu trúc dữ liệu Pydantic, các lớp Pipeline, giao diện Gradio Blocks hoàn chỉnh và khởi động server. Đảm bảo mã nguồn không dùng placeholder, chạy độc lập, sạch sẽ và sẵn sàng triển khai ngay lập tức.
