import React from 'react';
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
  Languages, 
  Square,
  Sparkles,
  Layers,
  CircleDot,
  X
} from 'lucide-react';
import { Bubble, TextStyle } from '../types';
import { defaultTextStyle } from '../services/typesettingEngine';

interface BubbleInspectorProps {
  bubbles: Bubble[];
  selectedBubbleId: string | null;
  onSelectBubble: (id: string | null) => void;
  onUpdateBubble: (bubble: Bubble) => void;
  onDeleteBubble: (id: string) => void;
  onAddBubble: () => void;
  onReTranslateBubble: (bubble: Bubble) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

const FONT_OPTIONS = [
  { label: 'Nunito (Manga Bo Tròn Việt Hóa 100%)', value: "'Nunito', sans-serif" },
  { label: 'Be Vietnam Pro (Chuẩn Việt Hóa Đội Dịch)', value: "'Be Vietnam Pro', sans-serif" },
  { label: 'Itim (Nét Bút Tay Manga Việt Hóa)', value: "'Itim', cursive, sans-serif" },
  { label: 'Pangolin (Dễ Thương / Truyện Hài)', value: "'Pangolin', cursive, sans-serif" },
  { label: 'Balsamiq Sans (Phong Cách Manga Trẻ)', value: "'Balsamiq Sans', cursive, sans-serif" },
  { label: 'Mali (Chữ Vẽ Tay Manga Việt Hóa)', value: "'Mali', cursive, sans-serif" },
  { label: 'Comfortaa (Bo Tròn Nhẹ Nhàng)', value: "'Comfortaa', cursive, sans-serif" },
  { label: 'Saira (Chữ Hét Lớn / Kịch Tính)', value: "'Saira Semi Condensed', sans-serif" },
  { label: 'Montserrat (Chữ Đậm Khí Thế)', value: "'Montserrat', sans-serif" },
  { label: 'Inter (Hiện Đại Sạch Sẽ)', value: "'Inter', sans-serif" },
];

export const BubbleInspector: React.FC<BubbleInspectorProps> = ({
  bubbles,
  selectedBubbleId,
  onSelectBubble,
  onUpdateBubble,
  onDeleteBubble,
  onAddBubble,
  onReTranslateBubble,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const selectedBubble = bubbles.find((b) => b.id === selectedBubbleId);

  const updateStyle = (patch: Partial<TextStyle>) => {
    if (!selectedBubble) return;
    onUpdateBubble({
      ...selectedBubble,
      style: {
        ...selectedBubble.style,
        ...patch,
      },
    });
  };

  // Quick Background Presets
  const applyPresetBackground = (preset: 'transparent' | 'white' | 'black' | 'custom') => {
    if (!selectedBubble) return;
    if (preset === 'transparent') {
      updateStyle({ boxPreset: 'transparent', backgroundColor: '#ffffff', backgroundOpacity: 0 });
    } else if (preset === 'white') {
      updateStyle({ boxPreset: 'white', backgroundColor: '#ffffff', backgroundOpacity: 1, borderRadius: 16 });
    } else if (preset === 'black') {
      updateStyle({ boxPreset: 'black', backgroundColor: '#000000', backgroundOpacity: 1, color: '#ffffff', borderRadius: 16 });
    } else if (preset === 'custom') {
      updateStyle({ boxPreset: 'custom', backgroundOpacity: 1 });
    }
  };

  return (
    <aside className={`inspector-drawer ${isOpenMobile ? 'open' : ''} w-80 h-full glass-panel border-l border-slate-800 flex flex-col z-20 select-none`}>
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Type className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-xs tracking-wide uppercase text-slate-200">
            Bong Bóng Thoại ({bubbles.length})
          </h2>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={onAddBubble}
            className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-all flex items-center space-x-1 text-xs"
            title="Tạo thêm ô thoại mới"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Ô</span>
          </button>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="mobile-only p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
              title="Đóng bảng công cụ"
            >
              <X className="w-4 h-4 text-slate-300" />
            </button>
          )}
        </div>
      </div>

      {/* Bubble List Selector Tabs */}
      <div className="p-2 border-b border-slate-800/60 overflow-x-auto flex space-x-1.5 shrink-0">
        {bubbles.map((b, idx) => (
          <button
            key={b.id}
            onClick={() => onSelectBubble(b.id)}
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
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedBubble.style.backgroundOpacity ?? 0}
                    onChange={(e) => updateStyle({ backgroundOpacity: Number(e.target.value) })}
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
                  onChange={(e) =>
                    onUpdateBubble({ ...selectedBubble, originalText: e.target.value })
                  }
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
                  onChange={(e) =>
                    onUpdateBubble({ ...selectedBubble, translatedText: e.target.value })
                  }
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
                  onChange={(e) => updateStyle({ fontFamily: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg p-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font Size & Auto-fit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[10px] text-slate-400">Cỡ chữ (px):</label>
                  <label className="flex items-center space-x-1 text-[11px] text-indigo-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBubble.style.autoFontSize}
                      onChange={(e) => updateStyle({ autoFontSize: e.target.checked })}
                      className="rounded accent-indigo-600"
                    />
                    <span>Tự động vừa ô</span>
                  </label>
                </div>
                {!selectedBubble.style.autoFontSize && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min="10"
                      max="48"
                      value={selectedBubble.style.fontSize}
                      onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className="text-xs font-mono w-8 text-right text-slate-200">
                      {selectedBubble.style.fontSize}px
                    </span>
                  </div>
                )}
              </div>

              {/* Alignment & Styles */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/40">
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => updateStyle({ textAlign: 'left' })}
                    className={`p-1 rounded ${
                      selectedBubble.style.textAlign === 'left' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateStyle({ textAlign: 'center' })}
                    className={`p-1 rounded ${
                      selectedBubble.style.textAlign === 'center' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateStyle({ textAlign: 'right' })}
                    className={`p-1 rounded ${
                      selectedBubble.style.textAlign === 'right' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => updateStyle({ isBold: !selectedBubble.style.isBold })}
                    className={`p-1 rounded ${
                      selectedBubble.style.isBold ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => updateStyle({ isItalic: !selectedBubble.style.isItalic })}
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
                  className="w-full accent-indigo-500"
                />
              </div>
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
    </aside>
  );
};
