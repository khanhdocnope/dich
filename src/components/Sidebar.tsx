import React, { useState } from 'react';
import { 
  Images, 
  Search, 
  CheckCircle, 
  Clock, 
  FileImage, 
  ChevronLeft, 
  ChevronRight,
  RefreshCw,
  FolderSync,
  X
} from 'lucide-react';
import { PageItem } from '../types';

interface SidebarProps {
  images: PageItem[];
  selectedFilename: string | null;
  onSelectImage: (filename: string) => void;
  onRefreshList: () => void;
  isLoading: boolean;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  images,
  selectedFilename,
  onSelectImage,
  onRefreshList,
  isLoading,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'raw' | 'done'>('all');

  const filteredImages = images.filter((img) => {
    const matchesSearch = img.filename.toLowerCase().includes(searchTerm.toLowerCase());
    if (filter === 'done') return matchesSearch && img.status === 'done';
    if (filter === 'raw') return matchesSearch && img.status !== 'done';
    return matchesSearch;
  });

  const doneCount = images.filter((img) => img.status === 'done').length;

  return (
    <aside
      className={`sidebar-drawer ${isOpenMobile ? 'open' : ''} relative h-full glass-panel border-r border-slate-800 transition-all duration-300 flex flex-col z-20 select-none ${
        collapsed ? 'w-14' : 'w-72 sm:w-80'
      }`}
    >
      {/* Top Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        {!collapsed && (
          <div className="flex items-center space-x-2">
            <Images className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-xs tracking-wide uppercase text-slate-200">
              Raw Materials ({images.length})
            </h2>
          </div>
        )}
        <div className="flex items-center space-x-1 ml-auto">
          {/* Mobile Close Button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="mobile-only p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors mr-1"
              title="Đóng danh sách trang"
            >
              <X className="w-4 h-4 text-slate-300" />
            </button>
          )}
          <button
            onClick={onRefreshList}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            title="Làm mới danh sách ảnh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="desktop-only p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            title={collapsed ? 'Mở rộng thư viện' : 'Thu gọn'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-slate-800/60 space-y-2.5 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Tìm trang (VD: 02, 15)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 text-xs rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center space-x-1 text-[11px]">
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 py-1 rounded-md transition-all font-medium text-center ${
                  filter === 'all'
                    ? 'bg-slate-800 text-slate-200 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Tất cả ({images.length})
              </button>
              <button
                onClick={() => setFilter('raw')}
                className={`flex-1 py-1 rounded-md transition-all font-medium text-center ${
                  filter === 'raw'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Chưa xong ({images.length - doneCount})
              </button>
              <button
                onClick={() => setFilter('done')}
                className={`flex-1 py-1 rounded-md transition-all font-medium text-center ${
                  filter === 'done'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Đã xong ({doneCount})
              </button>
            </div>
          </div>

          {/* Image List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredImages.length === 0 ? (
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
                    className={`flex items-center space-x-3 p-2 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/50 text-white shadow-sm'
                        : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs truncate">
                          {img.filename}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          #{idx + 1}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center space-x-1.5">
                        {isDone ? (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                            <CheckCircle className="w-2.5 h-2.5" />
                            <span>Đã xuất</span>
                          </span>
                        ) : isProgress ? (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded">
                            <Clock className="w-2.5 h-2.5" />
                            <span>Đang sửa</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded">
                            <FileImage className="w-2.5 h-2.5" />
                            <span>Ảnh gốc</span>
                          </span>
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
        <div className="flex-1 overflow-y-auto p-1 space-y-2 mt-2">
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
