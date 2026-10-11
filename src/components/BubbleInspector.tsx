import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Type, 
  Trash2, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Bold, 
  Italic, 
  Palette, 
  Sliders, 
  Plus, 
  Minus,
  Languages, 
  Square,
  Circle,
  MessageSquare,
  Zap,
  Cloud,
  Frame,
  Sparkles,
  Layers,
  CircleDot,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Bubble, TextStyle } from '../types';
import { defaultTextStyle } from '../services/typesettingEngine';
import { triggerSelectionHaptic, triggerImpactHaptic } from '../services/haptics';
import { UiLanguage, DICTIONARY } from '../services/i18n';

interface BubbleInspectorProps {
  bubbles: Bubble[];
  selectedBubbleId: string | null;
  onSelectBubble: (id: string | null) => void;
  onUpdateBubble: (bubble: Bubble, commitToHistory?: boolean) => void;
  onDeleteBubble: (id: string) => void;
  onAddBubble: () => void;
  onReTranslateBubble: (bubble: Bubble) => void;
  onCommitHistory?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  width?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  uiLang?: UiLanguage;
}

const FONT_OPTIONS = [
  { label: 'Nunito (Manga Bo Tròn Việt Hóa 100%)', value: "'Nunito', sans-serif" },
  { label: 'Yuki Arenzi (Manga Thoại Thường)', value: "'Yuki-Arenzi', sans-serif" },
  { label: 'Yuki Burobu (Chữ Nổi Bật / SFX)', value: "'Yuki-Burobu', sans-serif" },
  { label: 'Yuki CCMarianChurchlandJournal', value: "'Yuki-CCMarianChurchlandJournal', cursive, sans-serif" },
  { label: 'Yuki CDX Starstreak (Hành Động / SFX)', value: "'Yuki-CDX Starstreak', sans-serif" },
  { label: 'Yuki CHICKEN Pie (Vui Nhộn / Hài Hước)', value: "'Yuki-CHICKEN Pie', cursive, sans-serif" },
  { label: 'Yuki CrashLanding BB (Hét / Kịch Tính)', value: "'Yuki-CrashLanding BB', sans-serif" },
  { label: 'Yuki Downhill Dive (SFX / Tốc Độ)', value: "'Yuki-Downhill Dive', sans-serif" },
  { label: 'Yuki Gingerline DEMO (Viết Tay Dễ Thương)', value: "'Yuki-Gingerline DEMO', cursive, sans-serif" },
  { label: 'Yuki Gorrilaz Story (Thoại Đặc Biệt)', value: "'Yuki-Gorrilaz Story', sans-serif" },
  { label: 'Yuki KG Only Angel (Nhẹ Nhàng / Nữ Tính)', value: "'Yuki-KG Only Angel', cursive, sans-serif" },
  { label: 'Yuki LF SwandsHand (Nét Bút Tay Manga)', value: "'Yuki-LF SwandsHand', cursive, sans-serif" },
  { label: 'Yuki La Belle Aurore (Nét Mực Mềm Mại)', value: "'Yuki-La Belle Aurore', cursive, sans-serif" },
  { label: 'Yuki Little Cupcakes (Dễ Thương / Chibi)', value: "'Yuki-Little Cupcakes', cursive, sans-serif" },
  { label: 'Yuki Nagurigaki Crayon (Nét Sáp Màu / SFX)', value: "'Yuki-Nagurigaki Crayon', cursive, sans-serif" },
  { label: 'Yuki Ripsnort BB (Manga Kinh Dị / Gào Thét)', value: "'Yuki-Ripsnort BB', sans-serif" },
  { label: 'Yuki Roasthink (Thoại Suy Nghĩ)', value: "'Yuki-Roasthink', cursive, sans-serif" },
  { label: 'Yuki Screwball (Hài Hước / Tinh Nghịch)', value: "'Yuki-Screwball', cursive, sans-serif" },
  { label: 'Yuki Skulduggery (SFX / Mạnh Mẽ)', value: "'Yuki-Skulduggery', sans-serif" },
  { label: 'Yuki Superscratchy (Cào Xước / SFX Rùng Rợn)', value: "'Yuki-Superscratchy', cursive, sans-serif" },
  { label: 'Yuki Tea And Oranges (Nhẹ Nhàng / Hồi Ức)', value: "'Yuki-Tea And Oranges', cursive, sans-serif" },
];

