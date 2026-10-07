import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Brush, 
  Eraser,
  Wand2,
  MousePointer, 
  Plus, 
  Split, 
  Sparkles,
  ImagePlus,
  UploadCloud,
  FileImage,
  Undo2,
  Redo2,
  RotateCcw,
  Loader2,
  Compass,
  ChevronDown,
  ChevronUp,
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { Bubble } from '../types';
import { renderBubbleOnCanvas, defaultTextStyle } from '../services/typesettingEngine';
import { triggerSelectionHaptic, triggerImpactHaptic } from '../services/haptics';

interface CanvasEditorProps {
  rawImageUrl: string | null;
  cleanedImageBase64: string | null;
  bubbles: Bubble[];
  selectedBubbleId: string | null;
  onSelectBubble: (id: string | null) => void;
  onUpdateBubble: (bubble: Bubble, commitToHistory?: boolean) => void;
  onAddBubble: (bubble: Bubble) => void;
  onDeleteBubble: (id: string) => void;
  onCommitHistory?: () => void;
  onManualInpaintArea?: (maskBase64: string) => void;
  onAutoCleanPage?: () => void;
  isCleaningPage?: boolean;
  isColabConnected?: boolean;
  onOpenColabModal?: () => void;
  onAddImages?: (files: FileList | File[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onResetCleaned?: () => void;
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
  onCommitHistory,
  onManualInpaintArea,
  onAutoCleanPage,
  isCleaningPage = false,
  isColabConnected = false,
  onOpenColabModal,
  onAddImages,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onResetCleaned,
}) => {

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);


  // View & Transform States
  const [zoom, setZoom] = useState<number>(0.8);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomRef = useRef<number>(zoom);
  const panRef = useRef<{ x: number; y: number }>(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);
  const [isDraggingFileOver, setIsDraggingFileOver] = useState<boolean>(false);

  // Mini-map Navigator & Marching Ants States
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState<boolean>(false);
  const [isMinimapDragging, setIsMinimapDragging] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const dashOffsetRef = useRef<number>(0);

  // Track already loaded images so they NEVER re-trigger auto-fit or reset zoom/pan
  const lastLoadedRawUrlRef = useRef<string | null>(null);
  const lastLoadedCleanedUrlRef = useRef<string | null>(null);

  // Callback refs to avoid recreating effects on render
  const scheduleRenderRef = useRef<() => void>(() => {});
  const updateOffscreenBgRef = useRef<() => void>(() => {});

  // Tools & View Modes
  const [activeTool, setActiveTool] = useState<'select' | 'add_bubble' | 'brush'>('select');
  const [viewLayer, setViewLayer] = useState<'rendered' | 'original' | 'inpainted' | 'split'>('rendered');
  const [splitPos, setSplitPos] = useState<number>(0.5);

  // Brush settings
  const [brushSize, setBrushSize] = useState<number>(35);
  const [brushMode, setBrushMode] = useState<'brush' | 'eraser'>('brush');
  const [isBrushing, setIsBrushing] = useState<boolean>(false);

