export type UiLanguage = 'vi' | 'en';

export interface Translations {
  // Navigation & Header
  brandTitle: string;
  brandTag: string;
  canvas: string;
  timeline: string;
  glossary: string;
  batch: string;
  runPipeline: string;
  exportChapter: string;
  exporting: string;
  aiOnline: string;
  aiOffline: string;
  linkAiKey: string;
  undo: string;
  redo: string;
  helpAndDocs: string;
  shortcutsTitle: string;

  // Tools & Canvas View
  selectTool: string;
  balloonPen: string;
  inpaintBrush: string;
  inpaintBox: string;
  autoCleanWand: string;
  resetArtwork: string;
  brushSize: string;
  eraseMaskBtn: string;
  raw: string;
  cleaned: string;
  typeset: string;
  split: string;
  holdToPeek: string;
  fitScreen: string;
  brushMode: string;
  eraserMode: string;
  clearMaskBtn: string;
  applyInpaintBtn: string;
  inpaintingProcessing: string;

  // Sidebar
  materialsGallery: string;
  filterAll: string;
  filterCleaned: string;
  filterPending: string;
  filterReview: string;
  filterPlaceholder: string;
  addPageDrop: string;
  pagesCount: string;
  inspector: string;
  settings: string;
  noPages: string;
  noPagesSub: string;
  pickFolder: string;
  pickSingleImages: string;
  noMatchingPages: string;
  statusReady: string;
  statusActive: string;
  statusPending: string;
  bubblesCountLabel: string;
  cleanedStatus: string;
  typesetProgress: string;
  ocrDoneStatus: string;

  // Inspector
  bubbleInspector: string;
  tabTranslate: string;
  tabTypography: string;
  tabEngines: string;
  sourceText: string;
  vietnameseText: string;
  reTranslate: string;
  reOcr: string;
  fontPreset: string;
  fontSize: string;
  balloonShape: string;
  boxBackground: string;
  applyToPage: string;
  resetBubble: string;
  emptyInspectorTitle: string;
  emptyInspectorDesc: string;
  autoCleaningActive: string;
  inpaintSync: string;
  deleteBubbleBtn: string;
  boxPresetLabel: string;
  presetTransparent: string;
  presetWhite: string;
  presetBlack: string;
  presetCustom: string;
  boxPaddingLabel: string;
  boxBorderRadiusLabel: string;
  boxOpacityLabel: string;
  textColorLabel: string;
  strokeColorLabel: string;
  strokeWidthLabel: string;
  lineHeightLabel: string;
  letterSpacingLabel: string;

  // Settings Modal
  settingsTitle: string;
  settingsSubtitle: string;
  uiLanguageLabel: string;
  uiLanguageDesc: string;
  langViTitle: string;
  langViDesc: string;
  langEnTitle: string;
  langEnDesc: string;
  outputFolderSection: string;
  folderNameLabel: string;
  devicePathHint: string;
  directPickerTitle: string;
  directPickerDesc: string;
  pickFolderBtn: string;
  zipExportTitle: string;
  zipExportDesc: string;
  exportZipBtn: string;
  autoSaveCache: string;
  autoSaveDesc: string;
  hapticFeedback: string;
  hapticDesc: string;
  cancelBtn: string;
  saveSettingsBtn: string;
}

