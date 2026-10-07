import React from 'react';
import { 
  Download, 
  PlayCircle, 
  FolderOpen,
  FolderCheck,
  Undo2,
  Redo2,
  Server
} from 'lucide-react';
import { ColabConfig } from '../types';

interface HeaderProps {
  currentFilename: string | null;
  colabConfig?: ColabConfig;
  outputFolderName?: string;
  onOpenColabModal?: () => void;
  onOpenBatchModal: () => void;
  onOpenOutputModal?: () => void;
  onExportCurrent: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isProcessing?: boolean;
  processingStatus?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentFilename,
  colabConfig,
  outputFolderName,
  onOpenColabModal,
  onOpenBatchModal,
  onOpenOutputModal,
  onExportCurrent,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isProcessing = false,
  processingStatus = '',
}) => {
  return (
    <header className="h-14 md:h-16 glass-header px-3 md:px-5 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Active File */}
      <div className="flex items-center space-x-3">
        <div className="header-brand-badge">
          <img src="/assets/app_icon.png" alt="Logo" className="w-5 h-5 rounded-md object-contain shrink-0 shadow-sm" />
          <span className="header-brand-title truncate">
            Manga Studio
          </span>
          <span className="header-brand-tag desktop-only">
            Editor
          </span>
        </div>

        {currentFilename && (
          <div className="header-file-badge desktop-only">
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-200 font-medium truncate max-w-[180px]">{currentFilename}</span>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-indigo-950/60 border border-indigo-700/50 text-indigo-300 text-xs animate-pulse">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="truncate max-w-[200px]">{processingStatus || 'Đang xử lý...'}</span>
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-2">
        {/* Undo / Redo buttons */}
        {onUndo && (
          <div className="flex items-center space-x-1 border-r border-slate-800/80 pr-2 mr-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="Hoàn tác thao tác trước (Ctrl + Z)"
              aria-label="Hoàn tác"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
              title="Làm lại thao tác vừa hoàn tác (Ctrl + Y hoặc Ctrl + Shift + Z)"
              aria-label="Làm lại"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Output Folder Settings */}
        {onOpenOutputModal && (
          <button
            onClick={onOpenOutputModal}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-indigo-500/50 transition-all flex items-center space-x-1.5"
            title={`Cài đặt thư mục lưu kết quả (Đang lưu: ${outputFolderName || 'MangaTranslator/Output'})`}
          >
            <FolderCheck className="w-4 h-4 text-indigo-400" />
            <span className="desktop-inline text-xs font-medium">Thư Mục Lưu</span>
          </button>
        )}

        {/* Basic Connection / Server Modal (Unobtrusive) */}
        {onOpenColabModal && (
          <button
            onClick={onOpenColabModal}
            className={`btn-colab ${colabConfig?.connected ? 'connected' : ''}`}
            title={colabConfig?.connected ? `Kết nối máy chủ: ${colabConfig.gpuName || 'OK'}` : 'Cài đặt kết nối máy chủ AI (Tùy chọn)'}
          >
            <Server className="w-3.5 h-3.5" />
            <span className="desktop-inline">
              {colabConfig?.connected ? 'Máy Chủ AI: Sẵn sàng' : 'Máy Chủ AI'}
            </span>
            {colabConfig?.connected ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-slate-600"></span>
            )}
          </button>
        )}

        {/* Batch Process All */}
        <button
          onClick={onOpenBatchModal}
          className="btn-secondary desktop-only"
          title="Xuất hàng loạt tất cả trang truyện trong danh sách"
        >
          <PlayCircle className="w-3.5 h-3.5 text-purple-400" />
          <span>Hàng Loạt</span>
        </button>

        {/* Export Current Image */}
        <button
          onClick={onExportCurrent}
          disabled={!currentFilename}
          className="btn-primary desktop-only"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
          title="Lưu ảnh hoàn chỉnh"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Xuất Ảnh</span>
        </button>
      </div>
    </header>
  );
};
