import React, { useState, useRef, useEffect } from 'react';
import { 
  Images, 
  Search, 
  CheckCircle, 
  Clock, 
  FileImage, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  X, 
  ImagePlus, 
  Trash2, 
  FolderOpen,
  FolderCheck,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { PageItem } from '../types';
import { UiLanguage, DICTIONARY } from '../services/i18n';

interface SidebarProps {
  images: PageItem[];
  selectedFilename: string | null;
  currentFolderName?: string;
  onSelectImage: (filename: string) => void;
  onRefreshList: () => void;
  onAddImages: (files: FileList | File[]) => void;
  onDeleteImage?: (filename: string) => void;
  onClearAllImages?: () => void;
  onOpenOutputModal?: () => void;
  isLoading: boolean;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  width?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  uiLang?: UiLanguage;
}

/**
 * High-performance Lazy Thumbnail Component
 * Uses IntersectionObserver so 50-100 4K images don't flood browser GPU texture RAM.
 * Falls back gracefully to a stylized Error Placeholder if an image is corrupt.
 */
const LazySidebarThumbnail: React.FC<{
  src: string;
  alt: string;
  className?: string;
  isDone?: boolean;
}> = ({ src, alt, className = '', isDone }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Use IntersectionObserver with 150px margin for buttery-smooth pre-loading
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true);
              observer.disconnect();
            }
          });
        },
        { rootMargin: '150px' }
      );

      observer.observe(containerRef.current);
      return () => observer.disconnect();
    } else {
      setIsInView(true);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-12 h-16 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-slate-800/90 flex items-center justify-center relative select-none ${className}`}
    >
      {hasError ? (
        <div
          className="flex flex-col items-center justify-center p-1 text-center w-full h-full bg-red-950/40 border border-red-800/40"
          title={`Lỗi nạp ảnh: ${alt}`}
        >
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-bounce" />
          <span className="text-[8px] text-red-300 font-semibold mt-0.5 leading-none">Hỏng</span>
        </div>
      ) : isInView ? (
        <>
          {!isLoaded && (
            <div className="absolute inset-0 bg-slate-900/80 animate-pulse flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 text-indigo-400/50 animate-spin" />
            </div>
          )}
          <img
            src={src}
            alt={alt}
            decoding="async"
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setHasError(true);
              setIsLoaded(true);
            }}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        <div className="w-full h-full bg-slate-900/60" />
      )}

      {isDone && !hasError && (
        <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-md ring-1 ring-black/40">
          <CheckCircle className="w-2.5 h-2.5" />
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  images,
  selectedFilename,
  currentFolderName,
  onSelectImage,
  onRefreshList,
  onAddImages,
  onDeleteImage,
  onClearAllImages,
  onOpenOutputModal,
  isLoading,
  isOpenMobile = false,
  onCloseMobile,
  width,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  uiLang = 'vi',
}) => {
  const t = DICTIONARY[uiLang];
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const toggleCollapsed = () => {
    if (onToggleCollapse) {
      onToggleCollapse(!isCollapsed);
    } else {
      setInternalCollapsed(!isCollapsed);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'raw' | 'done'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const filteredImages = images.filter((img) => {
    const matchesSearch = img.filename.toLowerCase().includes(searchTerm.toLowerCase());
    if (filter === 'done') return matchesSearch && img.status === 'done';
    if (filter === 'raw') return matchesSearch && img.status !== 'done';
    return matchesSearch;
  });

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (e.target.files && e.target.files.length > 0) {
        onAddImages(e.target.files);
        e.target.value = '';
      }
    } catch (err) {
      console.error('File input change error:', err);
    }
  };

  const handleTriggerPickImages = () => {
    fileInputRef.current?.click();
  };

  const handleTriggerPickFolder = () => {
    folderInputRef.current?.click();
  };

  return (
    <aside
      className={`sidebar-drawer ${isOpenMobile ? 'open' : ''} relative h-full bg-[#0E0E10] border-r border-[rgba(255,255,255,0.08)] transition-all duration-200 flex flex-col z-20 select-none ${
        isCollapsed ? 'w-14' : !width ? 'w-72 sm:w-80' : ''
      }`}
      style={!isOpenMobile && !isCollapsed && width ? { width, minWidth: '200px', maxWidth: '40%' } : undefined}
    >
      {/* Mobile Bottom Sheet Pull Pill Handle */}
      <div className="mobile-only flex justify-center w-full pt-1 pb-0.5">
        <div className="bottom-sheet-drag-handle" />
      </div>

      {/* Hidden File Input for Individual/Multiple Images */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* Hidden Folder Input for Entire Directory Selection */}
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFileInputChange}
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
      />

      {/* Top Header & Chapter Title */}
      <div className="p-space-md border-b border-whisper space-y-space-sm shrink-0 bg-graphite-surface">
        {!isCollapsed ? (
          <div className="flex items-center justify-between w-full min-w-0 pr-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-title-md font-title-md text-ink-paper font-semibold truncate">
                {currentFolderName ? currentFolderName : (uiLang === 'en' ? 'Ch. 04: The Awakening' : 'Chương 04: Khởi Đầu')}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-surface-container border border-whisper text-label-sm font-label-sm text-text-muted shrink-0 ml-1">
              {images.length} {t.pagesCount} • OCR {t.statusReady}
            </span>
          </div>
        ) : (
          <div className="mx-auto">
            <span className="material-symbols-outlined text-[18px] text-primary">auto_stories</span>
          </div>
        )}

        {/* Header Action Controls */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="mobile-only p-1 rounded-lg text-text-muted hover:text-ink-paper hover:bg-graphite-subtle transition-colors"
              title="Đóng danh sách trang"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onRefreshList}
            disabled={isLoading}
            className="w-7 h-7 rounded-lg text-text-muted hover:text-ink-paper hover:bg-graphite-subtle flex items-center justify-center transition-colors"
            title="Làm mới danh sách trang"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={toggleCollapsed}
            className="desktop-only w-7 h-7 rounded-lg text-text-muted hover:text-ink-paper hover:bg-graphite-subtle flex items-center justify-center transition-colors"
            title={isCollapsed ? 'Mở rộng thư viện' : 'Thu gọn'}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <>
          {/* Section 1: Slack-inspired Filter Chips (Segmented Badges) */}
          <div className="p-space-md border-b border-whisper space-y-space-sm bg-graphite-base shrink-0">
            {/* 3 Segmented Badges: All | Pending | Ready (w-full overflow-hidden prevents overflowing outside border) */}
            <div className="w-full flex items-center bg-surface-container-lowest p-1 rounded-lg border border-whisper overflow-hidden">
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 min-w-0 py-1 px-1 rounded-md text-[11px] font-medium transition-all text-center truncate ${
                  filter === 'all'
                    ? 'bg-graphite-surface text-ink-paper shadow-sm'
                    : 'hover:bg-graphite-subtle text-text-muted hover:text-ink-paper'
                }`}
                title={t.filterAll}
              >
                {t.filterAll}
              </button>
              <button
                onClick={() => setFilter('raw')}
                className={`flex-1 min-w-0 py-1 px-1 rounded-md text-[11px] font-medium transition-all text-center truncate ${
                  filter === 'raw'
                    ? 'bg-graphite-surface text-ink-paper shadow-sm'
                    : 'hover:bg-graphite-subtle text-text-muted hover:text-ink-paper'
                }`}
                title={t.filterPending}
              >
                {t.filterPending}
              </button>
              <button
                onClick={() => setFilter('done')}
                className={`flex-1 min-w-0 py-1 px-1 rounded-md text-[11px] font-medium transition-all text-center truncate ${
                  filter === 'done'
                    ? 'bg-graphite-surface text-ink-paper shadow-sm'
                    : 'hover:bg-graphite-subtle text-text-muted hover:text-ink-paper'
                }`}
                title={t.filterCleaned}
              >
                {t.filterCleaned}
              </button>
            </div>

            {/* Quick Search Field */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-text-muted" />
              <input
                type="text"
                placeholder={t.filterPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface-container-lowest border border-whisper text-label-sm rounded-xl pl-8 pr-3 py-1.5 text-ink-paper placeholder-text-muted focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Section 2: Manga Page Filmstrip Thumbnails */}
          <div className="flex-1 overflow-y-auto custom-scroll p-2.5 space-y-2">
            {images.length === 0 ? (
              <div className="text-center py-10 px-3 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#2E103A] border border-[#611f69] flex items-center justify-center text-[#fbabfe]">
                  <FolderOpen className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#F5F5F7]">{t.noPages}</div>
                  <div className="text-[11px] text-[#8E8E93] mt-1 leading-relaxed">
                    {t.noPagesSub}
                  </div>
                </div>
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleTriggerPickFolder}
                    className="w-full py-2 px-3 rounded-xl bg-[#611f69] hover:bg-[#73257D] text-white text-xs font-medium border border-white/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{t.pickFolder}</span>
                  </button>
                  <button
                    onClick={handleTriggerPickImages}
                    className="w-full py-2 px-3 rounded-xl bg-[#1f1f21] hover:bg-[#222226] text-[#F5F5F7] text-xs font-medium border border-[rgba(255,255,255,0.08)] transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-[#9dcaff]" />
                    <span>{t.pickSingleImages}</span>
                  </button>
                </div>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#8E8E93]">
                {t.noMatchingPages}
              </div>
            ) : (
              filteredImages.map((img, idx) => {
                const isSelected = img.filename === selectedFilename;
                const isDone = img.status === 'done';
                const thumbSrc = img.thumbnailUrl || img.rawUrl;
                const pageNumber = idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`;
                const titleOnly = img.filename.replace(/\.[^/.]+$/, '');

                return (
                  <div
                    key={img.filename}
                    onClick={() => {
                      onSelectImage(img.filename);
                      onCloseMobile?.();
                    }}
                    className={`group relative flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all border overflow-hidden ${
                      isSelected
                        ? 'bg-slack-aubergine-deep border-primary-container/80 shadow-sm'
                        : 'bg-surface-container-lowest border-whisper hover:border-white/20 hover:bg-graphite-subtle text-text-muted'
                    }`}
                  >
                    {/* Active Page Indicator Line */}
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                    )}

                    {/* 2:3 Aspect Ratio Thumbnail Container */}
                    <div className={`relative w-14 h-18 aspect-[2/3] rounded-md overflow-hidden bg-surface-container shrink-0 ${isSelected ? 'border border-primary/30' : 'border border-whisper'}`}>
                      <LazySidebarThumbnail
                        src={thumbSrc}
                        alt={img.filename}
                        isDone={isDone}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className={`absolute bottom-1 right-1 text-[10px] px-1 py-0.2 rounded font-mono ${
                        isSelected ? 'bg-primary-container text-white' : 'bg-black/80 text-white/90'
                      }`}>
                        {pageNumber}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0 pr-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-body-sm font-body-sm font-medium text-ink-paper truncate" title={img.filename}>
                          {titleOnly}
                        </span>
                        {isDone ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>{t.statusReady}
                          </span>
                        ) : isSelected ? (
                          <span className="flex items-center gap-1 text-[11px] text-primary shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>{t.statusActive}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-text-muted shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500"></span>{t.statusPending}
                          </span>
                        )}
                      </div>

                      <p className="text-label-sm font-label-sm text-text-muted truncate">
                        {isDone ? `3 ${t.bubblesCountLabel} • ${t.cleanedStatus}` : isSelected ? `7 ${t.bubblesCountLabel} • ${t.typesetProgress}` : `4 ${t.bubblesCountLabel} • ${t.ocrDoneStatus}`}
                      </p>
                    </div>

                    {/* Delete action on hover */}
                    {onDeleteImage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Xóa trang "${img.filename}"?`)) {
                            onDeleteImage(img.filename);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-all shrink-0"
                        title="Xóa trang này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Section 3: Add Page / Dropzone & Footer Utilities */}
          <div className="p-space-md border-t border-whisper space-y-space-sm bg-surface-container-lowest/60 shrink-0">
            <button
              onClick={handleTriggerPickFolder}
              className="w-full py-2.5 px-3 rounded-xl border border-dashed border-whisper hover:border-primary/50 bg-graphite-surface/40 hover:bg-graphite-subtle flex items-center justify-center gap-2 text-label-md font-label-md text-text-muted hover:text-ink-paper transition-all duration-150 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
              <span>{t.addPageDrop}</span>
            </button>

            <div className="flex items-center justify-between text-label-sm font-label-sm text-text-muted pt-1">
              {onOpenOutputModal && (
                <button
                  onClick={onOpenOutputModal}
                  className="hover:text-ink-paper flex items-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">dock_to_left</span>
                  <span>{t.inspector}</span>
                </button>
              )}

              {onOpenOutputModal && (
                <button
                  onClick={onOpenOutputModal}
                  className="hover:text-ink-paper flex items-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">settings</span>
                  <span>{t.settings}</span>
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Collapsed View Icons (Fixed to render when isCollapsed is true) */
        <div className="flex-1 overflow-y-auto custom-scroll p-1.5 space-y-2 flex flex-col items-center">
          <button
            onClick={handleTriggerPickFolder}
            className="w-9 h-9 rounded-xl bg-[#2E103A] border border-[#611f69] text-[#fbabfe] flex items-center justify-center hover:bg-[#611f69] transition-all"
            title="Chọn cả thư mục ảnh"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            onClick={handleTriggerPickImages}
            className="w-9 h-9 rounded-xl bg-[#1f1f21] border border-[rgba(255,255,255,0.08)] text-[#9dcaff] flex items-center justify-center hover:bg-[#222226] transition-all"
            title="Thêm ảnh lẻ từ thiết bị"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          {images.map((img) => (
            <div
              key={img.filename}
              onClick={() => onSelectImage(img.filename)}
              className={`w-9 h-12 rounded-lg overflow-hidden cursor-pointer border relative transition-all ${
                img.filename === selectedFilename
                  ? 'border-[#fbabfe] ring-2 ring-[#fbabfe]/30'
                  : 'border-[rgba(255,255,255,0.08)] hover:border-white/30'
              }`}
              title={img.filename}
            >
              <LazySidebarThumbnail
                src={img.thumbnailUrl || img.rawUrl}
                alt={img.filename}
                className="w-full h-full"
                isDone={img.status === 'done'}
              />
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
