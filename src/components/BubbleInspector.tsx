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
}) => {
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
      className={`inspector-drawer ${isOpenMobile ? 'open' : ''} h-full glass-panel border-l border-slate-800 transition-all duration-200 flex flex-col z-20 select-none ${
        isCollapsed ? 'w-14' : !width ? 'w-80' : ''
      }`}
      style={!isOpenMobile && !isCollapsed && width ? { width, minWidth: '240px', maxWidth: '45%' } : undefined}
    >
      {/* Mobile Bottom Sheet Pull Pill Handle */}
      <div className="mobile-only flex justify-center w-full pt-1 pb-0.5">
        <div className="bottom-sheet-drag-handle" />
      </div>

      {/* Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center space-x-2 truncate">
            <Type className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="font-semibold text-xs tracking-wide uppercase text-slate-200 truncate">
              Bong Bóng Thoại ({bubbles.length})
            </h2>
          </div>
        )}
        <div className="flex items-center space-x-1.5 ml-auto">
          {!isCollapsed && (
            <button
              onClick={() => {
                triggerImpactHaptic();
                onAddBubble();
              }}
              className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-all flex items-center space-x-1 text-xs"
              title="Tạo thêm ô thoại mới"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Ô</span>
            </button>
          )}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="mobile-only p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
              title="Đóng bảng công cụ"
            >
              <X className="w-4 h-4 text-slate-300" />
            </button>
          )}
          <button
            onClick={toggleCollapsed}
            className="desktop-only p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
            title={isCollapsed ? "Mở rộng bảng thuộc tính" : "Thu gọn"}
          >
            {isCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsed view icons on Desktop */}
      {isCollapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-3 flex flex-col items-center">
          <div className="p-2 rounded-lg bg-indigo-950/60 text-indigo-400 border border-indigo-800/40 text-center" title={`${bubbles.length} bong bóng thoại`}>
            <Type className="w-4 h-4 mx-auto mb-1" />
            <span className="text-[10px] font-bold">{bubbles.length}</span>
          </div>
          <button
            onClick={() => {
              triggerImpactHaptic();
              onAddBubble();
            }}
            className="w-10 h-10 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 flex items-center justify-center transition-all shadow"
            title="Tạo thêm ô thoại mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Expanded view content */}
      {!isCollapsed && (
        <>
          {/* Bubble List Selector Tabs */}
      <div className="p-2 border-b border-slate-800/60 overflow-x-auto flex space-x-1.5 shrink-0">
        {bubbles.map((b, idx) => (
          <button
            key={b.id}
            onClick={() => {
              triggerSelectionHaptic();
              onSelectBubble(b.id);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 border ${
              b.id === selectedBubbleId
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800/60'
            }`}
          >
            #{idx + 1} {b.translatedText ? b.translatedText.slice(0, 10) + '...' : 'Ô trống'}
          </button>
        ))}
      </div>

      {/* Main Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {selectedBubble ? (
          <>
            {/* 1. Quick Background Presets Panel */}
            <div className="space-y-2.5 bg-slate-900/70 p-3 rounded-xl border border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300 flex items-center space-x-1.5">
                  <Square className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Nền Hộp Thoại (Box Background)</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {Math.round((selectedBubble.style.backgroundOpacity ?? 0) * 100)}%
                </span>
              </div>

              {/* 1-Click Preset Buttons */}
              <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                <button
                  onClick={() => applyPresetBackground('transparent')}
                  className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                    (selectedBubble.style.backgroundOpacity ?? 0) === 0
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm font-semibold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Trong suốt: Giữ nguyên nền ảnh đã xóa LaMa phía dưới"
                >
                  Trong suốt
                </button>

                <button
                  onClick={() => applyPresetBackground('white')}
                  className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                    (selectedBubble.style.backgroundOpacity ?? 0) > 0 && selectedBubble.style.backgroundColor?.toLowerCase() === '#ffffff'
                      ? 'bg-white text-slate-950 border-white shadow-sm font-bold'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
                  }`}
                  title="Nền Trắng #FFF: Phủ màu trắng xóa nhanh chữ cũ không cần LaMa"
                >
                  Nền Trắng
                </button>

                <button
                  onClick={() => applyPresetBackground('black')}
                  className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                    (selectedBubble.style.backgroundOpacity ?? 0) > 0 && selectedBubble.style.backgroundColor?.toLowerCase() === '#000000'
                      ? 'bg-slate-800 text-amber-300 border-amber-400/50 shadow-sm font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Nền Đen #000: Dành cho khung thoại đen"
                >
                  Nền Đen
                </button>

                <button
                  onClick={() => applyPresetBackground('custom')}
                  className={`py-1.5 px-1 rounded-lg border font-medium text-center transition-all ${
                    (selectedBubble.style.backgroundOpacity ?? 0) > 0 && !['#ffffff', '#000000'].includes(selectedBubble.style.backgroundColor?.toLowerCase() || '')
                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Màu tùy chọn"
                >
                  Tùy Chọn
                </button>
              </div>

              {/* Background Color & Opacity Slider */}
              <div className="space-y-2 pt-1 border-t border-slate-800/60">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-400 w-16">Màu nền:</span>
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
                    className="flex-1 accent-indigo-500"
                  />
                </div>

                {/* Radius & Padding */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Bo góc (Radius):</span>
                      <span className="font-mono text-slate-200">{selectedBubble.style.borderRadius ?? 16}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={selectedBubble.style.borderRadius ?? 16}
                      onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
                      onMouseUp={flushHistoryCommit}
                      onTouchEnd={flushHistoryCommit}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Đệm chữ (Padding):</span>
                      <span className="font-mono text-slate-200">{selectedBubble.style.boxPadding ?? 8}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      value={selectedBubble.style.boxPadding ?? 8}
                      onChange={(e) => updateStyle({ boxPadding: Number(e.target.value) })}
                      onMouseUp={flushHistoryCommit}
                      onTouchEnd={flushHistoryCommit}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Text Content & Translation Panel */}
            <div className="space-y-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800/80">
              {/* Original Text (OCR) */}
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Chữ gốc (OCR):
                </label>
                <textarea
                  value={selectedBubble.originalText}
                  onChange={(e) => {
                    onUpdateBubble({ ...selectedBubble, originalText: e.target.value }, false);
                    scheduleHistoryCommit();
                  }}
                  onBlur={flushHistoryCommit}
                  placeholder="Văn bản gốc tiếng Nhật/Trung/Anh..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500/50 resize-none font-mono"
                />
              </div>

              {/* Translated Text */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-indigo-300 uppercase tracking-wider block">
                    Bản dịch tiếng Việt:
                  </label>
                  <button
                    onClick={() => onReTranslateBubble(selectedBubble)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                  >
                    <Languages className="w-3 h-3" />
                    <span>Dịch lại</span>
                  </button>
                </div>
                <textarea
                  value={selectedBubble.translatedText}
                  onChange={(e) => {
                    onUpdateBubble({ ...selectedBubble, translatedText: e.target.value }, false);
                    scheduleHistoryCommit();
                  }}
                  onBlur={flushHistoryCommit}
                  placeholder="Nội dung dịch tiếng Việt..."
                  rows={3}
                  className="w-full bg-slate-950 border border-indigo-900/40 text-xs rounded-lg p-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-medium resize-none shadow-inner"
                />
              </div>
            </div>

            {/* 3. Typography & Styling Panel */}
            <div className="space-y-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800/80">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Font Chữ & Cỡ Chữ (Typesetting)</span>
              </div>

              {/* Font Family */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Kiểu Font:</label>
                <select
                  value={selectedBubble.style.fontFamily}
                  onChange={(e) => updateStyle({ fontFamily: e.target.value }, true)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size & Stepper & Auto-fit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[10px] text-slate-400 font-medium">Cỡ chữ (px):</label>
                  <label className="flex items-center space-x-1 text-[11px] text-indigo-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedBubble.style.autoFontSize}
                      onChange={(e) => updateStyle({ autoFontSize: e.target.checked }, true)}
                      className="rounded accent-indigo-600"
                    />
                    <span>Tự động vừa ô</span>
                  </label>
                </div>
                
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => {
                      const next = Math.max(8, selectedBubble.style.fontSize - 1);
                      updateStyle({ fontSize: next, autoFontSize: false }, true);
                    }}
                    title="Giảm 1px"
                    className="w-7 h-7 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 flex items-center justify-center shrink-0 transition-all active:scale-95"
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
                    className="w-12 bg-slate-950 border border-slate-800 text-center font-mono text-xs rounded-lg py-1 text-white focus:outline-none focus:border-indigo-500 shrink-0"
                  />

                  <button
                    onClick={() => {
                      const next = Math.min(120, selectedBubble.style.fontSize + 1);
                      updateStyle({ fontSize: next, autoFontSize: false }, true);
                    }}
                    title="Tăng 1px"
                    className="w-7 h-7 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 flex items-center justify-center shrink-0 transition-all active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    min={8}
                    max={80}
                    value={selectedBubble.style.fontSize}
                    onChange={(e) => {
                      updateStyle({ fontSize: Number(e.target.value), autoFontSize: false });
                    }}
                    onMouseUp={flushHistoryCommit}
                    onTouchEnd={flushHistoryCommit}
                    className="flex-1 accent-indigo-500 min-w-0"
                  />
                </div>
              </div>

              {/* Alignment & Styles */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => updateStyle({ textAlign: 'left' }, true)}
                    className={`p-1 rounded ${
                      selectedBubble.style.textAlign === 'left' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateStyle({ textAlign: 'center' }, true)}
                    className={`p-1 rounded ${
                      selectedBubble.style.textAlign === 'center' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateStyle({ textAlign: 'right' }, true)}
                    className={`p-1 rounded ${
                      selectedBubble.style.textAlign === 'right' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => updateStyle({ isBold: !selectedBubble.style.isBold }, true)}
                    className={`p-1 rounded ${
                      selectedBubble.style.isBold ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateStyle({ isItalic: !selectedBubble.style.isItalic }, true)}
                    className={`p-1 rounded ${
                      selectedBubble.style.isItalic ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Colors & Stroke Outline */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/40">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Màu chữ:</label>
                  <div className="flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                    <input
                      type="color"
                      value={selectedBubble.style.color || '#000000'}
                      onChange={(e) => updateStyle({ color: e.target.value })}
                      onBlur={flushHistoryCommit}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[10px] font-mono">{selectedBubble.style.color}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Viền chữ (Stroke):</label>
                  <div className="flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                    <input
                      type="color"
                      value={selectedBubble.style.strokeColor || '#ffffff'}
                      onChange={(e) => updateStyle({ strokeColor: e.target.value })}
                      onBlur={flushHistoryCommit}
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[10px] font-mono">{selectedBubble.style.strokeColor}</span>
                  </div>
                </div>
              </div>

              {/* Stroke Width Slider */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <span>Độ dày viền chữ:</span>
                  <span className="font-mono text-slate-200">{selectedBubble.style.strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={selectedBubble.style.strokeWidth}
                  onChange={(e) => updateStyle({ strokeWidth: Number(e.target.value) })}
                  onMouseUp={flushHistoryCommit}
                  onTouchEnd={flushHistoryCommit}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            {/* 4. Manga Speech Bubble Shape & Frame Styling */}
            <div className="space-y-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800/80">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Hình Dạng Box Manga (Speech Bubble)</span>
              </div>

              {/* 6 Shape Presets Grid */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'ellipse', label: 'Bầu Dục / Elip', icon: Circle },
                  { id: 'rounded', label: 'Bo Góc Mềm', icon: MessageSquare },
                  { id: 'rectangle', label: 'Hộp Dẫn Truyện', icon: Square },
                  { id: 'shout', label: 'Hét / Gai Nhọn', icon: Zap },
                  { id: 'thought', label: 'Suy Nghĩ / Mây', icon: Cloud },
                  { id: 'transparent', label: 'Trong Suốt', icon: Frame },
                ].map((sh) => {
                  const IconComp = sh.icon;
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
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${
                        isSelected
                          ? 'bg-indigo-600/25 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/50'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                      title={sh.label}
                    >
                      <IconComp className={`w-4 h-4 mb-1 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <span className="text-[10px] font-medium leading-tight">{sh.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Box Fill & Background Opacity (If not transparent) */}
              {selectedBubble.style.boxShape !== 'transparent' && (
                <>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/40">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Màu nền hộp thoại:</label>
                      <div className="flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                        <input
                          type="color"
                          value={selectedBubble.style.backgroundColor || '#ffffff'}
                          onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                          onBlur={flushHistoryCommit}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-[10px] font-mono">{selectedBubble.style.backgroundColor}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Màu viền khung:</label>
                      <div className="flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                        <input
                          type="color"
                          value={selectedBubble.style.boxBorderColor || '#000000'}
                          onChange={(e) => updateStyle({ boxBorderColor: e.target.value })}
                          onBlur={flushHistoryCommit}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <span className="text-[10px] font-mono">{selectedBubble.style.boxBorderColor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Background Opacity Slider */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Độ đục nền (Opacity):</span>
                      <span className="font-mono text-slate-200">{Math.round((selectedBubble.style.backgroundOpacity ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={selectedBubble.style.backgroundOpacity ?? 1}
                      onChange={(e) => updateStyle({ backgroundOpacity: Number(e.target.value) })}
                      onMouseUp={flushHistoryCommit}
                      onTouchEnd={flushHistoryCommit}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  {/* Box Border Width */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Độ dày viền khung:</span>
                      <span className="font-mono text-slate-200">{selectedBubble.style.boxBorderWidth ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="8"
                      step="0.5"
                      value={selectedBubble.style.boxBorderWidth ?? 0}
                      onChange={(e) => updateStyle({ boxBorderWidth: Number(e.target.value) })}
                      onMouseUp={flushHistoryCommit}
                      onTouchEnd={flushHistoryCommit}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  {/* Border Radius (For Rounded Box) */}
                  {(selectedBubble.style.boxShape === 'rounded' || !selectedBubble.style.boxShape) && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span>Bán kính bo góc:</span>
                        <span className="font-mono text-slate-200">{selectedBubble.style.borderRadius ?? 16}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="60"
                        value={selectedBubble.style.borderRadius ?? 16}
                        onChange={(e) => updateStyle({ borderRadius: Number(e.target.value) })}
                        onMouseUp={flushHistoryCommit}
                        onTouchEnd={flushHistoryCommit}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  )}

                  {/* Box Padding Slider */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>Khoảng đệm chữ (Padding):</span>
                      <span className="font-mono text-slate-200">{selectedBubble.style.boxPadding ?? 8}px</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="30"
                      value={selectedBubble.style.boxPadding ?? 8}
                      onChange={(e) => updateStyle({ boxPadding: Number(e.target.value) })}
                      onMouseUp={flushHistoryCommit}
                      onTouchEnd={flushHistoryCommit}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </>
              )}
            </div>

            {/* 4. Delete Bubble Button */}
            <div className="pt-2">
              <button
                onClick={() => onDeleteBubble(selectedBubble.id)}
                className="w-full py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 text-red-300 text-xs font-medium flex items-center justify-center space-x-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa Ô Thoại Này (Delete)</span>
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs space-y-3">
            <Type className="w-8 h-8 text-slate-600" />
            <p>Chọn một bong bóng thoại trên ảnh hoặc bấm "+ Thêm Ô" để tùy chỉnh nền và chữ dịch.</p>
          </div>
        )}
      </div>
        </>
      )}
    </aside>
  );
};
