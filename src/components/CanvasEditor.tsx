import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Layers, 
  Eye, 
  Brush, 
  MousePointer, 
  Plus, 
  Eraser, 
  Split, 
  Move,
  RotateCcw,
  Square,
  Sparkles
} from 'lucide-react';
import { Bubble, TextStyle } from '../types';
import { renderBubbleOnCanvas, defaultTextStyle } from '../services/typesettingEngine';

interface CanvasEditorProps {
  rawImageUrl: string | null;
  cleanedImageBase64: string | null;
  bubbles: Bubble[];
  selectedBubbleId: string | null;
  onSelectBubble: (id: string | null) => void;
  onUpdateBubble: (bubble: Bubble) => void;
  onAddBubble: (bubble: Bubble) => void;
  onDeleteBubble: (id: string) => void;
  onManualInpaintArea?: (maskBase64: string) => void;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  rawImageUrl,
  cleanedImageBase64,
  bubbles,
  selectedBubbleId,
  onSelectBubble,
  onUpdateBubble,
  onAddBubble,
  onDeleteBubble,
  onManualInpaintArea,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  // View & Transform States
  const [zoom, setZoom] = useState<number>(0.6);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);

  // Tools & View Modes
  const [activeTool, setActiveTool] = useState<'select' | 'add_bubble' | 'brush'>('select');
  const [viewLayer, setViewLayer] = useState<'rendered' | 'original' | 'inpainted' | 'split'>('rendered');
  const [splitPos, setSplitPos] = useState<number>(0.5);

  // Brush settings
  const [brushSize, setBrushSize] = useState<number>(35);
  const [isBrushing, setIsBrushing] = useState<boolean>(false);

  // Bubble Manipulation
  const [isDraggingBubble, setIsDraggingBubble] = useState<boolean>(false);
  const [isResizingBubble, setIsResizingBubble] = useState<boolean>(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [bubbleInitialPos, setBubbleInitialPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Image references & dimensions
  const rawImgRef = useRef<HTMLImageElement | null>(null);
  const cleanedImgRef = useRef<HTMLImageElement | null>(null);
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 1200 });

  // Keyboard Spacebar for Pan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        setSpacePressed(true);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBubbleId && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
          onDeleteBubble(selectedBubbleId);
        }
      }
      if (e.key === 'Escape') {
        onSelectBubble(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedBubbleId, onDeleteBubble, onSelectBubble]);

  // Load Raw Image
  useEffect(() => {
    if (!rawImageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = rawImageUrl;
    img.onload = () => {
      rawImgRef.current = img;
      setImgDimensions({ width: img.width, height: img.height });

      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = img.width;
        maskCanvasRef.current.height = img.height;
        const mctx = maskCanvasRef.current.getContext('2d');
        if (mctx) {
          mctx.fillStyle = '#000000';
          mctx.fillRect(0, 0, img.width, img.height);
        }
      }

      // Center and fit nicely on load
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const scale = Math.min((cw - 80) / img.width, (ch - 80) / img.height, 0.85);
        setZoom(scale);
        setPan({
          x: (cw - img.width * scale) / 2,
          y: Math.max(30, (ch - img.height * scale) / 2),
        });
      }
    };
  }, [rawImageUrl]);

  // Load Cleaned Image (from LaMa)
  useEffect(() => {
    if (!cleanedImageBase64) {
      cleanedImgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = cleanedImageBase64;
    img.onload = () => {
      cleanedImgRef.current = img;
      renderCanvas();
    };
  }, [cleanedImageBase64]);

  // Render Canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rawImgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = imgDimensions;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Background
    if (viewLayer === 'original') {
      ctx.drawImage(rawImgRef.current, 0, 0, width, height);
    } else if (viewLayer === 'inpainted') {
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      ctx.drawImage(bgImg, 0, 0, width, height);
    } else if (viewLayer === 'rendered') {
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      ctx.drawImage(bgImg, 0, 0, width, height);

      // Render all bubbles
      bubbles.forEach((b) => {
        renderBubbleOnCanvas(ctx, b);
      });
    } else if (viewLayer === 'split') {
      const splitX = width * splitPos;

      // Left side: Raw
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, height);
      ctx.clip();
      ctx.drawImage(rawImgRef.current, 0, 0, width, height);
      ctx.restore();

      // Right side: Rendered
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, width - splitX, height);
      ctx.clip();
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      ctx.drawImage(bgImg, 0, 0, width, height);
      bubbles.forEach((b) => renderBubbleOnCanvas(ctx, b));
      ctx.restore();

      // Divider Line
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, height);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 2. Overlay Mask Brush
    if (activeTool === 'brush' && maskCanvasRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      ctx.restore();
    }

    // 3. Selection Outline & 8-point Resize Handles for Active Bubble
    if (selectedBubbleId && viewLayer !== 'original') {
      const selected = bubbles.find((b) => b.id === selectedBubbleId);
      if (selected) {
        ctx.save();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.strokeRect(selected.x, selected.y, selected.width, selected.height);
        ctx.setLineDash([]);

        // 8 handles (corners + midpoints)
        const handleRadius = Math.max(4, 6 / zoom);
        const handles = [
          { name: 'nw', x: selected.x, y: selected.y },
          { name: 'n',  x: selected.x + selected.width / 2, y: selected.y },
          { name: 'ne', x: selected.x + selected.width, y: selected.y },
          { name: 'e',  x: selected.x + selected.width, y: selected.y + selected.height / 2 },
          { name: 'se', x: selected.x + selected.width, y: selected.y + selected.height },
          { name: 's',  x: selected.x + selected.width / 2, y: selected.y + selected.height },
          { name: 'sw', x: selected.x, y: selected.y + selected.height },
          { name: 'w',  x: selected.x, y: selected.y + selected.height / 2 },
        ];

        handles.forEach((h) => {
          ctx.beginPath();
          ctx.arc(h.x, h.y, handleRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#4f46e5';
          ctx.lineWidth = 2 / zoom;
          ctx.stroke();
        });

        ctx.restore();
      }
    }
  }, [imgDimensions, viewLayer, bubbles, selectedBubbleId, activeTool, splitPos, zoom]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, cleanedImageBase64]);

  // Screen to Canvas Coordinates
  const getCanvasCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !containerRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Smooth Mouse Wheel Zoom Centered on Cursor
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 4.5);

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Pan adjustment so zoom centers on mouse position
    const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  // Mouse Down (Drag, Resize, Brush, Pan, Add)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Middle click (button 1), Right click (button 2) or Space held -> Pan
    if (e.button === 1 || e.button === 2 || spacePressed) {
      e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const { x, y } = getCanvasCoords(e);

    // Brush Tool: LaMa Inpainting Mask
    if (activeTool === 'brush') {
      setIsBrushing(true);
      paintMask(x, y);
      return;
    }

    // Add Bubble Tool: Create new bubble
    if (activeTool === 'add_bubble') {
      const newBubble: Bubble = {
        id: `bubble_${Date.now()}`,
        x: Math.max(0, x - 70),
        y: Math.max(0, y - 45),
        width: 140,
        height: 90,
        originalText: '',
        translatedText: 'Nhập chữ...',
        style: { ...defaultTextStyle },
        isInpainted: false,
      };
      onAddBubble(newBubble);
      onSelectBubble(newBubble.id);
      setActiveTool('select');
      return;
    }

    // Select Tool: Check resize handles first
    if (activeTool === 'select' && selectedBubbleId) {
      const selected = bubbles.find((b) => b.id === selectedBubbleId);
      if (selected) {
        const threshold = 14 / zoom;
        const handles: { [key: string]: { x: number; y: number } } = {
          nw: { x: selected.x, y: selected.y },
          ne: { x: selected.x + selected.width, y: selected.y },
          se: { x: selected.x + selected.width, y: selected.y + selected.height },
          sw: { x: selected.x, y: selected.y + selected.height },
          e:  { x: selected.x + selected.width, y: selected.y + selected.height / 2 },
          w:  { x: selected.x, y: selected.y + selected.height / 2 },
          s:  { x: selected.x + selected.width / 2, y: selected.y + selected.height },
          n:  { x: selected.x + selected.width / 2, y: selected.y },
        };

        for (const [key, pos] of Object.entries(handles)) {
          if (Math.hypot(x - pos.x, y - pos.y) <= threshold) {
            setIsResizingBubble(true);
            setResizeHandle(key);
            setBubbleInitialPos({ x: selected.x, y: selected.y, w: selected.width, h: selected.height });
            setDragStart({ x, y });
            return;
          }
        }
      }
    }

    // Check if clicking inside any bubble
    if (activeTool === 'select') {
      let clickedBubble: Bubble | null = null;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
          clickedBubble = b;
          break;
        }
      }

      if (clickedBubble) {
        onSelectBubble(clickedBubble.id);
        setIsDraggingBubble(true);
        setDragStart({ x, y });
        setBubbleInitialPos({
          x: clickedBubble.x,
          y: clickedBubble.y,
          w: clickedBubble.width,
          h: clickedBubble.height,
        });
      } else {
        onSelectBubble(null);
        // Start background pan if clicked on empty space
        setIsPanning(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      return;
    }

    const { x, y } = getCanvasCoords(e);

    if (isBrushing && activeTool === 'brush') {
      paintMask(x, y);
      return;
    }

    // Drag Bubble Position
    if (isDraggingBubble && selectedBubbleId && bubbleInitialPos) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      const selected = bubbles.find((b) => b.id === selectedBubbleId);
      if (selected) {
        onUpdateBubble({
          ...selected,
          x: Math.max(0, Math.round(bubbleInitialPos.x + dx)),
          y: Math.max(0, Math.round(bubbleInitialPos.y + dy)),
        });
      }
      return;
    }

    // 8-Point Resizing
    if (isResizingBubble && selectedBubbleId && bubbleInitialPos && resizeHandle) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      const selected = bubbles.find((b) => b.id === selectedBubbleId);
      if (!selected) return;

      let newX = bubbleInitialPos.x;
      let newY = bubbleInitialPos.y;
      let newW = bubbleInitialPos.w;
      let newH = bubbleInitialPos.h;

      if (resizeHandle.includes('e')) newW = Math.max(30, bubbleInitialPos.w + dx);
      if (resizeHandle.includes('s')) newH = Math.max(20, bubbleInitialPos.h + dy);
      if (resizeHandle.includes('w')) {
        const potentialW = bubbleInitialPos.w - dx;
        if (potentialW >= 30) {
          newX = bubbleInitialPos.x + dx;
          newW = potentialW;
        }
      }
      if (resizeHandle.includes('n')) {
        const potentialH = bubbleInitialPos.h - dy;
        if (potentialH >= 20) {
          newY = bubbleInitialPos.y + dy;
          newH = potentialH;
        }
      }

      onUpdateBubble({
        ...selected,
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDraggingBubble(false);
    setIsResizingBubble(false);
    setIsBrushing(false);
    setResizeHandle(null);
  };

  // Mask Painting logic
  const paintMask = (x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const mctx = maskCanvas.getContext('2d');
    if (!mctx) return;

    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    mctx.fill();
    renderCanvas();
  };

  const handleClearMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const mctx = maskCanvas.getContext('2d');
    if (!mctx) return;
    mctx.fillStyle = '#000000';
    mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    renderCanvas();
  };

  const handleApplyMaskInpaint = () => {
    if (!maskCanvasRef.current || !onManualInpaintArea) return;
    const maskBase64 = maskCanvasRef.current.toDataURL('image/png');
    onManualInpaintArea(maskBase64);
    handleClearMask();
  };

  // Zoom Presets
  const setZoomPreset = (scale: number) => {
    if (!containerRef.current || !rawImgRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    setZoom(scale);
    setPan({
      x: (cw - imgDimensions.width * scale) / 2,
      y: (ch - imgDimensions.height * scale) / 2,
    });
  };

  const handleFitScreen = () => {
    if (!containerRef.current || !rawImgRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min((cw - 60) / imgDimensions.width, (ch - 60) / imgDimensions.height, 1);
    setZoom(scale);
    setPan({
      x: (cw - imgDimensions.width * scale) / 2,
      y: (ch - imgDimensions.height * scale) / 2,
    });
  };

  return (
    <div className="relative flex-1 h-full overflow-hidden canvas-grid-bg flex flex-col select-none">
      {/* Top Floating Studio Toolbar */}
      <div className="canvas-floating-toolbar">
        {/* Tool Segment */}
        <div className="segmented-group">
          <button
            onClick={() => setActiveTool('select')}
            className={`segmented-btn ${activeTool === 'select' ? 'active' : ''}`}
            title="Công cụ chọn & di chuyển ô thoại (V)"
          >
            <MousePointer className="w-3.5 h-3.5 text-indigo-400" />
            <span>Chọn (V)</span>
          </button>

          <button
            onClick={() => setActiveTool('add_bubble')}
            className={`segmented-btn ${activeTool === 'add_bubble' ? 'active' : ''}`}
            title="Tạo ô thoại mới trên trang truyện (B)"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Thêm Ô (B)</span>
          </button>

          <button
            onClick={() => setActiveTool('brush')}
            className={`segmented-btn ${activeTool === 'brush' ? 'active' : ''}`}
            title="Cọ tô vùng cần LaMa xóa nền thủ công"
          >
            <Brush className="w-3.5 h-3.5 text-red-400" />
            <span>Cọ Xóa LaMa</span>
          </button>
        </div>

        {/* View Layer Segment */}
        <div className="segmented-group">
          <button
            onClick={() => setViewLayer('rendered')}
            className={`segmented-btn ${viewLayer === 'rendered' ? 'active' : ''}`}
          >
            <span>Hoàn Chỉnh</span>
          </button>
          <button
            onClick={() => setViewLayer('original')}
            className={`segmented-btn ${viewLayer === 'original' ? 'active' : ''}`}
          >
            <span>Ảnh Gốc</span>
          </button>
          <button
            onClick={() => setViewLayer('inpainted')}
            className={`segmented-btn ${viewLayer === 'inpainted' ? 'active' : ''}`}
          >
            <span>Đã Xóa Chữ</span>
          </button>
          <button
            onClick={() => setViewLayer('split')}
            className={`segmented-btn ${viewLayer === 'split' ? 'active' : ''}`}
            title="So sánh Trước / Sau"
          >
            <Split className="w-3.5 h-3.5 text-purple-400" />
            <span>So Sánh</span>
          </button>
        </div>

        {/* Zoom Controls Segment */}
        <div className="segmented-group">
          <button
            onClick={() => setZoom((z) => Math.max(0.1, z * 0.85))}
            className="btn-icon"
            title="Thu nhỏ"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomPreset(1.0)}
            className="segmented-btn font-mono text-[11px] px-1.5"
            title="Đặt 100% kích thước thực"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(4.5, z * 1.15))}
            className="btn-icon"
            title="Phóng to"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFitScreen}
            className="btn-icon"
            title="Vừa vặn màn hình"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dedicated Mask Brush Sub-Toolbar (When Brush is active) */}
      {activeTool === 'brush' && (
        <div className="canvas-brush-toolbar">
          <span className="text-xs font-semibold text-red-300 flex items-center gap-1.5">
            <Brush className="w-3.5 h-3.5 text-red-400" />
            <span>Cỡ cọ:</span>
          </span>
          <input
            type="range"
            min="10"
            max="120"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-24 accent-red-500 cursor-pointer"
          />
          <span className="text-xs font-mono text-red-200 w-8">{brushSize}px</span>

          <button
            onClick={handleClearMask}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-all"
          >
            Xóa nét vẽ
          </button>
          <button
            onClick={handleApplyMaskInpaint}
            className="px-3.5 py-1 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs shadow-md transition-all flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Chạy LaMa Xóa Vùng Này</span>
          </button>
        </div>
      )}

      {/* Main Canvas Viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex-1 w-full h-full overflow-hidden relative ${
          spacePressed || isPanning ? 'cursor-grab' : activeTool === 'brush' ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: imgDimensions.width,
            height: imgDimensions.height,
          }}
          className="relative shadow-2xl transition-transform duration-75 select-none"
        >
          <canvas
            ref={canvasRef}
            className="rounded shadow-2xl border border-slate-800 bg-slate-900 block"
          />
          <canvas ref={maskCanvasRef} className="hidden" />
        </div>
      </div>

      {/* Bottom Status Hint Bar */}
      <div className="absolute bottom-2 left-4 z-20 flex items-center space-x-3 text-[11px] text-slate-400 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-800">
        <span>💡 <strong>Lăn chuột:</strong> Phóng to/thu nhỏ</span>
        <span>•</span>
        <span><strong>Space + Kéo chuột:</strong> Di chuyển ảnh</span>
        <span>•</span>
        <span><strong>Phím Delete:</strong> Xóa ô thoại</span>
      </div>
    </div>
  );
};