  // Bubble Manipulation & Inline Editing
  const [isDraggingBubble, setIsDraggingBubble] = useState<boolean>(false);
  const [isResizingBubble, setIsResizingBubble] = useState<boolean>(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [bubbleInitialPos, setBubbleInitialPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [editingBubbleId, setEditingBubbleId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState<string>('');

  // ✏️ Drag-to-Draw New Bubble States
  const [isDrawingNewBubble, setIsDrawingNewBubble] = useState<boolean>(false);
  const [drawStartPos, setDrawStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [currentDrawBox, setCurrentDrawBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [dynamicCursor, setDynamicCursor] = useState<string>('default');

  // Image references & dimensions
  const rawImgRef = useRef<HTMLImageElement | null>(null);
  const cleanedImgRef = useRef<HTMLImageElement | null>(null);
  const offscreenBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 1200 });

  // Pre-render Offscreen Background Canvas (Blazing fast 60FPS blitting)
  const updateOffscreenBg = useCallback(() => {
    if (!rawImgRef.current) return;
    const { width, height } = imgDimensions;

    if (!offscreenBgCanvasRef.current) {
      offscreenBgCanvasRef.current = document.createElement('canvas');
    }
    const bgCanvas = offscreenBgCanvasRef.current;
    if (bgCanvas.width !== width || bgCanvas.height !== height) {
      bgCanvas.width = width;
      bgCanvas.height = height;
    }

    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return;

    bgCtx.clearRect(0, 0, width, height);

    if (viewLayer === 'original') {
      bgCtx.drawImage(rawImgRef.current, 0, 0, width, height);
    } else if (viewLayer === 'inpainted') {
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      bgCtx.drawImage(bgImg, 0, 0, width, height);
    } else if (viewLayer === 'rendered') {
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      bgCtx.drawImage(bgImg, 0, 0, width, height);
    } else if (viewLayer === 'split') {
      const splitX = width * splitPos;
      // Left side: Raw
      bgCtx.save();
      bgCtx.beginPath();
      bgCtx.rect(0, 0, splitX, height);
      bgCtx.clip();
      bgCtx.drawImage(rawImgRef.current, 0, 0, width, height);
      bgCtx.restore();

      // Right side: Inpainted / Rendered
      bgCtx.save();
      bgCtx.beginPath();
      bgCtx.rect(splitX, 0, width - splitX, height);
      bgCtx.clip();
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      bgCtx.drawImage(bgImg, 0, 0, width, height);
      bgCtx.restore();

      // Divider Line
      bgCtx.beginPath();
      bgCtx.moveTo(splitX, 0);
      bgCtx.lineTo(splitX, height);
      bgCtx.strokeStyle = '#6366f1';
      bgCtx.lineWidth = 3;
      bgCtx.stroke();
    }
  }, [imgDimensions, viewLayer, splitPos]);

  // Mini-map Navigator Render (Photoshop / Figma Standard)
  const renderMinimap = useCallback(() => {
    const mmCanvas = minimapCanvasRef.current;
    if (!mmCanvas || !rawImgRef.current) return;
    const mmCtx = mmCanvas.getContext('2d');
    if (!mmCtx) return;

    const { width: imgW, height: imgH } = imgDimensions;
    const mmW = 160;
    const mmH = Math.max(80, Math.round(mmW * (imgH / imgW)));

    if (mmCanvas.width !== mmW || mmCanvas.height !== mmH) {
      mmCanvas.width = mmW;
      mmCanvas.height = mmH;
    }

    mmCtx.clearRect(0, 0, mmW, mmH);

    // 1. Draw scaled background image
    if (offscreenBgCanvasRef.current) {
      mmCtx.drawImage(offscreenBgCanvasRef.current, 0, 0, mmW, mmH);
    } else {
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      mmCtx.drawImage(bgImg, 0, 0, mmW, mmH);
    }

    const scale = mmW / imgW;

    // 2. Draw scaled bubble outlines on minimap
    bubbles.forEach((b) => {
      mmCtx.fillStyle = 'rgba(99, 102, 241, 0.45)';
      mmCtx.strokeStyle = '#818cf8';
      mmCtx.lineWidth = 1;
      mmCtx.fillRect(b.x * scale, b.y * scale, b.width * scale, b.height * scale);
      mmCtx.strokeRect(b.x * scale, b.y * scale, b.width * scale, b.height * scale);
    });

    // 3. Draw Viewport Rect (The area currently visible in workspace)
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      const currentZ = zoomRef.current;
      const currentPan = panRef.current;

      const vpImgX = -currentPan.x / currentZ;
      const vpImgY = -currentPan.y / currentZ;
      const vpImgW = cw / currentZ;
      const vpImgH = ch / currentZ;

      const mmVpX = vpImgX * scale;
      const mmVpY = vpImgY * scale;
      const mmVpW = vpImgW * scale;
      const mmVpH = vpImgH * scale;

      // Neon Indigo Viewport Overlay
      mmCtx.fillStyle = 'rgba(99, 102, 241, 0.25)';
      mmCtx.fillRect(mmVpX, mmVpY, mmVpW, mmVpH);

      mmCtx.strokeStyle = '#a5b4fc';
      mmCtx.lineWidth = 1.5;
      mmCtx.strokeRect(mmVpX, mmVpY, mmVpW, mmVpH);
    }
  }, [imgDimensions, bubbles]);

  const moveViewportFromMinimap = useCallback((clientX: number, clientY: number) => {
    if (!minimapCanvasRef.current || !containerRef.current) return;
    const rect = minimapCanvasRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const clickY = Math.max(0, Math.min(clientY - rect.top, rect.height));

    const { width: imgW, height: imgH } = imgDimensions;
    const imgX = (clickX / rect.width) * imgW;
    const imgY = (clickY / rect.height) * imgH;

    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;

    const newPan = {
      x: Math.round(cw / 2 - imgX * zoomRef.current),
      y: Math.round(ch / 2 - imgY * zoomRef.current),
    };

    panRef.current = newPan;
    setPan(newPan);
  }, [imgDimensions]);

  // Smooth Zoom Slider Handler (10% to 400%)
  const handleZoomSlider = useCallback((percent: number) => {
    const newZoom = Math.min(Math.max(percent / 100, 0.1), 4.0);
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const centerX = cw / 2;
    const centerY = ch / 2;
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const nextPan = {
      x: Math.round(centerX - (centerX - currentPan.x) * (newZoom / currentZoom)),
      y: Math.round(centerY - (centerY - currentPan.y) * (newZoom / currentZoom)),
    };
    zoomRef.current = newZoom;
    panRef.current = nextPan;
    setZoom(newZoom);
    setPan(nextPan);
  }, []);

  // Render Canvas with rAF Throttling
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rawImgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = imgDimensions;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    // 1. Fast Blit Offscreen Background (Instant 60FPS+)
    if (offscreenBgCanvasRef.current) {
      ctx.drawImage(offscreenBgCanvasRef.current, 0, 0);
    } else {
      const bgImg = cleanedImgRef.current || rawImgRef.current;
      ctx.drawImage(bgImg, 0, 0, width, height);
    }

    // 2. Overlay Text Bubbles
    if (viewLayer === 'rendered' || viewLayer === 'split') {
      bubbles.forEach((b) => {
        renderBubbleOnCanvas(ctx, b);
      });
    }

    // 3. Overlay Mask Brush
    if (activeTool === 'brush' && maskCanvasRef.current) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.drawImage(maskCanvasRef.current, 0, 0);
      ctx.restore();
    }

    const currentZ = zoomRef.current;

    // 4. Selection Outline & 8-point Resize Handles for Active Bubble (Figma Marching Ants & Neon Glow)
    if (selectedBubbleId && viewLayer !== 'original') {
      const selected = bubbles.find((b) => b.id === selectedBubbleId);
      if (selected) {
        ctx.save();

        // Outer Glow Halo
        ctx.shadowColor = 'rgba(99, 102, 241, 0.85)';
        ctx.shadowBlur = 12 / currentZ;
        ctx.strokeStyle = '#312e81';
        ctx.lineWidth = 3 / currentZ;
        ctx.strokeRect(selected.x, selected.y, selected.width, selected.height);

        // Inner Animated Marching Ants Dashed Stroke
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#a5b4fc';
        ctx.lineWidth = 2 / currentZ;
        ctx.lineDashOffset = -dashOffsetRef.current;
        ctx.setLineDash([6 / currentZ, 4 / currentZ]);
        ctx.strokeRect(selected.x, selected.y, selected.width, selected.height);
        ctx.setLineDash([]);

        // 8 Figma-style handles with white center and indigo border
        const handleSize = Math.max(5, 7 / currentZ);
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
          ctx.rect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#4f46e5';
          ctx.lineWidth = 1.5 / currentZ;
          ctx.stroke();
        });

        ctx.restore();
      }
    }

    // 5. Live Drag-to-Draw Preview Box
    if (isDrawingNewBubble && currentDrawBox) {
      ctx.save();
      ctx.fillStyle = 'rgba(99, 102, 241, 0.22)';
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2 / currentZ;
      ctx.setLineDash([6 / currentZ, 4 / currentZ]);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(currentDrawBox.x, currentDrawBox.y, currentDrawBox.width, currentDrawBox.height, 8);
      } else {
        ctx.rect(currentDrawBox.x, currentDrawBox.y, currentDrawBox.width, currentDrawBox.height);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 6. Refresh Mini-map
    renderMinimap();
  }, [imgDimensions, viewLayer, bubbles, selectedBubbleId, activeTool, isDrawingNewBubble, currentDrawBox, renderMinimap]);

  // RequestAnimationFrame Throttled Render Schedule
  const scheduleRender = useCallback(() => {
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
    }
    animFrameIdRef.current = requestAnimationFrame(() => {
      renderCanvas();
      animFrameIdRef.current = null;
    });
  }, [renderCanvas]);

  scheduleRenderRef.current = scheduleRender;
  updateOffscreenBgRef.current = updateOffscreenBg;

  // Marching Ants 60 FPS Animation Loop (Only active when a bubble is selected)
  useEffect(() => {
    if (!selectedBubbleId) return;

    let animId: number;
    const animateSelection = () => {
      dashOffsetRef.current = (dashOffsetRef.current + 0.35) % 100;
      scheduleRenderRef.current();
      animId = requestAnimationFrame(animateSelection);
    };

    animId = requestAnimationFrame(animateSelection);
    return () => cancelAnimationFrame(animId);
  }, [selectedBubbleId]);

  // 1. Load Raw Image whenever rawImageUrl changes
  useEffect(() => {
    if (!rawImageUrl) {
      lastLoadedRawUrlRef.current = null;
      rawImgRef.current = null;
      if (offscreenBgCanvasRef.current) {
        const bgCtx = offscreenBgCanvasRef.current.getContext('2d');
        if (bgCtx) bgCtx.clearRect(0, 0, offscreenBgCanvasRef.current.width, offscreenBgCanvasRef.current.height);
      }
      scheduleRenderRef.current();
      return;
    }

    // NEVER reload or reset zoom/pan if the same rawImageUrl is already loaded
    if (rawImageUrl === lastLoadedRawUrlRef.current && rawImgRef.current) {
      return;
    }
    lastLoadedRawUrlRef.current = rawImageUrl;
    setImageLoadError(false);

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!isMounted) return;
      setImageLoadError(false);
      rawImgRef.current = img;
      const dims = { width: img.naturalWidth || 800, height: img.naturalHeight || 1200 };
      setImgDimensions(dims);

      // Auto-fit initial view centered in container ONLY on initial load of a new image
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth || 800;
        const ch = containerRef.current.clientHeight || 900;
        const scaleX = (cw - 60) / dims.width;
        const scaleY = (ch - 60) / dims.height;
        const fitZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.15), 1.5);
        const initialPan = {
          x: Math.round((cw - dims.width * fitZoom) / 2),
          y: Math.round((ch - dims.height * fitZoom) / 2),
        };
        zoomRef.current = fitZoom;
        panRef.current = initialPan;
        setZoom(fitZoom);
        setPan(initialPan);
      }

      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = dims.width;
        maskCanvasRef.current.height = dims.height;
      }

      updateOffscreenBgRef.current();
      scheduleRenderRef.current();
    };

    img.onerror = () => {
      if (!isMounted) return;
      setImageLoadError(true);
      rawImgRef.current = null;
      lastLoadedRawUrlRef.current = null;
      console.warn('CanvasEditor failed to load image:', rawImageUrl);
    };

    img.src = rawImageUrl;

    return () => {
      isMounted = false;
    };
  }, [rawImageUrl]);

  // 2. Load Cleaned/Inpainted Image whenever cleanedImageBase64 changes
  useEffect(() => {
    if (!cleanedImageBase64) {
      lastLoadedCleanedUrlRef.current = null;
      cleanedImgRef.current = null;
      updateOffscreenBgRef.current();
      scheduleRenderRef.current();
      return;
    }

    if (cleanedImageBase64 === lastLoadedCleanedUrlRef.current && cleanedImgRef.current) {
      return;
    }
    lastLoadedCleanedUrlRef.current = cleanedImageBase64;

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!isMounted) return;
      cleanedImgRef.current = img;
      updateOffscreenBgRef.current();
      scheduleRenderRef.current();
    };
    img.src = cleanedImageBase64;

    return () => {
      isMounted = false;
    };
  }, [cleanedImageBase64]);

  // 3. Update background buffer only when layer configuration changes
  useEffect(() => {
    updateOffscreenBg();
    scheduleRender();
  }, [updateOffscreenBg, scheduleRender, viewLayer, splitPos]);

  // 4. Render overlay elements (bubbles, active tool, live drag box) without re-drawing offscreen background
  useEffect(() => {
    scheduleRender();
  }, [scheduleRender, bubbles, selectedBubbleId, activeTool, isDrawingNewBubble, currentDrawBox]);

  useEffect(() => {
    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, []);

  // 5. Ultra-Smooth 60/120FPS Native Non-Passive Mouse Wheel Zoom Centered on Cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.14 : 0.88);
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const nextZoom = Math.min(Math.max(currentZoom * factor, 0.08), 5.0);
      const nextPan = {
        x: mouseX - (mouseX - currentPan.x) * (nextZoom / currentZoom),
        y: mouseY - (mouseY - currentPan.y) * (nextZoom / currentZoom),
      };

      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [rawImageUrl]);

  // Keyboard listener for Spacebar pan, Delete bubble, and Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTextInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      if (e.code === 'Space' && !spacePressed && !isTextInput) {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }

      // Delete / Backspace key to remove active bubble
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTextInput && selectedBubbleId && !editingBubbleId) {
        e.preventDefault();
        triggerImpactHaptic();
        onDeleteBubble(selectedBubbleId);
        return;
      }

      // Undo / Redo Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && !isTextInput) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            onRedo?.();
          } else {
            onUndo?.();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          onRedo?.();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressed, selectedBubbleId, editingBubbleId, onDeleteBubble, onUndo, onRedo]);

  // Zoom by factor centered on screen (used by toolbar buttons)
  const handleZoomBy = (factor: number) => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const centerX = cw / 2;
    const centerY = ch / 2;

    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    const nextZoom = Math.min(Math.max(currentZoom * factor, 0.08), 5.0);
    const nextPan = {
      x: centerX - (centerX - currentPan.x) * (nextZoom / currentZoom),
      y: centerY - (centerY - currentPan.y) * (nextZoom / currentZoom),
    };

    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setPan(nextPan);
  };

  // Screen to Canvas Coordinates
  const getCanvasCoords = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!canvasRef.current || !containerRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const currentZ = zoomRef.current;
    const x = (e.clientX - rect.left) / currentZ;
    const y = (e.clientY - rect.top) / currentZ;
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Mouse Down (Drag, Resize, Brush, Pan, Add)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || e.button === 2 || spacePressed) {
      e.preventDefault();
      setIsPanning(true);
      setStartPan({ x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y });
      return;
    }

    const { x, y } = getCanvasCoords(e);

    // Brush Tool: LaMa Inpainting Mask
    if (activeTool === 'brush') {
      setIsBrushing(true);
      paintMask(x, y);
      return;
    }

    // Add Bubble Tool: Start Drag-to-Draw box directly on canvas
    if (activeTool === 'add_bubble') {
      setIsDrawingNewBubble(true);
      setDrawStartPos({ x, y });
      setCurrentDrawBox({ x, y, width: 0, height: 0 });
      return;
    }

    // Select Tool: Check resize handles first
    if (activeTool === 'select' && selectedBubbleId) {
      const selected = bubbles.find((b) => b.id === selectedBubbleId);
      if (selected) {
        const threshold = 14 / zoomRef.current;
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
        triggerSelectionHaptic();
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
        setIsPanning(true);
        setStartPan({ x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y });
      }
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      const newPan = { x: e.clientX - startPan.x, y: e.clientY - startPan.y };
      panRef.current = newPan;
      setPan(newPan);
      return;
    }

    const { x, y } = getCanvasCoords(e);

    // Drag-to-Draw New Bubble
    if (isDrawingNewBubble) {
      const minX = Math.min(x, drawStartPos.x);
      const minY = Math.min(y, drawStartPos.y);
      const w = Math.abs(x - drawStartPos.x);
      const h = Math.abs(y - drawStartPos.y);
      setCurrentDrawBox({ x: minX, y: minY, width: w, height: h });
      return;
    }

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
      return;
    }

    // Dynamic Hover Cursor Detection
    if (activeTool === 'select') {
      if (selectedBubbleId) {
        const selected = bubbles.find((b) => b.id === selectedBubbleId);
        if (selected) {
          const threshold = 14 / zoomRef.current;
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
              if (key === 'nw' || key === 'se') setDynamicCursor('nwse-resize');
              else if (key === 'ne' || key === 'sw') setDynamicCursor('nesw-resize');
              else if (key === 'n' || key === 's') setDynamicCursor('ns-resize');
              else if (key === 'e' || key === 'w') setDynamicCursor('ew-resize');
              return;
            }
          }
          if (x >= selected.x && x <= selected.x + selected.width && y >= selected.y && y <= selected.y + selected.height) {
            setDynamicCursor('move');
            return;
          }
        }
      }

      // Check if hovering over another bubble
      const isHoveringOther = bubbles.some((b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
      if (isHoveringOther) {
        setDynamicCursor('pointer');
        return;
      }

      setDynamicCursor('default');
    }
  };

  const handleMouseUp = () => {
    // Check if dragging or resizing changed the bubble position/size -> commit to history
    if ((isDraggingBubble || isResizingBubble) && selectedBubbleId && bubbleInitialPos) {
      const selected = bubbles.find((b) => b.id === selectedBubbleId);
      if (
        selected &&
        (selected.x !== bubbleInitialPos.x ||
          selected.y !== bubbleInitialPos.y ||
          selected.width !== bubbleInitialPos.w ||
          selected.height !== bubbleInitialPos.h)
      ) {
        onCommitHistory?.();
      }
    }

    setIsPanning(false);
    setIsDraggingBubble(false);
    setIsResizingBubble(false);
    setIsBrushing(false);
    setResizeHandle(null);
    setBubbleInitialPos(null);

    // Finalize Drag-to-Draw New Bubble
    if (isDrawingNewBubble) {
      setIsDrawingNewBubble(false);
      const box = currentDrawBox;
      setCurrentDrawBox(null);
      if (box) {
        const isClickOnly = box.width < 15 && box.height < 15;
        const newBubble: Bubble = {
          id: `bubble_${Date.now()}`,
          x: isClickOnly ? Math.max(0, drawStartPos.x - 70) : box.x,
          y: isClickOnly ? Math.max(0, drawStartPos.y - 45) : box.y,
          width: isClickOnly ? 140 : Math.max(30, box.width),
          height: isClickOnly ? 90 : Math.max(20, box.height),
          originalText: '',
          translatedText: 'Nhập chữ...',
          style: { ...defaultTextStyle },
          isInpainted: false,
        };
        onAddBubble(newBubble);
        triggerImpactHaptic();
        onSelectBubble(newBubble.id);
        setActiveTool('select');
      }
    }
  };

  // Global window listeners for drag & pan gestures so mouse doesn't get lost outside canvas
  useEffect(() => {
    if (!isPanning && !isDraggingBubble && !isResizingBubble && !isBrushing && !isDrawingNewBubble && !isMinimapDragging) {
      return;
    }

    const onWindowMouseMove = (e: MouseEvent) => {
      if (isMinimapDragging) {
        moveViewportFromMinimap(e.clientX, e.clientY);
        return;
      }

      if (isPanning) {
        const newPan = { x: e.clientX - startPan.x, y: e.clientY - startPan.y };
        panRef.current = newPan;
        setPan(newPan);
        return;
      }

      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const currentZ = zoomRef.current;
      const x = Math.round((e.clientX - rect.left) / currentZ);
      const y = Math.round((e.clientY - rect.top) / currentZ);

      if (isDrawingNewBubble) {
        const minX = Math.min(x, drawStartPos.x);
        const minY = Math.min(y, drawStartPos.y);
        const w = Math.abs(x - drawStartPos.x);
        const h = Math.abs(y - drawStartPos.y);
        setCurrentDrawBox({ x: minX, y: minY, width: w, height: h });
        return;
      }

      if (isBrushing && activeTool === 'brush') {
        paintMask(x, y);
        return;
      }

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
        return;
      }
    };

    const onWindowMouseUp = () => {
      setIsMinimapDragging(false);
      handleMouseUp();
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [
    isPanning,
    startPan,
    isDraggingBubble,
    dragStart,
    bubbleInitialPos,
    selectedBubbleId,
    bubbles,
    isResizingBubble,
    resizeHandle,
    isBrushing,
    activeTool,
    isDrawingNewBubble,
    drawStartPos,
    isMinimapDragging,
    moveViewportFromMinimap,
  ]);

  // Double Click for Direct Inline Text Editing
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = getCanvasCoords(e);
    let clicked: Bubble | null = null;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        clicked = b;
        break;
      }
    }
    if (clicked) {
      triggerSelectionHaptic();
      onSelectBubble(clicked.id);
      setEditingBubbleId(clicked.id);
      setInlineEditText(clicked.translatedText || clicked.originalText || '');
    }
  };

  // Mobile Pinch-to-Zoom & Touch Gesture Handling with Image Anchor Centering
  const touchStateRef = useRef<{
    initialDist: number;
    initialZoom: number;
    anchorImgX: number;
    anchorImgY: number;
  } | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && containerRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = containerRef.current.getBoundingClientRect();
      const centerInContainerX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const centerInContainerY = (t1.clientY + t2.clientY) / 2 - rect.top;

      // Anchor point on the unscaled image plane
      const currentZ = zoomRef.current;
      const currentP = panRef.current;
      const anchorImgX = (centerInContainerX - currentP.x) / currentZ;
      const anchorImgY = (centerInContainerY - currentP.y) / currentZ;

      touchStateRef.current = {
        initialDist: Math.max(dist, 1),
        initialZoom: currentZ,
        anchorImgX,
        anchorImgY,
      };
      setIsPanning(false);
      setIsDraggingBubble(false);
      setIsResizingBubble(false);
      setIsBrushing(false);
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const fakeMouseEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0,
        preventDefault: () => {},
      } as unknown as React.MouseEvent<HTMLDivElement>;
      handleMouseDown(fakeMouseEvent);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStateRef.current && containerRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = containerRef.current.getBoundingClientRect();
      const centerInContainerX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const centerInContainerY = (t1.clientY + t2.clientY) / 2 - rect.top;

      const scaleChange = dist / touchStateRef.current.initialDist;
      const newZoom = Math.min(Math.max(touchStateRef.current.initialZoom * scaleChange, 0.08), 5.0);

      // Keep the exact image point centered between fingers
      const newPanX = Math.round(centerInContainerX - touchStateRef.current.anchorImgX * newZoom);
      const newPanY = Math.round(centerInContainerY - touchStateRef.current.anchorImgY * newZoom);

      zoomRef.current = newZoom;
      panRef.current = { x: newPanX, y: newPanY };
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    } else if (e.touches.length === 1 && !touchStateRef.current) {
      const touch = e.touches[0];
      const fakeMouseEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as unknown as React.MouseEvent<HTMLDivElement>;
      handleMouseMove(fakeMouseEvent);
    }
  };

  const handleTouchEnd = () => {
    touchStateRef.current = null;
    handleMouseUp();
  };

  // Mask Painting logic (Interactive Ruby Red Overlay with Eraser Mode)
  const paintMask = (x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const mctx = maskCanvas.getContext('2d');
    if (!mctx) return;

    if (brushMode === 'eraser') {
      mctx.globalCompositeOperation = 'destination-out';
      mctx.beginPath();
      mctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      mctx.fill();
    } else {
      mctx.globalCompositeOperation = 'source-over';
      mctx.fillStyle = '#ef4444';
      mctx.beginPath();
      mctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      mctx.fill();
    }
    renderCanvas();
  };

  const handleClearMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const mctx = maskCanvas.getContext('2d');
    if (!mctx) return;
    mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    renderCanvas();
  };

  const handleApplyMaskInpaint = () => {
    if (!maskCanvasRef.current || !onManualInpaintArea) return;
    const { width, height } = imgDimensions;

    // Convert transparent red mask into pure black & white binary mask for LaMa
    const binaryCanvas = document.createElement('canvas');
    binaryCanvas.width = width;
    binaryCanvas.height = height;
    const bctx = binaryCanvas.getContext('2d');
    if (!bctx) return;

    bctx.fillStyle = '#000000';
    bctx.fillRect(0, 0, width, height);

    bctx.drawImage(maskCanvasRef.current, 0, 0);
    const imgData = bctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    let hasMask = false;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 20 || d[i] > 50) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = 255;
        hasMask = true;
      } else {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 255;
      }
    }

    if (!hasMask) {
      alert('Chưa có nét vẽ nào. Vui lòng dùng cọ tô vùng chữ hoặc SFX cần xóa.');
      return;
    }

    bctx.putImageData(imgData, 0, 0);
    const maskBase64 = binaryCanvas.toDataURL('image/png');
    onManualInpaintArea(maskBase64);
    handleClearMask();
  };

  // Drag and Drop File Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFileOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFileOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFileOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onAddImages) {
      onAddImages(e.dataTransfer.files);
    }
  };

  // Zoom Presets
  const setZoomPreset = (scale: number) => {
    if (!containerRef.current || !rawImgRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const newPan = {
      x: Math.round((cw - imgDimensions.width * scale) / 2),
      y: Math.round((ch - imgDimensions.height * scale) / 2),
    };
    zoomRef.current = scale;
    panRef.current = newPan;
    setZoom(scale);
    setPan(newPan);
  };

  const handleFitScreen = () => {
    if (!containerRef.current || !rawImgRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min((cw - 40) / imgDimensions.width, (ch - 60) / imgDimensions.height, 1.2);
    const newPan = {
      x: Math.max(10, Math.round((cw - imgDimensions.width * scale) / 2)),
      y: Math.max(20, Math.round((ch - imgDimensions.height * scale) / 2)),
    };
    zoomRef.current = scale;
    panRef.current = newPan;
    setZoom(scale);
    setPan(newPan);
  };

  return (
    <div 
      className="relative flex-1 h-full overflow-hidden canvas-grid-bg flex flex-col select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Input for Picking from Gallery */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0 && onAddImages) {
            onAddImages(e.target.files);
            e.target.value = '';
          }
        }}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* Hidden Folder Input for Entire Directory Selection */}
      <input
        type="file"
        ref={folderInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0 && onAddImages) {
            onAddImages(e.target.files);
            e.target.value = '';
          }
        }}
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
      />


      {/* Drag Over Overlay */}
      {isDraggingFileOver && (
        <div className="absolute inset-0 z-40 bg-indigo-950/80 backdrop-blur-sm border-2 border-dashed border-indigo-400 flex flex-col items-center justify-center p-6 space-y-4">
          <div className="p-4 rounded-3xl bg-indigo-600/30 text-indigo-300 animate-bounce">
            <UploadCloud className="w-12 h-12" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-lg font-bold text-white">Thả ảnh vào đây để nạp vào Studio</h3>
            <p className="text-xs text-indigo-200">Tự động xử lý và lưu trữ vào ứng dụng</p>
          </div>
        </div>
      )}

      {/* Top Floating Studio Toolbar (Only shown when an image is loaded) */}
      {rawImageUrl && (
        <div className="canvas-floating-toolbar">
          {/* Tool Segment */}
          <div className="segmented-group">
            <button
              onClick={() => setActiveTool('select')}
              className={`segmented-btn ${activeTool === 'select' ? 'active' : ''}`}
              title="Công cụ chọn & di chuyển ô thoại (V)"
            >
              <MousePointer className="w-3.5 h-3.5 text-indigo-400" />
              <span className="desktop-inline">Chọn (V)</span>
            </button>

            <button
              onClick={() => setActiveTool('add_bubble')}
              className={`segmented-btn ${activeTool === 'add_bubble' ? 'active' : ''}`}
              title="Tạo ô thoại mới trên trang truyện (B)"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span className="desktop-inline">Thêm Ô (B)</span>
            </button>

            <button
              onClick={() => setActiveTool('brush')}
              className={`segmented-btn ${activeTool === 'brush' ? 'active' : ''}`}
              title="Cọ tô vùng cần xóa nền"
            >
              <Brush className="w-3.5 h-3.5 text-red-400" />
              <span className="desktop-inline">Cọ Xóa</span>
            </button>
          </div>

          {/* View Layer Segment */}
          <div className="segmented-group">
            <button
              onClick={() => setViewLayer('rendered')}
              className={`segmented-btn ${viewLayer === 'rendered' ? 'active' : ''}`}
              title="Xem tranh đã dịch hoàn chỉnh"
            >
              <span>Hoàn Chỉnh</span>
            </button>
            <button
              onClick={() => setViewLayer('original')}
              className={`segmented-btn ${viewLayer === 'original' ? 'active' : ''}`}
              title="Xem tranh gốc tiếng Nhật/Trung"
            >
              <span>Ảnh Gốc</span>
            </button>
            <button
              onClick={() => setViewLayer('inpainted')}
              className={`segmented-btn ${viewLayer === 'inpainted' ? 'active' : ''}`}
              title="Xem tranh đã xóa chữ sạch"
            >
              <span>Đã Xóa Chữ</span>
            </button>
            <button
              onClick={() => setViewLayer('split')}
              className={`segmented-btn ${viewLayer === 'split' ? 'active' : ''}`}
              title="So sánh Trước / Sau"
            >
              <Split className="w-3.5 h-3.5 text-purple-400" />
              <span className="desktop-inline">So Sánh</span>
            </button>
          </div>

          {/* Interactive Comparison Split Slider (When in Split View) */}
          {viewLayer === 'split' && (
            <div className="segmented-group items-center px-2 py-0.5 space-x-1.5 bg-purple-950/40 border-purple-500/30">
              <span className="text-[10px] text-purple-300 font-medium">Gốc</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={splitPos}
                onChange={(e) => setSplitPos(Number(e.target.value))}
                className="w-20 accent-purple-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                title="Kéo trượt để so sánh ảnh gốc và ảnh đã xóa"
              />
              <span className="text-[10px] text-purple-300 font-medium">Đã Xóa</span>
            </div>
          )}

          {/* AI Page Cleaner Button */}
          {onAutoCleanPage && (
            <div className="segmented-group">
              <button
                onClick={onAutoCleanPage}
                disabled={isCleaningPage}
                className="segmented-btn text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                title="Tự động quét ký tự và xóa chữ toàn bộ trang bằng LaMa FFC"
              >
                {isCleaningPage ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span className="desktop-inline">Đang AI Xóa...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="desktop-inline">AI Xóa Trang</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* History Segment (Undo / Redo / Reset) */}
          <div className="segmented-group">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="btn-icon disabled:opacity-30"
              title="Hoàn tác thao tác trước (Ctrl + Z)"
            >
              <Undo2 className="w-3.5 h-3.5 text-indigo-300" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="btn-icon disabled:opacity-30"
              title="Làm lại thao tác vừa hoàn tác (Ctrl + Y)"
            >
              <Redo2 className="w-3.5 h-3.5 text-indigo-300" />
            </button>
            {cleanedImageBase64 && onResetCleaned && (
              <button
                onClick={onResetCleaned}
                className="segmented-btn text-[11px] text-amber-300 hover:text-amber-200"
                title="Khôi phục lại ảnh gốc ban đầu"
              >
                <RotateCcw className="w-3 h-3 text-amber-400 mr-1" />
                <span className="desktop-inline">Khôi Phục Gốc</span>
              </button>
            )}
          </div>

          {/* Photoshop / Figma Zoom Controls Segment */}
          <div className="segmented-group flex items-center">
            <button
              onClick={() => handleZoomBy(0.85)}
              className="btn-icon"
              title="Thu nhỏ (Zoom Out)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="10"
              max="400"
              step="5"
              value={Math.round(zoom * 100)}
              onChange={(e) => handleZoomSlider(Number(e.target.value))}
              className="zoom-slider-range w-16 md:w-24 desktop-inline cursor-pointer mx-1"
              title={`Thu phóng: ${Math.round(zoom * 100)}%`}
            />
            <button
              onClick={() => setZoomPreset(1.0)}
              className="segmented-btn font-mono text-[11px] px-1.5 min-w-[42px] text-center"
              title="Nhấp để đặt 100% kích thước thực"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => handleZoomBy(1.15)}
              className="btn-icon"
              title="Phóng to (Zoom In)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleFitScreen}
              className="btn-icon"
              title="Vừa vặn màn hình (Fit View)"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dedicated Mask Brush Sub-Toolbar (When Brush is active) */}
      {rawImageUrl && activeTool === 'brush' && (
        <div className="canvas-brush-toolbar flex-wrap">
          {/* Brush / Eraser Mode Toggle */}
          <div className="segmented-group">
            <button
              onClick={() => setBrushMode('brush')}
              className={`segmented-btn ${brushMode === 'brush' ? 'active' : ''}`}
              title="Cọ tô vùng cần xóa"
            >
              <Brush className="w-3.5 h-3.5 text-red-400" />
              <span>Cọ Tô</span>
            </button>
            <button
              onClick={() => setBrushMode('eraser')}
              className={`segmented-btn ${brushMode === 'eraser' ? 'active' : ''}`}
              title="Tẩy bớt vùng chọn nhầm"
            >
              <Eraser className="w-3.5 h-3.5 text-amber-400" />
              <span>Cục Tẩy</span>
            </button>
          </div>

          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <span>Cỡ:</span>
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
            title="Xóa toàn bộ vùng chọn đỏ đã vẽ"
          >
            Xóa nét vẽ
          </button>

          {canUndo && (
            <button
              onClick={onUndo}
              className="px-2.5 py-1 bg-indigo-950/60 border border-indigo-700/60 hover:bg-indigo-900 text-indigo-300 rounded-lg text-xs transition-all flex items-center space-x-1"
              title="Hoàn tác vết xóa trước (Ctrl + Z)"
            >
              <Undo2 className="w-3 h-3" />
              <span>Hoàn Tác</span>
            </button>
          )}

          <button
            onClick={handleApplyMaskInpaint}
            className="btn-primary"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
            title="Gửi vùng chọn tới mô hình LaMa Inpainting để khôi phục nét vẽ"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Xóa Nền Vùng Này (LaMa)</span>
          </button>
        </div>
      )}


      {/* Main Canvas Viewport or Empty State */}
      {imageLoadError ? (
        <div className="flex-1 w-full h-full flex flex-col items-center justify-center p-6 space-y-4 select-none">
          <div className="p-4 rounded-3xl bg-red-950/60 border border-red-800/60 text-red-400 shadow-xl shadow-red-950/40 animate-pulse">
            <AlertTriangle className="w-12 h-12" />
          </div>
          <div className="text-center space-y-1.5 max-w-sm">
            <h3 className="text-base font-bold text-white">Không thể giải mã trang truyện</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              File ảnh bị lỗi định dạng, hỏng cấu trúc hoặc đã bị giải phóng khỏi bộ nhớ RAM. Vui lòng thử nạp lại file từ thiết bị.
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary text-xs"
          >
            <ImagePlus className="w-4 h-4 mr-1.5" />
            <span>Nạp Lại Trang Khác</span>
          </button>
        </div>
      ) : rawImageUrl ? (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="flex-1 w-full h-full overflow-hidden relative"
          style={{
            cursor:
              spacePressed || isPanning
                ? isPanning
                  ? 'grabbing'
                  : 'grab'
                : activeTool === 'brush' || activeTool === 'add_bubble' || isDrawingNewBubble
                ? 'crosshair'
                : dynamicCursor !== 'default'
                ? dynamicCursor
                : 'default',
          }}
        >
          <div
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              width: imgDimensions.width,
              height: imgDimensions.height,
              willChange: 'transform',
            }}
            className="relative shadow-2xl select-none"
          >
            <canvas
              ref={canvasRef}
              className="rounded shadow-2xl border border-slate-800 bg-slate-900 block"
            />
            <canvas ref={maskCanvasRef} className="hidden" />

            {/* Floating Inline Text Editor on Double Click */}
            {(() => {
              const activeEditingBubble = bubbles.find((b) => b.id === editingBubbleId);
              if (!activeEditingBubble) return null;

              return (
                <div
                  style={{
                    position: 'absolute',
                    left: activeEditingBubble.x,
                    top: activeEditingBubble.y,
                    width: Math.max(160, activeEditingBubble.width),
                    minHeight: Math.max(80, activeEditingBubble.height),
                    zIndex: 100,
                  }}
                  className="bg-slate-900/95 border-2 border-indigo-500 rounded-xl p-2 shadow-2xl backdrop-blur-md flex flex-col gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-300 pb-1 border-b border-indigo-500/30 select-none">
                    <span>✏️ Sửa Chữ Nhanh (Enter để lưu)</span>
                    <button
                      onClick={() => setEditingBubbleId(null)}
                      className="text-slate-400 hover:text-white px-1 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    rows={3}
                    value={inlineEditText}
                    onChange={(e) => {
                      setInlineEditText(e.target.value);
                      onUpdateBubble({
                        ...activeEditingBubble,
                        translatedText: e.target.value,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        setEditingBubbleId(null);
                      } else if (e.key === 'Escape') {
                        setEditingBubbleId(null);
                      }
                    }}
                    placeholder="Nhập nội dung thoại dịch..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-xs font-sans focus:outline-none focus:border-indigo-400 resize-none"
                  />
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* Empty State Screen when no image is loaded */
        <div className="flex-1 flex items-center justify-center p-6 select-none">
          <div className="max-w-md w-full glass-panel border border-slate-800 p-8 rounded-3xl text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10">
              <ImagePlus className="w-10 h-10 animate-pulse" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg md:text-xl font-bold text-slate-100">
                Manga Studio AI - Workspace
              </h3>
              <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
                Chọn ảnh truyện từ Thư viện điện thoại hoặc kéo thả ảnh vào đây để bắt đầu dịch tự động và chỉnh sửa kiểu chữ.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                onClick={() => folderInputRef.current?.click()}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-xl shadow-purple-500/30 transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                <span>📁 Chọn Cả Thư Mục Ảnh (Chapter)</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-6 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                <ImagePlus className="w-4 h-4 text-indigo-400" />
                <span>📱 Chọn Nhiều Ảnh Lẻ Từ Thư Viện</span>
              </button>

              <div className="text-[11px] text-slate-500 flex items-center justify-center space-x-2 pt-1">
                <FileImage className="w-3.5 h-3.5 text-slate-400" />
                <span>Hỗ trợ JPG, PNG, WEBP, BMP (tự động sắp xếp trang số 1, 2, 3...)</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Mini-map Navigator HUD (Photoshop / Figma Standard) */}
      {rawImageUrl && (
        <div className="desktop-only absolute bottom-3 right-4 z-20 select-none">
          <div className="navigator-hud bg-slate-950/90 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl transition-all w-48">
            {/* Header */}
            <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-200 font-semibold">
              <div className="flex items-center space-x-1.5">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                <span>Bản Đồ</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="font-mono text-[10px] text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/40">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setIsMinimapCollapsed((prev) => !prev)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title={isMinimapCollapsed ? 'Mở rộng bản đồ' : 'Thu gọn bản đồ'}
                >
                  {isMinimapCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Mini-map Body */}
            {!isMinimapCollapsed && (
              <div className="p-2 space-y-2">
                <div className="relative rounded-lg overflow-hidden border border-slate-800/90 bg-slate-900 flex items-center justify-center">
                  <canvas
                    ref={minimapCanvasRef}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsMinimapDragging(true);
                      moveViewportFromMinimap(e.clientX, e.clientY);
                    }}
                    className="cursor-crosshair block w-full h-auto object-contain"
                    title="Kéo hoặc click để di chuyển vùng nhìn màn hình"
                  />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-400">
                  <button
                    onClick={handleFitScreen}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 hover:text-white border border-slate-800 transition-all flex items-center space-x-1"
                  >
                    <Maximize className="w-2.5 h-2.5 text-indigo-400" />
                    <span>Toàn Màn</span>
                  </button>
                  <button
                    onClick={() => setZoomPreset(1.0)}
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 hover:text-white border border-slate-800 transition-all font-mono"
                  >
                    100%
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Status Hint Bar */}
      {rawImageUrl && (
        <div className="desktop-only absolute bottom-3 left-4 z-20 items-center space-x-3 text-[11px] text-slate-400 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-800">
          <span>💡 <strong>Lăn chuột:</strong> Phóng to/thu nhỏ</span>
          <span>•</span>
          <span><strong>Space + Kéo chuột:</strong> Di chuyển ảnh</span>
          <span>•</span>
          <span><strong>Phím Delete:</strong> Xóa ô thoại</span>
        </div>
      )}
    </div>
  );
};
