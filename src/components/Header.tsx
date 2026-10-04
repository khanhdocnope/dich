import React from 'react';
import { 
  Sparkles, 
  Server, 
  Download, 
  PlayCircle, 
  ShieldCheck, 
  Zap, 
  FolderOpen,
  FolderCheck,
  Undo2,
  Redo2,
  Eraser,
  Languages
} from 'lucide-react';
import { ColabConfig, EngineMode } from '../types';

interface HeaderProps {
  currentFilename: string | null;
  colabConfig: ColabConfig;
  outputFolderName?: string;
  onOpenColabModal: () => void;
  onOpenBatchModal: () => void;
  onOpenOutputModal?: () => void;
  onExportCurrent: () => void;
  onRunAutoCleanOnly?: () => void;
  onRunTranslateOnly?: () => void;
  onRunAutoCleanAndTranslate: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isProcessing: boolean;
  processingStatus?: string;
  onEngineChange: (mode: EngineMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentFilename,
  colabConfig,
  outputFolderName,
  onOpenColabModal,
  onOpenBatchModal,
  onOpenOutputModal,
  onExportCurrent,
  onRunAutoCleanOnly,
  onRunTranslateOnly,
  onRunAutoCleanAndTranslate,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isProcessing,
  processingStatus,
  onEngineChange,
}) => {


  return (
    <header className="h-14 md:h-16 glass-header px-3 md:px-5 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Active File */}
      <div className="flex items-center space-x-3">
        <div className="header-brand-badge">
          <img src="/assets/app_icon.png" alt="Logo" className="w-5 h-5 rounded-md object-contain shrink-0 shadow-sm" />
          <span className="header-brand-title truncate">
            Manga Translator
          </span>
          <span className="header-brand-tag desktop-only">
            AI
          </span>
        </div>


        {currentFilename && (
          <div className="header-file-badge desktop-only">
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-200 font-medium truncate max-w-[150px]">{currentFilename}</span>
          </div>
        )}
      </div>

      {/* Center: Engine Mode Switcher (Desktop) */}
      <div className="engine-switcher desktop-only">
        <button
          onClick={() => onEngineChange('gemini')}
          className={`engine-btn ${colabConfig.engineMode === 'gemini' ? 'active gemini' : ''}`}
          title="Dịch thông minh, hiểu ngữ cảnh bằng AI Vision Gemini"
        >
          <Zap className="w-3.5 h-3.5 text-yellow-300" />
          <span>AI Vision (Gemini)</span>
        </button>

        <button
          onClick={() => onEngineChange('uncensored')}
          className={`engine-btn ${colabConfig.engineMode === 'uncensored' ? 'active uncensored' : ''}`}
          title="Chế độ không kiểm duyệt (Manga-OCR Offline + DeepL/Google) cho truyện 18+/nhạy cảm"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
          <span>Uncensored (Manga-OCR)</span>
        </button>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-2">
        {/* Mobile-only Engine Quick Toggle Pill */}
        <button
          onClick={() => onEngineChange(colabConfig.engineMode === 'gemini' ? 'uncensored' : 'gemini')}
          className="mobile-only flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-xs font-medium"
          title="Chạm để chuyển đổi chế độ AI Vision / Uncensored"
        >
          {colabConfig.engineMode === 'gemini' ? (
            <>
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              <span className="text-indigo-300">Gemini</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span className="text-emerald-300">MangaOCR</span>
            </>
          )}
        </button>

        {/* Undo / Redo buttons */}
        {onUndo && (
          <div className="flex items-center space-x-1 border-r border-slate-800 pr-2 mr-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all"
              title="Hoàn tác thao tác trước (Ctrl + Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-all"
              title="Làm lại (Ctrl + Y)"
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

        {/* Colab Status Button (LaMa Manga AI) */}
        <button
          onClick={onOpenColabModal}
          className={`btn-colab ${colabConfig.connected ? 'connected' : ''}`}
          title={colabConfig.connected ? `Đã kết nối GPU AI LaMa: ${colabConfig.gpuName || 'OK'}` : 'Chưa kết nối Colab GPU (Xóa chữ LaMa)'}
        >
          <Server className="w-3.5 h-3.5" />
          <span className="desktop-inline">
            {colabConfig.connected
              ? `Colab: ${colabConfig.gpuName || 'GPU'}`
              : 'Colab (LaMa AI)'}
          </span>
          {colabConfig.connected ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          )}
        </button>

        {/* Action 1: ⚡ 1-CHẠM TỰ ĐỘNG TOÀN TRANG (Detect + LaMa Clean + Translate) */}
        <button
          onClick={onRunAutoCleanAndTranslate}
          disabled={!currentFilename || isProcessing}
          className={`btn-primary desktop-only ${isProcessing ? 'animate-pulse' : ''}`}
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)' }}
          title="Tự động phát hiện ô thoại, xóa nền bằng LaMa và Dịch toàn bộ trang trong 1 chạm duy nhất"
        >
          <Sparkles className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
          <span className="font-semibold">{isProcessing ? (processingStatus || 'Đang xử lý...') : '⚡ Dịch 1-Chạm (Tự Động)'}</span>
        </button>

        {/* Action 2: AI Xóa Chữ (LaMa Manga Inpainting) */}
        {onRunAutoCleanOnly && (
          <button
            onClick={onRunAutoCleanOnly}
            disabled={!currentFilename || isProcessing}
            className="btn-secondary desktop-only border-red-500/30 text-red-300 hover:bg-red-500/20"
            title="Dùng AI LaMa trên Colab để xóa sạch chữ và tái tạo nền tranh"
          >
            <Eraser className="w-3.5 h-3.5 text-red-400" />
            <span>Xóa Nền LaMa</span>
          </button>
        )}

        {/* Action 3: Dịch Chữ (Gemini Vision / Manga-OCR) */}
        {onRunTranslateOnly && (
          <button
            onClick={onRunTranslateOnly}
            disabled={!currentFilename || isProcessing}
            className="btn-secondary desktop-only border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
            title="Nhận diện chữ và dịch câu thoại sang tiếng Việt"
          >
            <Languages className="w-3.5 h-3.5 text-indigo-400" />
            <span>Dịch Chữ</span>
          </button>
        )}

        {/* Batch Process All */}
        <button
          onClick={onOpenBatchModal}
          className="btn-secondary desktop-only"
          title="Chạy dịch hàng loạt tất cả ảnh trong danh sách"
        >
          <PlayCircle className="w-3.5 h-3.5 text-purple-400" />
          <span>Hàng Loạt</span>
        </button>

        {/* Desktop-only Export Current */}
        <button
          onClick={onExportCurrent}
          disabled={!currentFilename}
          className="btn-secondary desktop-only"
          title="Lưu ảnh hoàn chỉnh"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>Xuất Ảnh</span>
        </button>
      </div>
    </header>
  );
};

