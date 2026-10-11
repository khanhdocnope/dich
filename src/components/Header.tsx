import React, { useState } from 'react';
import { ColabConfig } from '../types';
import { UiLanguage, DICTIONARY } from '../services/i18n';

interface HeaderProps {
  currentFilename: string | null;
  colabConfig?: ColabConfig;
  outputFolderName?: string;
  uiLang?: UiLanguage;
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
  uiLang = 'vi',
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
  const t = DICTIONARY[uiLang];
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [activeNav, setActiveNav] = useState<'canvas' | 'timeline' | 'glossary' | 'batch'>('canvas');

  // Compute label for chapter or current file
  const chapterLabel = outputFolderName 
    ? (outputFolderName.includes('/') ? outputFolderName.split('/').pop() : outputFolderName)
    : (currentFilename ? currentFilename.replace(/\.[^/.]+$/, '') : 'Ch. 01: The Beginning');

  return (
    <header className="bg-graphite-surface border-b border-whisper flex justify-between items-center w-full px-4 sm:px-margin h-14 z-50 sticky top-0 shrink-0 select-none">
      {/* Left: Brand + Chapter Selector + Latency Pill */}
      <div className="flex items-center gap-space-md sm:gap-space-lg">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-container to-slack-aubergine-deep flex items-center justify-center border border-whisper shadow-sm">
            <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              auto_stories
            </span>
          </div>
          <span className="text-title-md font-title-md font-semibold text-ink-paper tracking-tight">
            MangaStudio AI
          </span>
        </div>

        <div className="h-4 w-px bg-white/10 hidden sm:block"></div>

        {/* Chapter Dropdown Pill */}
        <button
          onClick={onOpenOutputModal}
          className="flex items-center gap-space-xs px-2.5 py-1 bg-surface-container rounded-full border border-whisper hover:bg-graphite-subtle transition-all duration-150 active:scale-[0.98]"
          title="Nhấp để đổi thư mục chương / quản lý xuất file"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          <span className="text-label-md font-label-md text-ink-paper truncate max-w-[140px] sm:max-w-[200px]">
            {chapterLabel}
          </span>
          <span className="material-symbols-outlined text-text-muted text-[16px]">expand_more</span>
        </button>

        {/* Connection & Compute Status (Link Colab & API Key) */}
        <button
          onClick={onOpenColabModal}
          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-surface-container-lowest/80 border border-whisper rounded-full hover:bg-graphite-subtle transition-all active:scale-95"
          title={colabConfig?.connected ? `AI Online: ${colabConfig.gpuName || 'A100 GPU'} (Nhấp để đổi link/key)` : 'Nhấp để nhập Link Google Colab / Hugging Face & Gemini API Key'}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {colabConfig?.connected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            )}
          </span>
          <span className="text-label-sm font-label-sm text-text-muted">
            {colabConfig?.connected ? (
              <>
                <span className="hidden sm:inline">{colabConfig.gpuName || 'Google Colab A100'} • </span><span>128ms</span>
              </>
            ) : (
              <span className="text-primary font-medium">Link AI & Key</span>
            )}
          </span>
        </button>