export const DICTIONARY: Record<UiLanguage, Translations> = {
  vi: {
    brandTitle: 'MangaStudio AI',
    brandTag: 'Studio',
    canvas: 'Canvas',
    timeline: 'Dòng Thời Gian',
    glossary: 'Thuật Ngữ',
    batch: 'Hàng Loạt',
    runPipeline: 'Chạy Pipeline',
    exportChapter: 'Xuất Chapter',
    exporting: 'Đang xuất...',
    aiOnline: 'AI Online',
    aiOffline: 'AI Offline • Kết Nối',
    linkAiKey: 'Link AI & Key',
    undo: 'Hoàn tác (Ctrl+Z)',
    redo: 'Làm lại (Ctrl+Y)',
    helpAndDocs: 'Phím tắt & Hướng dẫn',
    shortcutsTitle: 'Phím tắt Studio',

    selectTool: 'Công cụ chọn & di chuyển (V)',
    balloonPen: 'Thêm & vẽ khung bóng thoại (B)',
    inpaintBrush: 'Bút cọ tô vùng xóa Inpaint',
    inpaintBox: 'Khoanh vùng chọn để tô xóa ảnh',
    autoCleanWand: 'AI tự quét ảnh & xóa toàn trang (ComicTextDetector + LaMa)',
    resetArtwork: 'Khôi phục ảnh gốc',
    brushSize: 'Cỡ cọ',
    eraseMaskBtn: 'Xóa',
    raw: 'Gốc',
    cleaned: 'Xóa nền',
    typeset: 'Thành phẩm',
    split: 'So sánh',
    holdToPeek: 'Giữ xem ảnh gốc',
    fitScreen: 'Vừa màn hình',
    brushMode: 'Cọ Tô',
    eraserMode: 'Cục Tẩy',
    clearMaskBtn: 'Xóa nét vẽ',
    applyInpaintBtn: 'Xóa Nền Vùng Này (LaMa)',
    inpaintingProcessing: 'Đang Xóa LaMa...',

    materialsGallery: 'Thư Viện Trang',
    filterAll: 'Tất Cả',
    filterCleaned: 'Đã Xong',
    filterPending: 'Chờ Dịch',
    filterReview: 'Duyệt',
    filterPlaceholder: 'Lọc trang (vd: 01, splash)...',
    addPageDrop: 'Thêm Trang hoặc Thả PSD / ZIP',
    pagesCount: 'Trang',
    inspector: 'Thuộc Tính',
    settings: 'Cài Đặt',
    noPages: 'Chưa có trang truyện nào',
    noPagesSub: 'Chọn thư mục chapter hoặc kéo thả PSD/ZIP vào đây',
    pickFolder: 'Chọn Thư Mục Ảnh',
    pickSingleImages: 'Thêm Từng Ảnh Lẻ',
    noMatchingPages: 'Không tìm thấy trang phù hợp',
    statusReady: 'Đã xong',
    statusActive: 'Đang chọn',
    statusPending: 'Chờ dịch',
    bubblesCountLabel: 'Ô thoại',
    cleanedStatus: 'Đã xóa nền',
    typesetProgress: 'Đang chỉnh chữ',
    ocrDoneStatus: 'Đã quét OCR',

    bubbleInspector: 'Thuộc Tính Ô Thoại',
    tabTranslate: 'Dịch Thuật',
    tabTypography: 'Kiểu Chữ',
    tabEngines: 'Khung & Nền',
    sourceText: 'Chữ Gốc (MangaOCR v3)',
    vietnameseText: 'Bản Dịch Tiếng Việt',
    reTranslate: 'Dịch Lại Bằng AI',
    reOcr: 'Quét Lại OCR',
    fontPreset: 'Phông Chữ Manga Việt Hóa',
    fontSize: 'Cỡ Chữ',
    balloonShape: 'Dáng Khung Thoại Manga',
    boxBackground: 'Nền Hộp Thoại (Fill & Opacity)',
    applyToPage: 'Áp Dụng Vào Trang (Cmd+S)',
    resetBubble: 'Đặt Lại Kiểu Chữ',
    emptyInspectorTitle: 'Chưa Chọn Ô Thoại Nào',
    emptyInspectorDesc: 'Nhấp chọn một bong bóng thoại trên canvas hoặc bấm nút "+" trên đầu để tạo mới.',
    autoCleaningActive: 'Lớp xóa chữ tự động',
    inpaintSync: 'Đã đồng bộ Inpaint',
    deleteBubbleBtn: 'Xóa Ô Thoại Này (Delete)',
    boxPresetLabel: 'Mẫu Nền Khung Thoại',
    presetTransparent: 'Trong Suốt',
    presetWhite: 'Nền Trắng',
    presetBlack: 'Nền Đen',
    presetCustom: 'Tự Chọn',
    boxPaddingLabel: 'Khoảng Cách Đệm Khung',
    boxBorderRadiusLabel: 'Bo Góc Khung (px)',
    boxOpacityLabel: 'Độ Mờ Đục Nền',
    textColorLabel: 'Màu Chữ',
    strokeColorLabel: 'Viền Chữ (Stroke)',
    strokeWidthLabel: 'Độ Dày Viền',
    lineHeightLabel: 'Giãn Dòng',
    letterSpacingLabel: 'Giãn Chữ',

    settingsTitle: 'Cài Đặt Studio & Dự Án',
    settingsSubtitle: 'Ngôn ngữ giao diện, thư mục xuất và tùy chọn hệ thống',
    uiLanguageLabel: 'Ngôn Ngữ Giao Diện (UI Language)',
    uiLanguageDesc: 'Chọn ngôn ngữ hiển thị cho các thanh công cụ, menu và bảng thuộc tính',
    langViTitle: 'Tiếng Việt',
    langViDesc: 'Giao diện & thuật ngữ dịch truyện chuẩn tiếng Việt',
    langEnTitle: 'English',
    langEnDesc: 'Standard Editorial Studio mode & International terms',
    outputFolderSection: 'Thư Mục Lưu Kết Quả Dịch',
    folderNameLabel: 'Tên Thư Mục Lưu (Android / Thiết bị)',
    devicePathHint: 'Ảnh xuất sẽ được lưu vào Documents/[Tên thư mục]/',
    directPickerTitle: 'Chọn Thư Mục Lưu Trực Tiếp (PC / Trình duyệt)',
    directPickerDesc: 'Ghi thẳng ảnh thành phẩm vào thư mục ổ cứng mà không cần tải lẻ từng file',
    pickFolderBtn: 'Chọn Thư Mục Trên Máy',
    zipExportTitle: 'Đóng Gói Trọn Bộ Thư Mục (.ZIP)',
    zipExportDesc: 'Tải toàn bộ các trang truyện đã dịch gom chung trong một file nén .ZIP duy nhất',
    exportZipBtn: 'Tải Về Toàn Bộ Trang (.ZIP)',
    autoSaveCache: 'Tự Động Lưu Dữ Liệu Cache',
    autoSaveDesc: 'Lưu tự động tọa độ ô thoại và bản xóa vào bộ nhớ trình duyệt',
    hapticFeedback: 'Rung Phản Hồi Khi Chạm (Haptic)',
    hapticDesc: 'Tạo rung nhẹ chân thực khi thao tác trên màn hình điện thoại',
    cancelBtn: 'Hủy',
    saveSettingsBtn: 'Lưu Cấu Hình',
  },
  en: {
    brandTitle: 'MangaStudio AI',
    brandTag: 'Studio',
    canvas: 'Canvas',
    timeline: 'Timeline',
    glossary: 'Glossary',
    batch: 'Batch',
    runPipeline: 'Run Pipeline',
    exportChapter: 'Export Chapter',
    exporting: 'Exporting...',
    aiOnline: 'AI Online',
    aiOffline: 'AI Offline • Connect',
    linkAiKey: 'AI Link & Key',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Y)',
    helpAndDocs: 'Shortcuts & Docs',
    shortcutsTitle: 'Studio Shortcuts',

    selectTool: 'Select & Move Tool (V)',
    balloonPen: 'Speech Balloon Pen (B)',
    inpaintBrush: 'Inpaint Eraser Brush',
    inpaintBox: 'Marquee Area Inpaint Box',
    autoCleanWand: 'AI Auto-Clean Full Page (ComicTextDetector + LaMa)',
    resetArtwork: 'Reset Original Artwork',
    brushSize: 'Brush',
    eraseMaskBtn: 'Erase',
    raw: 'Raw',
    cleaned: 'Cleaned',
    typeset: 'Typeset',
    split: 'Split',
    holdToPeek: 'Hold to Peek Raw',
    fitScreen: 'Fit Screen',
    brushMode: 'Brush',
    eraserMode: 'Eraser',
    clearMaskBtn: 'Clear Mask',
    applyInpaintBtn: 'Erase Area (LaMa)',
    inpaintingProcessing: 'Inpainting LaMa...',

    materialsGallery: 'Page Gallery',
    filterAll: 'All',
    filterCleaned: 'Ready',
    filterPending: 'Pending',
    filterReview: 'Review',
    filterPlaceholder: 'Filter pages (e.g. 01, splash)...',
    addPageDrop: 'Add Page or Drop PSD / ZIP',
    pagesCount: 'Pages',
    inspector: 'Inspector',
    settings: 'Settings',
    noPages: 'No pages loaded yet',
    noPagesSub: 'Select a chapter folder or drop PSD/ZIP files here',
    pickFolder: 'Select Image Folder',
    pickSingleImages: 'Add Individual Images',
    noMatchingPages: 'No matching pages found',
    statusReady: 'Ready',
    statusActive: 'Active',
    statusPending: 'Pending',
    bubblesCountLabel: 'Bubbles',
    cleanedStatus: 'Cleaned',
    typesetProgress: 'Typesetting',
    ocrDoneStatus: 'OCR Done',

    bubbleInspector: 'Bubble Inspector',
    tabTranslate: 'Translate',
    tabTypography: 'Typography',
    tabEngines: 'Engines & Box',
    sourceText: 'Source Text (MangaOCR v3)',
    vietnameseText: 'Translated Text (Target)',
    reTranslate: 'Re-Translate with AI',
    reOcr: 'Re-Scan OCR',
    fontPreset: 'Manga Font Presets',
    fontSize: 'Font Size',
    balloonShape: 'Manga Balloon Shapes',
    boxBackground: 'Balloon Fill & Opacity',
    applyToPage: 'Apply to Page (Cmd+S)',
    resetBubble: 'Reset Style',
    emptyInspectorTitle: 'No Bubble Selected',
    emptyInspectorDesc: 'Click a speech bubble on the canvas or press "+" above to create one.',
    autoCleaningActive: 'Auto-cleaning active layer',
    inpaintSync: 'Inpainting Synchronized',
    deleteBubbleBtn: 'Delete This Bubble (Delete)',
    boxPresetLabel: 'Box Background Style',
    presetTransparent: 'Transparent',
    presetWhite: 'White',
    presetBlack: 'Black',
    presetCustom: 'Custom',
    boxPaddingLabel: 'Box Padding',
    boxBorderRadiusLabel: 'Border Radius (px)',
    boxOpacityLabel: 'Background Opacity',
    textColorLabel: 'Text Color',
    strokeColorLabel: 'Text Stroke',
    strokeWidthLabel: 'Stroke Width',
    lineHeightLabel: 'Line Height',
    letterSpacingLabel: 'Letter Spacing',

    settingsTitle: 'Studio Settings & Project',
    settingsSubtitle: 'Interface language, output destination and studio preferences',
    uiLanguageLabel: 'Interface Language',
    uiLanguageDesc: 'Choose display language across toolbars, menus, and inspector',
    langViTitle: 'Tiếng Việt',
    langViDesc: 'Vietnamese interface & prompts',
    langEnTitle: 'English',
    langEnDesc: 'Standard Editorial Studio mode',
    outputFolderSection: 'Export Destination & Output',
    folderNameLabel: 'Output Folder Name (Device / Mobile)',
    devicePathHint: 'Pages saved automatically to Documents/[Folder Name]/',
    directPickerTitle: 'Direct Output Directory (Desktop File System)',
    directPickerDesc: 'Writes rendered pages directly to chosen disk directory',
    pickFolderBtn: 'Select Output Directory',
    zipExportTitle: 'Full Chapter ZIP Package',
    zipExportDesc: 'Export all translated pages into a single organized .ZIP file',
    exportZipBtn: 'Download All Pages (.ZIP)',
    autoSaveCache: 'Auto-Save Project Cache',
    autoSaveDesc: 'Persist bubble bounding boxes & cleaned layers to IndexedDB',
    hapticFeedback: 'Mobile Haptic Feedback',
    hapticDesc: 'Tactile vibration pulses on touch gesture handles',
    cancelBtn: 'Cancel',
    saveSettingsBtn: 'Save Preferences',
  },
};

const STORAGE_KEY = 'manga_studio_ui_lang';

export const getSavedLanguage = (): UiLanguage => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {}
  return 'vi';
};

export const saveLanguage = (lang: UiLanguage): void => {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
};
