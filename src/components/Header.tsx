import React from 'react';
import { 
  Sparkles, 
  Server, 
  Layers, 
  Download, 
  PlayCircle, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import { ColabConfig, EngineMode } from '../types';

interface HeaderProps {
  currentFilename: string | null;
  colabConfig: ColabConfig;
  onOpenColabModal: () => void;
  onOpenBatchModal: () => void;
  onExportCurrent: () => void;
  onRunAutoCleanAndTranslate: () => void;
  isProcessing: boolean;
  onEngineChange: (mode: EngineMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentFilename,
  colabConfig,
  onOpenColabModal,
  onOpenBatchModal,
  onExportCurrent,
  onRunAutoCleanAndTranslate,
  isProcessing,
  onEngineChange,
}) => {
  return (
    <header className="h-16 glass-header px-4 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Active File */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-base bg-gradient-to-r from-indigo-300 via-white to-purple-300 bg-clip-text text-transparent tracking-wide">
            Manga Studio AI
          </span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            LaMa Inpaint
          </span>
        </div>

        {currentFilename && (
          <div className="hidden md:flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg">
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-200 font-medium">{currentFilename}</span>
          </div>
        )}
      </div>

      {/* Center: Engine Mode Switcher */}
      <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
        <button
          onClick={() => onEngineChange('gemini')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            colabConfig.engineMode === 'gemini'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Dịch thông minh, hiểu ngữ cảnh bằng AI Vision Gemini"
        >
          <Zap className="w-3.5 h-3.5 text-yellow-300" />
          <span>AI Vision (Gemini)</span>
        </button>

        <button
          onClick={() => onEngineChange('uncensored')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
            colabConfig.engineMode === 'uncensored'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Chế độ không kiểm duyệt (Manga-OCR Offline + DeepL/Google) cho truyện 18+/nhạy cảm"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
          <span>Uncensored (Manga-OCR)</span>
        </button>
      </div>

      {/* Right: Colab Status, Action Buttons */}
      <div className="flex items-center space-x-2.5">
        {/* Colab Status Button */}
        <button
          onClick={onOpenColabModal}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
            colabConfig.connected
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/50'
              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>
            {colabConfig.connected
              ? `Colab: ${colabConfig.gpuName || 'GPU Active'}`
              : 'Kết nối Colab GPU'}
          </span>
          {colabConfig.connected ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          )}
        </button>

        {/* Auto Process Page */}
        <button
          onClick={onRunAutoCleanAndTranslate}
          disabled={!currentFilename || isProcessing}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold btn-primary text-white ${
            !currentFilename || isProcessing ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          title="Xóa chữ bằng LaMa và Dịch tự động trang hiện tại"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isProcessing ? 'Đang xử lý AI...' : 'Tự động Dịch Trang'}</span>
        </button>

        {/* Batch Process All */}
        <button
          onClick={onOpenBatchModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 transition-all"
          title="Chạy dịch hàng loạt tất cả ảnh từ raw materials ra test-case"
        >
          <PlayCircle className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden sm:inline">Dịch Hàng Loạt</span>
        </button>

        {/* Export Current */}
        <button
          onClick={onExportCurrent}
          disabled={!currentFilename}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-all shadow-sm"
          title="Lưu ảnh hoàn chỉnh vào d:\dich\test-case"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>Xuất test-case</span>
        </button>
      </div>
    </header>
  );
};