        {/* Processing State Pill */}
        {isProcessing && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slack-aubergine-deep border border-primary-container text-primary text-label-sm animate-pulse shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            <span className="truncate max-w-[140px] text-[11px] font-medium">{processingStatus || 'Đang xử lý...'}</span>
          </div>
        )}
      </div>

      {/* Center: Navigation Links */}
      <nav className="hidden lg:flex items-center gap-space-lg h-full">
        <button
          onClick={() => setActiveNav('canvas')}
          className={`h-full flex items-center border-b-2 font-medium transition-colors duration-150 text-label-md font-label-md ${
            activeNav === 'canvas'
              ? 'text-ink-paper border-primary-container font-semibold'
              : 'text-text-muted hover:text-ink-paper border-transparent'
          }`}
        >
          {t.canvas}
        </button>
        <button
          onClick={() => setActiveNav('timeline')}
          className={`h-full flex items-center border-b-2 font-medium transition-colors duration-150 text-label-md font-label-md ${
            activeNav === 'timeline'
              ? 'text-ink-paper border-primary-container font-semibold'
              : 'text-text-muted hover:text-ink-paper border-transparent'
          }`}
        >
          {t.timeline}
        </button>
        <button
          onClick={() => setActiveNav('glossary')}
          className={`h-full flex items-center border-b-2 font-medium transition-colors duration-150 text-label-md font-label-md ${
            activeNav === 'glossary'
              ? 'text-ink-paper border-primary-container font-semibold'
              : 'text-text-muted hover:text-ink-paper border-transparent'
          }`}
        >
          {t.glossary}
        </button>
        <button
          onClick={() => {
            setActiveNav('batch');
            onOpenBatchModal();
          }}
          className={`h-full flex items-center border-b-2 font-medium transition-colors duration-150 text-label-md font-label-md ${
            activeNav === 'batch'
              ? 'text-ink-paper border-primary-container font-semibold'
              : 'text-text-muted hover:text-ink-paper border-transparent'
          }`}
        >
          {t.batch}
        </button>
      </nav>

      {/* Right: Secondary & Primary Actions */}
      <div className="flex items-center gap-space-md shrink-0">
        {/* Icon Actions */}
        <div className="flex items-center gap-1 text-text-muted">
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-graphite-subtle hover:text-ink-paper transition-all duration-150 active:scale-[0.98] disabled:opacity-30"
              title="Undo"
            >
              <span className="material-symbols-outlined text-[19px]">history</span>
            </button>
          )}
          {onOpenOutputModal && (
            <button
              onClick={onOpenOutputModal}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-graphite-subtle hover:text-ink-paper transition-all duration-150 active:scale-[0.98]"
              title={t.settingsTitle}
            >
              <span className="material-symbols-outlined text-[19px]">tune</span>
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowHelpTooltip((prev) => !prev)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-graphite-subtle hover:text-ink-paper transition-all duration-150 active:scale-[0.98]"
              title={t.helpAndDocs}
            >
              <span className="material-symbols-outlined text-[19px]">help</span>
            </button>
            {showHelpTooltip && (
              <div className="absolute right-0 top-10 w-64 bg-graphite-surface border border-whisper rounded-2xl p-3.5 shadow-2xl z-50 text-[11px] text-ink-paper space-y-2">
                <div className="font-semibold text-primary flex items-center justify-between">
                  <span>{t.shortcutsTitle}</span>
                  <button onClick={() => setShowHelpTooltip(false)} className="text-text-muted hover:text-white">✕</button>
                </div>
                <div className="space-y-1.5 text-text-muted">
                  <div className="flex justify-between"><span>{t.selectTool}</span> <kbd className="text-white font-mono bg-white/10 px-1 rounded">V</kbd></div>
                  <div className="flex justify-between"><span>{t.balloonPen}</span> <kbd className="text-white font-mono bg-white/10 px-1 rounded">B</kbd></div>
                  <div className="flex justify-between"><span>{t.inpaintBrush}</span> <kbd className="text-white font-mono bg-white/10 px-1 rounded">P</kbd></div>
                  <div className="flex justify-between"><span>{t.undo}</span> <kbd className="text-white font-mono bg-white/10 px-1 rounded">Ctrl+Z / Y</kbd></div>
                  <div className="flex justify-between"><span>{t.holdToPeek}</span> <kbd className="text-white font-mono bg-white/10 px-1 rounded">Hold</kbd></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px bg-white/10 hidden sm:block"></div>

        {/* Secondary Pill Button */}
        <button
          onClick={onOpenBatchModal}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-whisper bg-surface-container text-ink-paper hover:bg-graphite-subtle transition-all duration-150 active:scale-[0.98] text-label-md font-label-md"
        >
          <span className="material-symbols-outlined text-[15px] text-secondary">bolt</span>
          <span>{t.runPipeline}</span>
        </button>

        {/* Primary Action Pill */}
        <button
          onClick={onExportCurrent}
          disabled={!currentFilename || isProcessing}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary-container hover:bg-[#73257D] text-white border border-white/20 transition-all duration-150 shadow-sm active:scale-[0.98] text-label-md font-label-md disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">file_download</span>
          <span>{isProcessing ? t.exporting : t.exportChapter}</span>
        </button>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full overflow-hidden border border-whisper ml-1 bg-slack-aubergine-deep flex items-center justify-center text-primary text-[11px] font-bold">
          M
        </div>
      </div>
    </header>
  );
};

