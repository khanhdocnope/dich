# Serene Editorial Studio - Kế hoạch Triển khai Giao diện

Tài liệu theo dõi tiến độ chuyển đổi toàn diện giao diện Manga Studio sang hệ thống thiết kế **Serene Editorial Studio** (kết hợp triết lý Apple Minimalism và độ hoàn thiện tinh tế của Slack, lấy từ `stitch_minimal_bento_glass_ui`).

---

## 📌 Danh sách các Task chi tiết

### [x] Task 1: Hệ thống Token & CSS Bento Glass Studio hoàn chỉnh
- [x] Khai báo toàn bộ Design Tokens màu trong `:root` (`--graphite-base`, `--graphite-surface`, `--graphite-subtle`, `--slack-aubergine-deep`, `--primary-container`, `--primary`, `--secondary`, v.v.).
- [x] Thiết lập hệ Typography chuẩn Inter (`headline-xl`, `headline-md`, `title-md`, `body-md`, `label-sm`, `code-sm`).
- [x] Hoàn thiện lớp nền `studio-grid-matrix` (ma trận chấm bi 24px) và Apple precision handles.
- [x] Tích hợp thanh cuộn siêu mảnh `custom-scroll` và các utility pill button.

### [x] Task 2: Top App Bar & Studio Header
- [x] Brand Logo Badge: Khối gradient aubergine (`#611f69` ➔ `#2E103A`), icon `auto_stories`, tiêu đề `MangaStudio AI`.
- [x] Chapter Selector dropdown pill: Tên chương / thư mục hiện tại, chấm trạng thái, icon `expand_more`.
- [x] Compute Status pill: Ping xanh/vàng hoạt họa theo thời gian thực (`Google Colab A100 • 128ms` hoặc `Offline`).
- [x] Center Navigation links: `Canvas` (Active), `Timeline`, `Glossary`, `Batch`.
- [x] Right Action Cluster:
  - Lịch sử Undo / Redo (`history` / `undo` / `redo`).
  - Cấu hình thư mục xuất (`tune` / `folder_open`).
  - Trợ giúp & Phím tắt (`help` popover).
  - Nút phụ `Run Pipeline` (`bolt`).
  - Nút chính `Export Chapter` (`file_download`, aubergine pill).
  - Studio Profile Avatar pill.

### [x] Task 3: Left Sidebar (Pages Filmstrip & Thư viện trang)
- [x] Header sidebar: Tên chương + Badge đếm trang `28 Pages • OCR Ready`.
- [x] Bộ lọc phân loại 4 nút Slack-style: `All`, `Pending`, `Review`, `Ready`.
- [x] Danh sách thẻ Filmstrip tỷ lệ 2:3 với số trang badge (`01`, `02`), tên trang, chip trạng thái (`Ready`, `Review`, `Pending`, `Active`).
- [x] Thẻ Active: Nền `#2E103A`, vạch chỉ điểm `#fbabfe`, chấm thở animation `Active`.
- [x] Bottom action: Dropzone nét đứt `Add Page or Drop PSD / ZIP`, nút toggle Inspector và Settings.

### [x] Task 4: Center Viewport Canvas & Interactive Dialogue Nodes
- [x] Top Floating View Pill Toolbar:
  - Mode Switcher: `Raw` | `Cleaned` | `Typeset`.
  - Zoom Controls: `-`, tỷ lệ `85%`, `+`, `Fit`.
  - Giữ để soi ảnh gốc: `Hold to Peek Raw`.
- [x] Interactive Dialogue Pins trên Canvas:
  - Các pin thoại chưa chọn dạng số tròn `1`, `2`, `5` với viền aubergine và số thứ tự tự động.
  - Box thoại đang chọn: Viền `#fbabfe`, 8 điểm neo biến đổi Apple precision handles, badge sequence `#B-04` gắn chấm xanh hoạt động.
- [x] Bottom Floating Atelier Tool Dock:
  - `Select` (V), `OCR Box` (O), `Balloon Pen` (B).
  - Bút xóa inpaint với radius stepper `24px ▲/▼`.
  - Nút khôi phục ảnh gốc, Hoàn tác / Làm lại và Magic Inpaint Fill (I).

### [x] Task 5: Right Inspector Panel (Bảng thuộc tính 3 Tab)
- [x] Header Inspector với Sequence Tag `#B-04` và nút `more_horiz`.
- [x] Segmented Tab Slider 3 mục: `Dịch Thuật` | `Kiểu Chữ` | `Khung Nền`.
- [x] Tab 1 (`Translate`):
  - Card Japanese Source OCR: Độ tin cậy `99.4% conf`, RTL tag, nút `Re-OCR`.
  - Card Target Translation: Tone selector (`Dramatic Action`), ô nhập bản dịch, nút làm mới AI Claude/Gemini.
  - AI Variations: Danh sách câu dịch gợi ý kèm nút `+` gán nhanh.
- [x] Tab 2 (`Typography`):
  - Công tắc bật/tắt `Auto-Fit`.
  - Dropdown chọn Font (`CC Wild Words`, anime fonts...).
  - Cặp số điều chỉnh Font Size (`13.5 pt ▲/▼`) và Leading / Dãn dòng (`105% ▲/▼`).
  - Lưới 6 Archetype hình dạng bóng thoại manga (Elliptic, Bo tròn, Bùng nổ, Suy nghĩ, Thì thầm, Trong suốt).
- [x] Tab 3 (`Khung Nền / Container`): Presets nền, Fill & Stroke, bo góc và đệm chữ.
- [x] Bottom Inspector Footer: Nút `Apply to Page (Cmd+S)`, nút reset thuộc tính và trạng thái `Inpainting Synchronized`.

### [x] Task 6: Giao diện Mobile Viewport (`moji_mobile_compact`)
- [x] Mobile Top Bar siêu gọn (`MangaStudio AI` + AI magic trigger).
- [x] Telemetry bar di động (`Studio Engine 60fps • 16ms`, quick undo/redo, indicator `P.01/10`).
- [x] Khung thoại nổi trực tiếp ở đáy canvas di động (Inline Dialogue input + Stepper font + Chips hình dạng).
- [x] Bottom navigation bar di động 4 tab chuẩn: `Trang`, `AI Online`, `Ô Thoại`, `Xuất`.
- [x] Bottom sheet drawers kéo mở mượt mà cho Trang và Inspector.

### [x] Task 7: Hoàn thiện Modals Studio & Kiểm thử hoạt động
- [x] Thiết kế lại các Modal (`ColabModal`, `BatchProcessorModal`, `OutputFolderModal`) theo phong cách Bento Glass.
- [x] Kiểm thử toàn diện quy trình làm việc từ Import ➔ Inpaint ➔ Typeset ➔ Export.
