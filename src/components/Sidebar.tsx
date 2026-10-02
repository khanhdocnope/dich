import React, { useState, useRef } from 'react';
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
  FolderPlus,
  FolderCheck,
  FolderOpen
} from 'lucide-react';
import { PageItem } from '../types';

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
}

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
}) => {
  const [collapsed, setCollapsed] = useState(false);
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

  const doneCount = images.filter((img) => img.status === 'done').length;

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddImages(e.target.files);
      e.target.value = '';
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
      className={`sidebar-drawer ${isOpenMobile ? 'open' : ''} relative h-full glass-panel border-r border-slate-800 transition-all duration-300 flex flex-col z-20 select-none ${
        collapsed ? 'w-14' : 'w-72 sm:w-80'
      }`}
    >
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

      {/* Top Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/50">
        {!collapsed && (
          <div className="flex items-center space-x-2 truncate">
            <Images className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="truncate">
              <h2 className="font-semibold text-xs tracking-wide uppercase text-slate-200 truncate">
                {currentFolderName ? `📁 ${currentFolderName}` : 'Thư Viện Ảnh'} ({images.length})
              </h2>
            </div>
          </div>
        )}
        <div className="flex items-center space-x-1 ml-auto">
          {/* Quick Add Folder Button (Collapsed & Mobile) */}
          <button
            onClick={handleTriggerPickFolder}
            className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white transition-all border border-indigo-500/30"
            title="Chọn cả thư mục ảnh từ máy/thẻ nhớ"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          {/* Mobile Close Button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="mobile-only p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Đóng danh sách trang"
            >
              <X className="w-4 h-4 text-slate-300" />
            </button>
          )}

          <button
            onClick={onRefreshList}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Làm mới danh sách ảnh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="desktop-only p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title={collapsed ? 'Mở rộng thư viện' : 'Thu gọn'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Action Bar: Add Photos / Folders */}
          <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/70 shrink-0 space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              {/* Pick Folder Button */}
              <button
                onClick={handleTriggerPickFolder}
                className="py-2 px-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[11.5px] font-semibold shadow-md shadow-purple-500/20 flex items-center justify-center space-x-1.5 transition-all active:scale-[0.98]"
                title="Chọn toàn bộ thư mục chứa các trang ảnh truyện"
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Chọn Thư Mục</span>
              </button>

              {/* Pick Multiple Images Button */}
              <button
                onClick={handleTriggerPickImages}
                className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11.5px] font-semibold border border-slate-700/80 flex items-center justify-center space-x-1.5 transition-all active:scale-[0.98]"
                title="Chọn từng ảnh hoặc nhiều ảnh lẻ từ thư viện"
              >
                <ImagePlus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">Thêm Ảnh</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              {onOpenOutputModal && (
                <button
                  onClick={onOpenOutputModal}
                  className="text-[10.5px] text-indigo-300 hover:text-indigo-200 transition-colors flex items-center space-x-1 py-0.5 px-1 bg-indigo-950/40 border border-indigo-800/40 rounded-md"
                  title="Cài đặt thư mục xuất và đóng gói ZIP"
                >
                  <FolderCheck className="w-3 h-3 text-indigo-400" />
                  <span>Cài Đặt Thư Mục Lưu</span>
                </button>
              )}

              {images.length > 0 && onClearAllImages && (
                <button
                  onClick={() => {
                    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ danh sách ảnh hiện tại?')) {
                      onClearAllImages();
                    }
                  }}
                  className="text-[10.5px] text-slate-400 hover:text-red-400 transition-colors flex items-center space-x-1 py-0.5 px-1 ml-auto"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Xóa tất cả</span>
                </button>
              )}
            </div>
          </div>


          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-slate-800 space-y-2.5 shrink-0 bg-slate-950">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Tìm trang (VD: 02, 15)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center space-x-1 text-[11px]">
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 py-1 rounded-md transition-all font-medium text-center ${
                  filter === 'all'
                    ? 'bg-slate-800 text-slate-200 font-semibold shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Tất cả ({images.length})
              </button>
              <button
                onClick={() => setFilter('raw')}
                className={`flex-1 py-1 rounded-md transition-all font-medium text-center ${
                  filter === 'raw'
                    ? 'bg-slate-800 text-amber-300 font-semibold border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Chưa ({images.length - doneCount})
              </button>
              <button
                onClick={() => setFilter('done')}
                className={`flex-1 py-1 rounded-md transition-all font-medium text-center ${
                  filter === 'done'
                    ? 'bg-slate-800 text-emerald-300 font-semibold border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Xong ({doneCount})
              </button>
            </div>
          </div>

          {/* Image List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {images.length === 0 ? (
              <div className="text-center py-10 px-4 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-indigo-400">
                  <FolderOpen className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">Chưa có trang truyện nào</div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    Chọn cả thư mục chapter hoặc chọn từng ảnh từ bộ sưu tập
                  </div>
                </div>
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleTriggerPickFolder}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-purple-600/30 transition-all active:scale-95 flex items-center justify-center space-x-1.5"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>📁 Chọn Thư Mục Ảnh</span>
                  </button>
                  <button
                    onClick={handleTriggerPickImages}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all active:scale-95 flex items-center justify-center space-x-1.5"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>🖼️ Chọn Từng Ảnh Lẻ</span>
                  </button>
                </div>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Không tìm thấy trang phù hợp
              </div>
            ) : (
              filteredImages.map((img, idx) => {
                const isSelected = img.filename === selectedFilename;
                const isDone = img.status === 'done';
                const isProgress = img.status === 'in_progress';

                return (
                  <div
                    key={img.filename}
                    onClick={() => {
                      onSelectImage(img.filename);
                      onCloseMobile?.();
                    }}
                    className={`group relative flex items-center space-x-3 p-2 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-slate-800/90 border-indigo-500 text-white shadow-md ring-1 ring-indigo-500/20'
                        : 'bg-slate-900/80 border-slate-800/80 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    {/* Thumbnail preview */}
                    <div className="w-12 h-16 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-slate-800 flex items-center justify-center relative">
                      <img
                        src={img.rawUrl}
                        alt={img.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {isDone && (
                        <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow">
                          <CheckCircle className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs truncate" title={img.filename}>
                          {img.filename}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
                          #{idx + 1}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between">
                        <div>
                          {isDone ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-emerald-400 bg-slate-950 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                              <CheckCircle className="w-2.5 h-2.5" />
                              <span>Đã xuất</span>
                            </span>
                          ) : isProgress ? (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-amber-400 bg-slate-950 border border-amber-800/60 px-1.5 py-0.5 rounded">
                              <Clock className="w-2.5 h-2.5" />
                              <span>Đang sửa</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-slate-400 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded">
                              <FileImage className="w-2.5 h-2.5" />
                              <span>Ảnh gốc</span>
                            </span>
                          )}
                        </div>

                        {/* Delete button per image */}
                        {onDeleteImage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Xóa trang "${img.filename}"?`)) {
                                onDeleteImage(img.filename);
                              }
                            }}
                            className="opacity-60 hover:opacity-100 p-1 text-slate-400 hover:text-red-400 hover:bg-slate-950 rounded transition-all"
                            title="Xóa trang này"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Collapsed view icons */}
      {collapsed && (
        <div className="flex-1 overflow-y-auto p-1 space-y-2 mt-2 flex flex-col items-center">
          <button
            onClick={handleTriggerPickFolder}
            className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 flex items-center justify-center hover:bg-purple-600 hover:text-white transition-all shadow"
            title="Chọn cả thư mục ảnh"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          <button
            onClick={handleTriggerPickImages}
            className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow"
            title="Thêm ảnh lẻ từ thiết bị"
          >
            <ImagePlus className="w-4 h-4" />
          </button>


          {images.map((img) => (
            <div
              key={img.filename}
              onClick={() => onSelectImage(img.filename)}
              className={`w-10 h-14 rounded-lg overflow-hidden cursor-pointer border relative transition-all ${
                img.filename === selectedFilename
                  ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                  : 'border-slate-800 hover:border-slate-600'
              }`}
              title={img.filename}
            >
              <img src={img.rawUrl} alt={img.filename} className="w-full h-full object-cover" />
              {img.status === 'done' && (
                <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400"></div>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