export const BubbleInspector: React.FC<BubbleInspectorProps> = ({
  bubbles,
  selectedBubbleId,
  onSelectBubble,
  onUpdateBubble,
  onDeleteBubble,
  onAddBubble,
  onReTranslateBubble,
  onCommitHistory,
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

  const selectedBubble = bubbles.find((b) => b.id === selectedBubbleId);
  const [activeTab, setActiveTab] = useState<'translate' | 'typography' | 'container'>('translate');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHistoryCommit = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onCommitHistory?.();
      debounceTimerRef.current = null;
    }, 400);
  }, [onCommitHistory]);

  const flushHistoryCommit = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      onCommitHistory?.();
    }
  }, [onCommitHistory]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const updateStyle = (patch: Partial<TextStyle>, commitNow: boolean = false) => {
    if (!selectedBubble) return;
    const updated: Bubble = {
      ...selectedBubble,
      style: {
        ...selectedBubble.style,
        ...patch,
      },
    };
    if (commitNow) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      onUpdateBubble(updated, true);
    } else {
      onUpdateBubble(updated, false);
      scheduleHistoryCommit();
    }
  };

  // Quick Background Presets
  const applyPresetBackground = (preset: 'transparent' | 'white' | 'black' | 'custom') => {
    if (!selectedBubble) return;
    if (preset === 'transparent') {
      updateStyle({ boxPreset: 'transparent', backgroundColor: '#ffffff', backgroundOpacity: 0 }, true);
    } else if (preset === 'white') {
      updateStyle({ boxPreset: 'white', backgroundColor: '#ffffff', backgroundOpacity: 1, borderRadius: 16 }, true);
    } else if (preset === 'black') {
      updateStyle({ boxPreset: 'black', backgroundColor: '#000000', backgroundOpacity: 1, color: '#ffffff', borderRadius: 16 }, true);
    } else if (preset === 'custom') {
      updateStyle({ boxPreset: 'custom', backgroundOpacity: 1 }, true);
    }
  };

  return (
    <aside
      className={`inspector-drawer ${isOpenMobile ? 'open' : ''} h-full bg-graphite-surface border-l border-whisper transition-all duration-200 flex flex-col z-20 select-none ${
        isCollapsed ? 'w-14' : !width ? 'w-96' : ''
      }`}
      style={!isOpenMobile && !isCollapsed && width ? { width, minWidth: '240px', maxWidth: '45%' } : undefined}
    >
      {/* Mobile Bottom Sheet Pull Pill Handle */}
      <div className="mobile-only flex justify-center w-full pt-1 pb-0.5">
        <div className="bottom-sheet-drag-handle" />
      </div>

      {/* Panel Header & Segmented Pill Tabs */}
      <div className="p-space-md border-b border-whisper space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-title-md font-title-md font-semibold text-ink-paper">{t.inspector}</span>
            {selectedBubble && (
              <span className="px-2 py-0.5 rounded-full bg-slack-aubergine-deep border border-primary-container text-primary text-[10px] font-mono">
                {(() => {
                  const idx = bubbles.findIndex((b) => b.id === selectedBubble.id);
                  return `#B-${idx >= 0 ? (idx + 1 < 10 ? `0${idx + 1}` : idx + 1) : '01'}`;
                })()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                triggerImpactHaptic();
                onAddBubble();
              }}
              className="text-text-muted hover:text-ink-paper p-1 rounded-lg hover:bg-graphite-subtle transition-all"
              title="Add Speech Bubble"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>
            <button
              onClick={toggleCollapsed}
              className="desktop-only text-text-muted hover:text-ink-paper p-1 rounded-lg hover:bg-graphite-subtle transition-all"
              title={isCollapsed ? "Mở rộng" : "Thu gọn"}
            >
              <span className="material-symbols-outlined text-[18px]">more_horiz</span>
            </button>
          </div>
        </div>

        {/* Segmented Tab Slider */}
        <div className="flex items-center bg-surface-container-lowest p-1 rounded-xl border border-whisper">
          <button
            onClick={() => setActiveTab('translate')}
            className={`flex-1 py-1.5 rounded-lg font-medium text-label-md font-label-md transition-all text-center ${
              activeTab === 'translate'
                ? 'bg-surface-container-high text-ink-paper shadow-sm'
                : 'text-text-muted hover:text-ink-paper'
            }`}
          >
            {t.tabTranslate}
          </button>
          <button
            onClick={() => setActiveTab('typography')}
            className={`flex-1 py-1.5 rounded-lg font-medium text-label-md font-label-md transition-all text-center ${
              activeTab === 'typography'
                ? 'bg-surface-container-high text-ink-paper shadow-sm'
                : 'text-text-muted hover:text-ink-paper'
            }`}
          >
            {t.tabTypography}
          </button>
          <button
            onClick={() => setActiveTab('container')}
            className={`flex-1 py-1.5 rounded-lg font-medium text-label-md font-label-md transition-all text-center ${
              activeTab === 'container'
                ? 'bg-surface-container-high text-ink-paper shadow-sm'
                : 'text-text-muted hover:text-ink-paper'
            }`}
          >
            {t.tabEngines}
          </button>
        </div>
      </div>

      {/* Expanded view content */}
      {!isCollapsed && (
        <>
          {/* Bubble Selection Strip */}
          <div className="p-2 border-b border-[rgba(255,255,255,0.08)] overflow-x-auto flex gap-1.5 shrink-0 bg-[#0e0e10]/60">
            {bubbles.map((b, idx) => {
              const isSelected = b.id === selectedBubbleId;
              const tagStr = `#B-${idx + 1 < 10 ? `0${idx + 1}` : idx + 1}`;
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    triggerSelectionHaptic();
                    onSelectBubble(b.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0 border ${
                    isSelected
                      ? 'bg-[#2E103A] text-[#fbabfe] border-[#611f69] shadow-sm'
                      : 'bg-[#161618] text-[#8E8E93] border-[rgba(255,255,255,0.08)] hover:text-[#F5F5F7]'
                  }`}
                >
                  {tagStr} {b.translatedText ? (b.translatedText.slice(0, 8) + '...') : 'Trống'}
                </button>
              );
            })}
          </div>

          {/* Main Inspector Body */}
          <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-3">
            {selectedBubble ? (
              <>
                {/* TAB 1: TRANSLATE */}
                {activeTab === 'translate' && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* Source OCR Card */}
                    <div className="bg-[#0e0e10] rounded-2xl p-3.5 border border-[rgba(255,255,255,0.08)] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-[#8E8E93]">
                          <span className="material-symbols-outlined text-[15px] text-[#9dcaff]">document_scanner</span>
                          <span>Chữ gốc (MangaOCR v3)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                          99.4% conf
                        </span>
                      </div>
                      <textarea
                        value={selectedBubble.originalText}
                        onChange={(e) => {
                          onUpdateBubble({ ...selectedBubble, originalText: e.target.value }, false);
                          scheduleHistoryCommit();
                        }}
                        onBlur={flushHistoryCommit}
                        placeholder="Văn bản gốc tiếng Nhật/Trung/Anh..."
                        rows={2}
                        className="w-full bg-[#161618] border border-[rgba(255,255,255,0.08)] text-xs rounded-xl p-2.5 text-[#F5F5F7] focus:outline-none focus:border-[#fbabfe]/50 resize-none font-mono"
                      />
                      <div className="flex items-center justify-between text-[11px] text-[#8E8E93] pt-0.5">
                        <span>Orientation: Vertical (RTL)</span>
                        <button
                          onClick={() => onReTranslateBubble(selectedBubble)}
                          className="text-[#9dcaff] hover:underline flex items-center gap-1"
                          title="Quét lại OCR vùng này"
                        >
                          <span className="material-symbols-outlined text-[13px]">replay</span>
                          <span>Re-OCR</span>
                        </button>
                      </div>
                    </div>

                    {/* Localized Target Translation Card */}
                    <div className="bg-[#0e0e10] rounded-2xl p-3.5 border border-[rgba(255,255,255,0.08)] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8E8E93] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px] text-[#fbabfe]">translate</span>
                          <span>Bản Dịch Tiếng Việt</span>
                        </span>
                        {/* Tone selector pill */}
                        <div className="flex items-center gap-1 bg-[#1f1f21] px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.08)]">
                          <span className="text-[10px] text-[#8E8E93]">Tone:</span>
                          <span className="text-[10px] text-[#F5F5F7] font-medium">Dramatic Action</span>
                        </div>
                      </div>
                      <div className="relative">
                        <textarea
                          value={selectedBubble.translatedText}
                          onChange={(e) => {
                            onUpdateBubble({ ...selectedBubble, translatedText: e.target.value }, false);
                            scheduleHistoryCommit();
                          }}
                          onBlur={flushHistoryCommit}
                          placeholder="Nội dung bản dịch tiếng Việt..."
                          rows={3}
                          className="w-full bg-[#161618] border border-[rgba(255,255,255,0.08)] text-xs rounded-xl p-2.5 pr-8 text-[#F5F5F7] focus:outline-none focus:border-[#fbabfe]/60 font-medium resize-none leading-relaxed"
                        />
                        <button
                          onClick={() => onReTranslateBubble(selectedBubble)}
                          className="absolute bottom-2.5 right-2.5 p-1 rounded-md bg-[#222226] hover:bg-[#2a2a2c] text-[#8E8E93] hover:text-[#F5F5F7] transition-all"
                          title="Tạo lại bằng AI"
                        >
                          <span className="material-symbols-outlined text-[14px]">magic_button</span>
                        </button>
                      </div>

                    </div>
                  </div>
                )}

                {/* TAB 2: TYPOGRAPHY & SHAPES */}
                {activeTab === 'typography' && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {/* 6 Manga Balloon Archetype Shapes Card */}
                    <div className="bg-surface-container-lowest rounded-2xl p-3.5 border border-whisper space-y-2">
                      <label className="text-[11px] text-text-muted block">Balloon Contour Archetype</label>
                      <div className="grid grid-cols-6 gap-1.5">
                        {[
                          { id: 'ellipse', label: 'Elliptic (Default)', icon: 'radio_button_unchecked' },
                          { id: 'rounded', label: 'Rounded Rectangle', icon: 'crop_square' },
                          { id: 'rectangle', label: 'Spiky / Action Burst', icon: 'emergency' },
                          { id: 'thought', label: 'Thought Balloon', icon: 'cloud' },
                          { id: 'shout', label: 'Whisper / Dashed', icon: 'adjust' },
                          { id: 'transparent', label: 'Transparent / Borderless', icon: 'texture' },
                        ].map((sh) => {
                          const currentShape = selectedBubble.style.boxShape || (selectedBubble.style.boxPreset === 'transparent' ? 'transparent' : 'rounded');
                          const isSelected = currentShape === sh.id;

                          return (
                            <button
                              key={sh.id}
                              onClick={() => {
                                if (sh.id === 'transparent') {
                                  updateStyle({
                                    boxShape: 'transparent',
                                    boxPreset: 'transparent',
                                    backgroundOpacity: 0,
                                    boxBorderWidth: 0,
                                    strokeWidth: Math.max(3, selectedBubble.style.strokeWidth || 4),
                                  }, true);
                                } else {
                                  updateStyle({
                                    boxShape: sh.id as any,
                                    boxPreset: 'custom',
                                    backgroundOpacity: selectedBubble.style.backgroundOpacity > 0 ? selectedBubble.style.backgroundOpacity : 1,
                                    backgroundColor: selectedBubble.style.backgroundColor || '#ffffff',
                                    boxBorderWidth: selectedBubble.style.boxBorderWidth > 0 ? selectedBubble.style.boxBorderWidth : (sh.id === 'rectangle' ? 2 : 1.5),
                                    boxBorderColor: selectedBubble.style.boxBorderColor || '#000000',
                                  }, true);
                                }
                              }}
                              className={`h-8 rounded-lg flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-slack-aubergine-deep border border-primary/60 text-primary shadow-sm'
                                  : 'bg-graphite-surface border border-whisper text-text-muted hover:text-ink-paper'
                              }`}
                              title={sh.label}
                            >
                              <span className="material-symbols-outlined text-[16px]">{sh.icon}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Typography & Font Metrics Card */}
                    <div className="bg-[#0e0e10] rounded-2xl p-3.5 border border-[rgba(255,255,255,0.08)] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8E8E93] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px] text-[#f6afef]">format_size</span>
                          <span>Chữ & Kiểu Font</span>
                        </span>
                        <label className="flex items-center gap-1.5 text-[11px] text-[#8E8E93] cursor-pointer">
                          <span>Auto-Fit</span>
                          <input
                            type="checkbox"
                            checked={selectedBubble.style.autoFontSize}
                            onChange={(e) => updateStyle({ autoFontSize: e.target.checked }, true)}
                            className="rounded accent-[#611f69]"
                          />
                        </label>
                      </div>

                      {/* Font selector */}
                      <div>
                        <select
                          value={selectedBubble.style.fontFamily}
                          onChange={(e) => updateStyle({ fontFamily: e.target.value }, true)}
                          className="w-full bg-[#161618] border border-[rgba(255,255,255,0.08)] text-xs rounded-xl p-2 text-[#F5F5F7] focus:outline-none focus:border-[#fbabfe]/60"
                        >
                          {FONT_OPTIONS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Font size stepper & slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[#8E8E93]">
                          <span>Cỡ chữ (px):</span>
                          <span className="font-mono text-[#F5F5F7]">{selectedBubble.style.fontSize}px</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const next = Math.max(8, selectedBubble.style.fontSize - 1);
                              updateStyle({ fontSize: next, autoFontSize: false }, true);
                            }}
                            className="w-7 h-7 bg-[#161618] hover:bg-[#222226] text-[#F5F5F7] rounded-lg border border-[rgba(255,255,255,0.08)] flex items-center justify-center shrink-0 active:scale-95"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min={8}
                            max={120}
                            value={selectedBubble.style.fontSize}
                            onChange={(e) => {
                              const val = Math.min(120, Math.max(8, Number(e.target.value) || 8));
                              updateStyle({ fontSize: val, autoFontSize: false });
                            }}
                            onBlur={flushHistoryCommit}
                            className="w-12 bg-[#161618] border border-[rgba(255,255,255,0.08)] text-center font-mono text-xs rounded-lg py-1 text-[#F5F5F7] focus:outline-none shrink-0"
                          />
                          <button
                            onClick={() => {
                              const next = Math.min(120, selectedBubble.style.fontSize + 1);
                              updateStyle({ fontSize: next, autoFontSize: false }, true);
                            }}
                            className="w-7 h-7 bg-[#161618] hover:bg-[#222226] text-[#F5F5F7] rounded-lg border border-[rgba(255,255,255,0.08)] flex items-center justify-center shrink-0 active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="range"
                            min={8}
                            max={80}
                            value={selectedBubble.style.fontSize}
                            onChange={(e) => updateStyle({ fontSize: Number(e.target.value), autoFontSize: false })}
                            onMouseUp={flushHistoryCommit}
                            onTouchEnd={flushHistoryCommit}
                            className="flex-1 accent-[#611f69] min-w-0"
                          />
                        </div>
                      </div>

                      {/* Leading / Line Height Stepper */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[#8E8E93]">
                          <span>Dãn dòng (Leading):</span>
                          <span className="font-mono text-[#F5F5F7]">{Math.round((selectedBubble.style.lineHeight || 1.25) * 100)}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const next = Math.max(0.8, (selectedBubble.style.lineHeight || 1.25) - 0.05);
                              updateStyle({ lineHeight: Math.round(next * 100) / 100 }, true);
                            }}
                            className="w-7 h-7 bg-[#161618] hover:bg-[#222226] text-[#F5F5F7] rounded-lg border border-[rgba(255,255,255,0.08)] flex items-center justify-center shrink-0 active:scale-95"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="range"
                            min="0.8"
                            max="2.0"
                            step="0.05"
                            value={selectedBubble.style.lineHeight || 1.25}
                            onChange={(e) => updateStyle({ lineHeight: Number(e.target.value) })}
                            onMouseUp={flushHistoryCommit}
                            onTouchEnd={flushHistoryCommit}
                            className="flex-1 accent-[#611f69]"
                          />
                          <button
                            onClick={() => {
                              const next = Math.min(2.5, (selectedBubble.style.lineHeight || 1.25) + 0.05);
                              updateStyle({ lineHeight: Math.round(next * 100) / 100 }, true);
                            }}
                            className="w-7 h-7 bg-[#161618] hover:bg-[#222226] text-[#F5F5F7] rounded-lg border border-[rgba(255,255,255,0.08)] flex items-center justify-center shrink-0 active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Align & Weight */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/5">
                        <div className="flex items-center gap-1 bg-[#161618] p-1 rounded-lg border border-[rgba(255,255,255,0.08)]">
                          <button
                            onClick={() => updateStyle({ textAlign: 'left' }, true)}
                            className={`p-1 rounded ${selectedBubble.style.textAlign === 'left' ? 'bg-[#611f69] text-white' : 'text-[#8E8E93]'}`}
                          >
                            <AlignLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => updateStyle({ textAlign: 'center' }, true)}
                            className={`p-1 rounded ${selectedBubble.style.textAlign === 'center' ? 'bg-[#611f69] text-white' : 'text-[#8E8E93]'}`}
                          >
                            <AlignCenter className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => updateStyle({ textAlign: 'right' }, true)}
                            className={`p-1 rounded ${selectedBubble.style.textAlign === 'right' ? 'bg-[#611f69] text-white' : 'text-[#8E8E93]'}`}
                          >
                            <AlignRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1 bg-[#161618] p-1 rounded-lg border border-[rgba(255,255,255,0.08)]">
                          <button
                            onClick={() => updateStyle({ isBold: !selectedBubble.style.isBold }, true)}
                            className={`p-1 rounded ${selectedBubble.style.isBold ? 'bg-[#611f69] text-white' : 'text-[#8E8E93]'}`}
                          >
                            <Bold className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => updateStyle({ isItalic: !selectedBubble.style.isItalic }, true)}
                            className={`p-1 rounded ${selectedBubble.style.isItalic ? 'bg-[#611f69] text-white' : 'text-[#8E8E93]'}`}
                          >
                            <Italic className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Text Color & Outline Stroke */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                        <div>
                          <label className="text-[10px] text-[#8E8E93] block mb-1">Màu chữ:</label>
                          <div className="flex items-center gap-1.5 bg-[#161618] p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)]">
                            <input
                              type="color"
                              value={selectedBubble.style.color || '#000000'}
                              onChange={(e) => updateStyle({ color: e.target.value })}
                              onBlur={flushHistoryCommit}
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                            />
                            <span className="text-[10px] font-mono text-[#F5F5F7]">{selectedBubble.style.color}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-[#8E8E93] block mb-1">Viền chữ (Stroke):</label>
                          <div className="flex items-center gap-1.5 bg-[#161618] p-1.5 rounded-lg border border-[rgba(255,255,255,0.08)]">
                            <input
                              type="color"
                              value={selectedBubble.style.strokeColor || '#ffffff'}
                              onChange={(e) => updateStyle({ strokeColor: e.target.value })}
                              onBlur={flushHistoryCommit}
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                            />
                            <span className="text-[10px] font-mono text-[#F5F5F7]">{selectedBubble.style.strokeColor}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stroke Width */}
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-[#8E8E93] mb-1">
                          <span>Độ dày viền chữ:</span>
                          <span className="font-mono text-[#F5F5F7]">{selectedBubble.style.strokeWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={selectedBubble.style.strokeWidth}
                          onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })}
                          onMouseUp={flushHistoryCommit}
                          onTouchEnd={flushHistoryCommit}
                          className="w-full accent-[#611f69]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: CONTAINER & BACKGROUND */}
                {activeTab === 'container' && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div className="bg-[#0e0e10] rounded-2xl p-3.5 border border-[rgba(255,255,255,0.08)] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#8E8E93] flex items-center gap-1.5">
                          <Square className="w-3.5 h-3.5 text-[#fbabfe]" />
                          <span>Nền Hộp Thoại (Fill & Opacity)</span>
                        </span>
                        <span className="text-[11px] font-mono text-[#F5F5F7]">
                          {Math.round((selectedBubble.style.backgroundOpacity ?? 0) * 100)}%
                        </span>
                      </div>

                      {/* Quick Presets */}
                      <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                        <button
                          onClick={() => applyPresetBackground('transparent')}
                          className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                            (selectedBubble.style.backgroundOpacity ?? 0) === 0
                              ? 'bg-[#2E103A] text-[#fbabfe] border-[#611f69] font-semibold'
                              : 'bg-[#161618] text-[#8E8E93] border-[rgba(255,255,255,0.08)] hover:text-[#F5F5F7]'
                          }`}
                        >
                          Trong suốt
                        </button>
                        <button
                          onClick={() => applyPresetBackground('white')}
                          className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                            (selectedBubble.style.backgroundOpacity ?? 0) > 0 && selectedBubble.style.backgroundColor?.toLowerCase() === '#ffffff'
                              ? 'bg-white text-black border-white font-bold'
                              : 'bg-[#161618] text-[#8E8E93] border-[rgba(255,255,255,0.08)] hover:text-[#F5F5F7]'
                          }`}
                        >
                          Nền Trắng
                        </button>
                        <button
                          onClick={() => applyPresetBackground('black')}
                          className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                            (selectedBubble.style.backgroundOpacity ?? 0) > 0 && selectedBubble.style.backgroundColor?.toLowerCase() === '#000000'
                              ? 'bg-black text-[#fbabfe] border-[#611f69] font-bold'
                              : 'bg-[#161618] text-[#8E8E93] border-[rgba(255,255,255,0.08)] hover:text-[#F5F5F7]'
                          }`}
                        >
                          Nền Đen
                        </button>
                        <button
                          onClick={() => applyPresetBackground('custom')}
                          className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                            (selectedBubble.style.backgroundOpacity ?? 0) > 0 && !['#ffffff', '#000000'].includes(selectedBubble.style.backgroundColor?.toLowerCase() || '')
                              ? 'bg-[#611f69] text-white border-[#fbabfe] font-bold'
                              : 'bg-[#161618] text-[#8E8E93] border-[rgba(255,255,255,0.08)] hover:text-[#F5F5F7]'
                          }`}
                        >
                          Tùy Chọn
                        </button>
                      </div>

                      {/* Color & Opacity */}
                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#8E8E93] w-14">Màu nền:</span>
                          <input
                            type="color"
                            value={selectedBubble.style.backgroundColor || '#ffffff'}
                            onChange={(e) => updateStyle({ backgroundColor: e.target.value, backgroundOpacity: selectedBubble.style.backgroundOpacity === 0 ? 1 : selectedBubble.style.backgroundOpacity })}
                            onBlur={flushHistoryCommit}
                            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                          />
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedBubble.style.backgroundOpacity ?? 0}
                            onChange={(e) => updateStyle({ backgroundOpacity: Number(e.target.value) })}
                            onMouseUp={flushHistoryCommit}
                            onTouchEnd={flushHistoryCommit}
                            className="flex-1 accent-[#611f69]"
                          />
                        </div>

                        {/* Border Color & Width */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#8E8E93] w-14">Viền khung:</span>
                          <input
                            type="color"
                            value={selectedBubble.style.boxBorderColor || '#000000'}
                            onChange={(e) => updateStyle({ boxBorderColor: e.target.value })}
                            onBlur={flushHistoryCommit}
                            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                          />
                          <input
                            type="range"
                            min="0"
                            max="8"
                            step="0.5"
                            value={selectedBubble.style.boxBorderWidth ?? 0}
                            onChange={(e) => updateStyle({ boxBorderWidth: Number(e.target.value) })}
                            onMouseUp={flushHistoryCommit}
                            onTouchEnd={flushHistoryCommit}
                            className="flex-1 accent-[#611f69]"
                          />
                          <span className="text-[10px] font-mono text-[#F5F5F7] min-w-[24px]">
                            {selectedBubble.style.boxBorderWidth ?? 0}px
                          </span>
                        </div>

                        {/* Radius & Padding */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <div className="flex justify-between text-[10px] text-[#8E8E93] mb-1">
                              <span>Bo góc:</span>
                              <span className="font-mono text-[#F5F5F7]">{selectedBubble.style.borderRadius ?? 16}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="40"
                              value={selectedBubble.style.borderRadius ?? 16}
                              onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
                              onMouseUp={flushHistoryCommit}
                              onTouchEnd={flushHistoryCommit}
                              className="w-full accent-[#611f69]"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] text-[#8E8E93] mb-1">
                              <span>Đệm chữ:</span>
                              <span className="font-mono text-[#F5F5F7]">{selectedBubble.style.boxPadding ?? 8}px</span>
                            </div>
                            <input
                              type="range"
                              min="2"
                              max="24"
                              value={selectedBubble.style.boxPadding ?? 8}
                              onChange={(e) => updateStyle({ boxPadding: Number(e.target.value) })}
                              onMouseUp={flushHistoryCommit}
                              onTouchEnd={flushHistoryCommit}
                              className="w-full accent-[#611f69]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delete Action */}
                    <div className="pt-1">
                      <button
                        onClick={() => onDeleteBubble(selectedBubble.id)}
                        className="w-full py-2 px-3 rounded-xl bg-red-950/30 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t.deleteBubbleBtn}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#8E8E93] text-xs space-y-3">
                <span className="material-symbols-outlined text-[36px] text-white/20">chat_bubble_outline</span>
                <p className="max-w-[240px] leading-relaxed">{t.emptyInspectorDesc}</p>
              </div>
            )}
          </div>

          {/* Bottom Inspector Actions (Serene Studio Footer) */}
          <div className="p-space-md border-t border-whisper bg-surface-container-lowest/70 space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  triggerImpactHaptic();
                  flushHistoryCommit();
                }}
                disabled={!selectedBubble}
                className="flex-1 py-2 px-3 rounded-full bg-primary-container hover:bg-[#73257D] text-white border border-white/20 text-label-md font-label-md font-medium transition-all duration-150 active:scale-[0.98] shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
                <span>{t.applyToPage}</span>
              </button>
              {selectedBubble && (
                <button
                  onClick={() => {
                    updateStyle({ ...defaultTextStyle }, true);
                  }}
                  className="py-2 px-3 rounded-full bg-graphite-surface hover:bg-graphite-subtle text-text-muted hover:text-ink-paper border border-whisper text-label-md font-label-md transition-all active:scale-[0.98]"
                  title={t.resetBubble}
                >
                  <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[10.5px] text-text-muted px-1 gap-2 min-w-0">
              <span className="truncate">{t.autoCleaningActive}</span>
              <span className="flex items-center gap-1 text-emerald-400 shrink-0 font-mono text-[10.5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>{t.inpaintSync}
              </span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
