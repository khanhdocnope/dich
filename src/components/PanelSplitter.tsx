import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';

interface PanelSplitterProps {
  onResize: (deltaX: number) => void;
  onDoubleClick?: () => void;
  direction: 'left' | 'right';
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  title?: string;
  className?: string;
}

export const PanelSplitter: React.FC<PanelSplitterProps> = ({
  onResize,
  onDoubleClick,
  direction,
  isCollapsed = false,
  onToggleCollapse,
  title,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);

  const handlePointerDown = useCallback((clientX: number) => {
    setIsDragging(true);
    startXRef.current = clientX;
    document.body.classList.add('resizing-active');
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only trigger on primary mouse button
    if (e.button !== 0) return;
    e.preventDefault();
    handlePointerDown(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handlePointerDown(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      startXRef.current = e.clientX;
      onResize(deltaX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const clientX = e.touches[0].clientX;
        const deltaX = clientX - startXRef.current;
        startXRef.current = clientX;
        onResize(deltaX);
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      document.body.classList.remove('resizing-active');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerUp);
      document.body.classList.remove('resizing-active');
    };
  }, [isDragging, onResize]);

  return (
    <div
      className={`panel-splitter select-none relative group shrink-0 ${isDragging ? 'is-dragging' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onDoubleClick={onDoubleClick}
      title={title || "Kéo để điều chỉnh kích thước (Nhấp đúp để đặt lại mặc định)"}
      role="separator"
      aria-orientation="vertical"
    >
      {/* Invisible Expanded Hitbox for Effortless Grabbing */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5 z-30 cursor-col-resize" />

      {/* Visual Line Indicator with Ambient Glow */}
      <div className="splitter-line h-full w-[2px] mx-auto transition-colors duration-150" />

      {/* Grip Handle Center Pill */}
      <div className="splitter-grip-pill absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-35 flex items-center justify-center pointer-events-none transition-all duration-200">
        <GripVertical className="w-3.5 h-3.5 text-zinc-500 group-hover:text-[#fbabfe] transition-colors" />
      </div>

      {/* Optional Mini Quick-Collapse Toggle Button */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="splitter-collapse-btn absolute top-3 left-1/2 -translate-x-1/2 z-40 p-0.5 rounded-full bg-[#161618] border border-white/10 text-zinc-400 hover:text-white hover:border-[#fbabfe]/60 hover:bg-[#2E103A] transition-all opacity-0 group-hover:opacity-100 shadow-md"
          title={isCollapsed ? "Mở rộng bảng" : "Thu gọn bảng"}
        >
          {direction === 'left' ? (
            isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />
          ) : (
            isCollapsed ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          )}
        </button>
      )}
    </div>
  );
};
