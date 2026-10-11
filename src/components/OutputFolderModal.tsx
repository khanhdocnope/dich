import React, { useState } from 'react';
import { 
  X, 
  FolderCheck, 
  FolderPlus, 
  Download, 
  FileArchive, 
  Smartphone, 
  HardDrive,
  CheckCircle2,
  Check,
  Languages,
  Sparkles,
  Sliders,
  Vibrate,
  Database
} from 'lucide-react';
import { PageItem, OutputFolderConfig } from '../types';
import { pickLocalOutputDirectory, exportImagesAsZip } from '../services/folderService';
import { UiLanguage, DICTIONARY, saveLanguage } from '../services/i18n';

interface OutputFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: PageItem[];
  outputConfig: OutputFolderConfig;
  onSaveConfig: (config: OutputFolderConfig) => void;
  uiLang?: UiLanguage;
  onChangeUiLang?: (lang: UiLanguage) => void;
}

export const OutputFolderModal: React.FC<OutputFolderModalProps> = ({
  isOpen,
  onClose,
  images,
  outputConfig,
  onSaveConfig,
  uiLang = 'vi',
  onChangeUiLang,
}) => {
  if (!isOpen) return null;

  const [selectedLang, setSelectedLang] = useState<UiLanguage>(uiLang);
  const [folderName, setFolderName] = useState(outputConfig.customFolderName || 'MangaTranslator/Chapter_01');
  const [selectedWebDir, setSelectedWebDir] = useState<string | null>(outputConfig.directoryHandleName || null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [hapticEnabled, setHapticEnabled] = useState(true);

  const t = DICTIONARY[selectedLang];

  const handleSelectLanguage = (lang: UiLanguage) => {
    setSelectedLang(lang);
    saveLanguage(lang);
    onChangeUiLang?.(lang);
  };

  const handlePickDirectory = async () => {
    const res = await pickLocalOutputDirectory();
    if (res.success && res.dirName) {
      setSelectedWebDir(res.dirName);
      onSaveConfig({
        ...outputConfig,
        customFolderName: folderName,
        directoryHandleName: res.dirName,
      });
    } else if (res.error) {
      alert(res.error);
    }
  };

  const handleExportZip = async () => {
    setIsExportingZip(true);
    const cleanZipName = `${folderName.replace(/[\/\\:]/g, '_')}_Translated.zip`;
    await exportImagesAsZip(images, cleanZipName);
    setIsExportingZip(false);
  };

  const handleSaveAndClose = () => {
    onSaveConfig({
      ...outputConfig,
      customFolderName: folderName.trim() || 'MangaTranslator/Output',
      directoryHandleName: selectedWebDir,
    });
    saveLanguage(selectedLang);
    onChangeUiLang?.(selectedLang);
    onClose();
  };

  const doneCount = images.filter((img) => img.status === 'done').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-[#161618] rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between bg-[#131315]">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#611f69] to-[#2E103A] text-[#fbabfe] border border-[rgba(255,255,255,0.08)] flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#F5F5F7] tracking-tight">
                {t.settingsTitle}
              </h3>
              <p className="text-[11.5px] text-[#8E8E93]">
                {t.settingsSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#222226] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scroll text-xs">
          
          {/* SECTION 1: UI LANGUAGE SELECTION (BENTO TILES) */}
          <div className="p-3.5 rounded-xl bg-[#0E0E10] border border-[rgba(255,255,255,0.08)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ink-paper font-semibold">
                <Languages className="w-4 h-4 text-primary" />
                <span>{t.uiLanguageLabel}</span>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-slack-aubergine-deep text-primary border border-primary-container">
                {selectedLang === 'vi' ? 'Tiếng Việt' : 'English'}
              </span>
            </div>
            <p className="text-[11px] text-[#8E8E93] leading-relaxed">
              {t.uiLanguageDesc}
            </p>

            {/* 2 Bento Tiles */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {/* Tile 1: Tiếng Việt */}
              <button
                type="button"
                onClick={() => handleSelectLanguage('vi')}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedLang === 'vi'
                    ? 'bg-[#2E103A] border-[#611f69] text-[#F5F5F7] shadow-sm ring-1 ring-[#fbabfe]/30'
                    : 'bg-[#131315] border-[rgba(255,255,255,0.08)] text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#1b1b1d]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">🇻🇳</span>
                    <span className="font-semibold text-xs text-[#F5F5F7]">{t.langViTitle}</span>
                  </div>
                  {selectedLang === 'vi' && (
                    <span className="w-4 h-4 rounded-full bg-primary text-black flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <span className="text-[10.5px] text-[#8E8E93] leading-tight">
                  {t.langViDesc}
                </span>
              </button>

              {/* Tile 2: English */}
              <button
                type="button"
                onClick={() => handleSelectLanguage('en')}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  selectedLang === 'en'
                    ? 'bg-[#2E103A] border-[#611f69] text-[#F5F5F7] shadow-sm ring-1 ring-[#fbabfe]/30'
                    : 'bg-[#131315] border-[rgba(255,255,255,0.08)] text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#1b1b1d]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">🇬🇧</span>
                    <span className="font-semibold text-xs text-[#F5F5F7]">{t.langEnTitle}</span>
                  </div>
                  {selectedLang === 'en' && (
                    <span className="w-4 h-4 rounded-full bg-primary text-black flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <span className="text-[10.5px] text-[#8E8E93] leading-tight">
                  {t.langEnDesc}
                </span>
              </button>
            </div>
          </div>

          {/* SECTION 2: OUTPUT DESTINATION & DIRECTORY */}
          <div className="p-3.5 rounded-xl bg-[#0E0E10] border border-[rgba(255,255,255,0.08)] space-y-3">
            <div className="flex items-center gap-2 text-ink-paper font-semibold">
              <FolderCheck className="w-4 h-4 text-[#9dcaff]" />
              <span>{t.outputFolderSection}</span>
            </div>

            {/* Sub-item: Custom Folder Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#8E8E93] block">
                {t.folderNameLabel}
              </label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="VD: MangaTranslator/Chapter_01"
                className="w-full bg-[#161618] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2 text-ink-paper font-mono text-xs focus:outline-none focus:border-primary/50"
              />
              <div className="text-[10.5px] text-emerald-400 flex items-center gap-1.5 bg-emerald-950/30 p-2 rounded-lg border border-emerald-800/30 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Documents/{folderName}/[page_name].png</span>
              </div>
            </div>

            {/* Sub-item: Desktop Direct Folder Picker */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-[11.5px] text-[#F5F5F7] block">{t.directPickerTitle}</span>
                  <span className="text-[10.5px] text-[#8E8E93]">{t.directPickerDesc}</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handlePickDirectory}
                  className="px-3 py-1.5 rounded-full bg-surface-container border border-whisper hover:bg-graphite-subtle text-ink-paper text-[11px] font-medium flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#9dcaff]" />
                  <span>{t.pickFolderBtn}</span>
                </button>
                {selectedWebDir && (
                  <span className="text-[10.5px] text-emerald-400 font-mono truncate max-w-[190px]">
                    {selectedWebDir}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: ZIP EXPORT PACKAGE */}
          <div className="p-3.5 rounded-xl bg-[#0E0E10] border border-[rgba(255,255,255,0.08)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ink-paper font-semibold">
                <FileArchive className="w-4 h-4 text-amber-400" />
                <span>{t.zipExportTitle}</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-container border border-whisper text-[#8E8E93]">
                {images.length} {t.pagesCount} ({doneCount} done)
              </span>
            </div>
            <p className="text-[11px] text-[#8E8E93] leading-relaxed">
              {t.zipExportDesc}
            </p>
            <button
              type="button"
              onClick={handleExportZip}
              disabled={isExportingZip || images.length === 0}
              className="w-full py-2.5 px-3 rounded-full bg-primary-container hover:bg-[#73257D] text-white font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>
                {isExportingZip ? 'Packing ZIP...' : `${t.exportZipBtn} (${images.length})`}
              </span>
            </button>
          </div>

          {/* SECTION 4: STUDIO PREFERENCES (HAPTIC & AUTO-SAVE TOGGLES) */}
          <div className="p-3.5 rounded-xl bg-[#0E0E10] border border-[rgba(255,255,255,0.08)] space-y-2.5">
            <div className="flex items-center gap-2 text-ink-paper font-semibold">
              <Sliders className="w-4 h-4 text-primary" />
              <span>{selectedLang === 'vi' ? 'Tùy Chọn Không Gian Studio' : 'Workspace Preferences'}</span>
            </div>

            {/* Toggle 1: Auto-Save */}
            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <div>
                <span className="text-[11.5px] font-medium text-[#F5F5F7] block">{t.autoSaveCache}</span>
                <span className="text-[10.5px] text-[#8E8E93]">{t.autoSaveDesc}</span>
              </div>
              <button
                type="button"
                onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative p-0.5 ${
                  autoSaveEnabled ? 'bg-primary-container' : 'bg-surface-container-high'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  autoSaveEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Toggle 2: Haptics */}
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-[11.5px] font-medium text-[#F5F5F7] block">{t.hapticFeedback}</span>
                <span className="text-[10.5px] text-[#8E8E93]">{t.hapticDesc}</span>
              </div>
              <button
                type="button"
                onClick={() => setHapticEnabled(!hapticEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative p-0.5 ${
                  hapticEnabled ? 'bg-primary-container' : 'bg-surface-container-high'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  hapticEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[rgba(255,255,255,0.08)] bg-[#131315] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-medium text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#222226] transition-all"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-5 py-2 rounded-full text-xs font-semibold bg-primary-container hover:bg-[#73257D] text-white border border-white/20 active:scale-95 transition-all shadow-md"
          >
            {t.saveSettingsBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
