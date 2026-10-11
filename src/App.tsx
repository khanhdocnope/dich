import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Images, 
  Type, 
  Sparkles, 
  Download,
  ImagePlus
} from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BubbleInspector } from './components/BubbleInspector';
import { PanelSplitter } from './components/PanelSplitter';
import { ColabModal } from './components/ColabModal';
import { BatchProcessorModal } from './components/BatchProcessorModal';
import { OutputFolderModal } from './components/OutputFolderModal';
import { ToastContainer } from './components/Toast';
import { PageItem, Bubble, ColabConfig, EngineMode, OutputFolderConfig, ToastMessage } from './types';
import { 
  fetchImageList, 
  saveOutputImage, 
  saveProjectMetadata, 
  loadProjectMetadata,
  deleteStoredImage,
  clearAllStoredImages,
  importImagesFromFolderOrFiles
} from './services/api';
import { loadSavedColabConfig, saveStoredColabConfig, createSafeObjectURL, revokeSafeObjectURL, revokePageObjectUrls } from './services/storage';
import { inpaintImageWithLaMa, translateBubbles, cleanPageWithAI, detectTextRegions } from './services/colabClient';
import { defaultTextStyle, renderBubbleOnCanvas } from './services/typesettingEngine';
import { triggerSelectionHaptic } from './services/haptics';
import { UiLanguage, getSavedLanguage, saveLanguage, DICTIONARY } from './services/i18n';

export const App: React.FC = () => {
  // Application Data States
  const [images, setImages] = useState<PageItem[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [cleanedImageBase64, setCleanedImageBase64] = useState<string | null>(null);
  const [uiLang, setUiLang] = useState<UiLanguage>(() => getSavedLanguage());
  const t = DICTIONARY[uiLang];

  // Status & Progress States
  const [isLoadingImages, setIsLoadingImages] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCleaningPage, setIsCleaningPage] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Mobile Drawer States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState<boolean>(false);

  // Toast Notification System
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (type: ToastMessage['type'], message: string, title?: string, duration = 4000) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastMessage = { id, type, title, message, duration };
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Modals
  const [isColabModalOpen, setIsColabModalOpen] = useState<boolean>(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [isOutputModalOpen, setIsOutputModalOpen] = useState<boolean>(false);

  // Studio Proportional Layout States (Percentages & Resizing)
  const [layoutRatios, setLayoutRatios] = useState<{ left: number; right: number }>(() => {
    try {
      const saved = localStorage.getItem('manga_studio_layout_ratios');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          typeof parsed.left === 'number' &&
          typeof parsed.right === 'number' &&
          parsed.left >= 10 &&
          parsed.left <= 40 &&
          parsed.right >= 15 &&
          parsed.right <= 45
        ) {
          return parsed;
        }
      }
    } catch {}
    return { left: 19, right: 25 }; // Default: Sidebar 19%, Canvas 56%, Inspector 25%
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState<boolean>(false);
  const workspaceContainerRef = useRef<HTMLDivElement>(null);

  const updateLayoutRatios = useCallback((updater: (prev: { left: number; right: number }) => { left: number; right: number }) => {
    setLayoutRatios((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem('manga_studio_layout_ratios', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleResizeLeft = useCallback((deltaX: number) => {
    if (!workspaceContainerRef.current) return;
    const containerWidth = workspaceContainerRef.current.clientWidth;
    if (containerWidth <= 0) return;

    if (isSidebarCollapsed && deltaX > 5) {
      setIsSidebarCollapsed(false);
    }

    const deltaPercent = (deltaX / containerWidth) * 100;
    updateLayoutRatios((prev) => {
      const newLeft = Math.min(Math.max(prev.left + deltaPercent, 12), 35);
      return { ...prev, left: Math.round(newLeft * 10) / 10 };
    });
  }, [isSidebarCollapsed, updateLayoutRatios]);

  const handleResizeRight = useCallback((deltaX: number) => {
    if (!workspaceContainerRef.current) return;
    const containerWidth = workspaceContainerRef.current.clientWidth;
    if (containerWidth <= 0) return;

    if (isInspectorCollapsed && deltaX < -5) {
      setIsInspectorCollapsed(false);
    }

    const deltaPercent = (-deltaX / containerWidth) * 100;
    updateLayoutRatios((prev) => {
      const newRight = Math.min(Math.max(prev.right + deltaPercent, 16), 40);
      return { ...prev, right: Math.round(newRight * 10) / 10 };
    });
  }, [isInspectorCollapsed, updateLayoutRatios]);

  const handleResetRatios = useCallback(() => {
    updateLayoutRatios(() => ({ left: 19, right: 25 }));
  }, [updateLayoutRatios]);

  // Output Folder Config (persisted across sessions)
  const [outputConfig, setOutputConfig] = useState<OutputFolderConfig>(() => {
    try {
      const saved = localStorage.getItem('manga_studio_output_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      customFolderName: 'MangaTranslator/Chapter_01',
      autoDownloadSingle: true,
      directoryHandleName: null,
    };
  });

  const handleSaveOutputConfig = (newCfg: OutputFolderConfig) => {
    setOutputConfig(newCfg);
    try {
      localStorage.setItem('manga_studio_output_config', JSON.stringify(newCfg));
    } catch {}
  };


  // Colab & AI Config (persisted across sessions)
  const [colabConfig, setColabConfig] = useState<ColabConfig>(() => {
    const saved = loadSavedColabConfig();
    return (
      saved || {
        serverUrl: '',
        geminiApiKey: '',
        connected: false,
        engineMode: 'gemini',
        targetLang: 'vi',
      }
    );
  });

  // Persist ColabConfig changes
  const handleSaveColabConfig = (newConfig: ColabConfig) => {
    setColabConfig(newConfig);
    saveStoredColabConfig(newConfig);
  };

  // Load images list from IndexedDB / backend on mount
  const loadImages = useCallback(async () => {
    setIsLoadingImages(true);
    const res = await fetchImageList();
    setIsLoadingImages(false);
    if (res.success && res.images.length > 0) {
      setImages(res.images);
      if (!selectedFilename || !res.images.some((img) => img.filename === selectedFilename)) {
        setSelectedFilename(res.images[0].filename);
      }
    }
  }, [selectedFilename]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // Helper: Deep clone bubbles to guarantee immutable history snapshots
  const cloneBubbles = useCallback((list: Bubble[]): Bubble[] => {
    return list.map((b) => ({
      ...b,
      style: { ...b.style },
    }));
  }, []);

  // History Management for Undo / Redo (RAM Optimized with Blob URLs & Max 30 Steps Cap)
  const [history, setHistory] = useState<Array<{ cleanedImageBase64: string | null; bubbles: Bubble[] }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const MAX_HISTORY_STEPS = 30;

  const pushHistory = useCallback((newCleaned: string | null, newBubbles: Bubble[]) => {
    const safeCleaned = newCleaned ? createSafeObjectURL(newCleaned) : null;
    const clonedBubbles = cloneBubbles(newBubbles);

    setHistory((prev) => {
      const updated = prev.slice(0, historyIndex + 1);
      const nextList = [...updated, { cleanedImageBase64: safeCleaned, bubbles: clonedBubbles }];
      if (nextList.length > MAX_HISTORY_STEPS) {
        const removed = nextList.shift();
        if (removed?.cleanedImageBase64 && removed.cleanedImageBase64.startsWith('blob:')) {
          const stillUsed = nextList.some((item) => item.cleanedImageBase64 === removed.cleanedImageBase64);
          if (!stillUsed) revokeSafeObjectURL(removed.cleanedImageBase64);
        }
      }
      return nextList;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY_STEPS - 1));
  }, [cloneBubbles, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const target = history[nextIdx];
      setHistoryIndex(nextIdx);
      setCleanedImageBase64(target.cleanedImageBase64);
      setBubbles(cloneBubbles(target.bubbles));
      if (selectedFilename) {
        saveProjectMetadata(selectedFilename, target.bubbles, target.cleanedImageBase64 || undefined);
      }
    }
  }, [cloneBubbles, history, historyIndex, selectedFilename]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const target = history[nextIdx];
      setHistoryIndex(nextIdx);
      setCleanedImageBase64(target.cleanedImageBase64);
      setBubbles(cloneBubbles(target.bubbles));
      if (selectedFilename) {
        saveProjectMetadata(selectedFilename, target.bubbles, target.cleanedImageBase64 || undefined);
      }
    }
  }, [cloneBubbles, history, historyIndex, selectedFilename]);

  const handleCommitHistory = useCallback((customBubbles?: Bubble[]) => {
    const target = customBubbles || bubbles;
    pushHistory(cleanedImageBase64, target);
    if (selectedFilename) {
      saveProjectMetadata(selectedFilename, target, cleanedImageBase64 || undefined);
    }
  }, [bubbles, cleanedImageBase64, pushHistory, selectedFilename]);

  const handleAddBubbleAction = useCallback((newB: Bubble) => {
    setBubbles((prev) => {
      const next = [...prev, newB];
      pushHistory(cleanedImageBase64, next);
      if (selectedFilename) {
        saveProjectMetadata(selectedFilename, next, cleanedImageBase64 || undefined);
      }
      return next;
    });
    setSelectedBubbleId(newB.id);
  }, [cleanedImageBase64, pushHistory, selectedFilename]);

  const handleDeleteBubbleAction = useCallback((id: string) => {
    setBubbles((prev) => {
      const next = prev.filter((b) => b.id !== id);
      pushHistory(cleanedImageBase64, next);
      if (selectedFilename) {
        saveProjectMetadata(selectedFilename, next, cleanedImageBase64 || undefined);
      }
      return next;
    });
    setSelectedBubbleId((prev) => (prev === id ? null : prev));
  }, [cleanedImageBase64, pushHistory, selectedFilename]);

  const handleUpdateBubbleAction = useCallback((updated: Bubble, commitToHistory: boolean = false) => {
    setBubbles((prev) => {
      const next = prev.map((b) => (b.id === updated.id ? updated : b));
      if (commitToHistory) {
        pushHistory(cleanedImageBase64, next);
        if (selectedFilename) {
          saveProjectMetadata(selectedFilename, next, cleanedImageBase64 || undefined);
        }
      }
      return next;
    });
  }, [cleanedImageBase64, pushHistory, selectedFilename]);

  // Global Keyboard Shortcuts for Undo (Ctrl+Z) & Redo (Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      const activeEl = document.activeElement;
      const isTextInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          if (!isTextInput) {
            e.preventDefault();
            handleUndo();
          }
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        if (!isTextInput) {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleUndo, handleRedo]);

  const handleResetCleaned = useCallback(() => {
    if (window.confirm('Khôi phục lại tranh gốc ban đầu (xóa bỏ toàn bộ phần đã inpaint/xóa chữ)?')) {
      pushHistory(null, bubbles);
      setCleanedImageBase64(null);
      if (selectedFilename) {
        saveProjectMetadata(selectedFilename, bubbles, undefined);
      }
    }
  }, [bubbles, pushHistory, selectedFilename]);

  // Load metadata and image data whenever selectedFilename changes
  useEffect(() => {
    if (!selectedFilename) {
      setBubbles([]);
      setSelectedBubbleId(null);
      setCleanedImageBase64(null);
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }

    const loadPageData = async () => {
      const metadata = await loadProjectMetadata(selectedFilename);
      if (metadata && metadata.bubbles) {
        const loadedBubbles = metadata.bubbles;
        const loadedCleaned = metadata.cleanedImageBase64 || null;
        setBubbles(loadedBubbles);
        setCleanedImageBase64(loadedCleaned);
        setHistory([{ cleanedImageBase64: loadedCleaned, bubbles: loadedBubbles }]);
        setHistoryIndex(0);
        if (loadedBubbles.length > 0) {
          setSelectedBubbleId(loadedBubbles[0].id);
        } else {
          setSelectedBubbleId(null);
        }
      } else {
        setBubbles([]);
        setSelectedBubbleId(null);
        setCleanedImageBase64(null);
        setHistory([{ cleanedImageBase64: null, bubbles: [] }]);
        setHistoryIndex(0);
      }
    };

    loadPageData();
  }, [selectedFilename]);

  // Import images or whole directory from Gallery / File Picker / Folder Picker / Drag & Drop
  const handleAddImages = async (files: FileList | File[]) => {
    setIsLoadingImages(true);
    try {
      const { newItems, detectedFolderName } = await importImagesFromFolderOrFiles(files, images);
      if (detectedFolderName) {
        setCurrentFolderName(detectedFolderName);
        setOutputConfig((prev) => ({
          ...prev,
          customFolderName: `MangaTranslator/${detectedFolderName}`,
        }));
      }

      if (newItems.length > 0) {
        const updatedList = [...images, ...newItems];
        setImages(updatedList);
        if (!selectedFilename) {
          setSelectedFilename(newItems[0].filename);
        }
        showToast(
          'success',
          `Đã nạp thành công ${newItems.length} trang truyện với thumbnail tối ưu RAM.`,
          'Nhập Ảnh Thành Công'
        );
      } else {
        showToast('warning', 'Không tìm thấy file ảnh hợp lệ để nhập.', 'Thông Báo');
      }
    } catch (err: any) {
      console.error('Error importing images / folder:', err);
      showToast('error', err?.message || 'Không thể nạp ảnh. Vui lòng kiểm tra định dạng file.', 'Lỗi Nhập Ảnh');
    } finally {
      setIsLoadingImages(false);
    }
  };

  // Delete single image and revoke its Object URLs to immediately free RAM
  const handleDeleteImage = async (filename: string) => {
    try {
      const target = images.find((img) => img.filename === filename);
      if (target) {
        revokePageObjectUrls(target);
      }

      await deleteStoredImage(filename);
      const remaining = images.filter((img) => img.filename !== filename);
      setImages(remaining);

      if (selectedFilename === filename) {
        if (remaining.length > 0) {
          setSelectedFilename(remaining[0].filename);
        } else {
          setSelectedFilename(null);
          setBubbles([]);
          setSelectedBubbleId(null);
          setCleanedImageBase64(null);
        }
      }
      showToast('info', `Đã xóa trang "${filename}" và giải phóng bộ nhớ.`);
    } catch (err: any) {
      console.error('Delete image error:', err);
      showToast('error', 'Lỗi khi xóa trang ảnh.', 'Lỗi');
    }
  };

  // Clear all images and revoke all Object URLs
  const handleClearAllImages = async () => {
    try {
      images.forEach((img) => revokePageObjectUrls(img));
      await clearAllStoredImages();
      setImages([]);
      setSelectedFilename(null);
      setCurrentFolderName('');
      setBubbles([]);
      setSelectedBubbleId(null);
      setCleanedImageBase64(null);
      showToast('info', 'Đã dọn dẹp toàn bộ trang và giải phóng bộ nhớ RAM.', 'Dọn Dẹp Thành Công');
    } catch (err: any) {
      console.error('Clear all images error:', err);
      showToast('error', 'Lỗi khi xóa danh sách ảnh.', 'Lỗi');
    }
  };

  const currentImage = images.find((img) => img.filename === selectedFilename) || null;

  // Render complete image to Base64 (Clean background + Typeset Text)
  const renderCurrentPageToBase64 = useCallback(async (): Promise<string | null> => {
    if (!currentImage) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = cleanedImageBase64 || currentImage.rawUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);

        // Draw background
        ctx.drawImage(img, 0, 0);

        // Draw translated bubbles
        bubbles.forEach((b) => {
          renderBubbleOnCanvas(ctx, b);
        });

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => {
        showToast('error', `Không thể giải mã ảnh "${currentImage.filename}" để xuất.`, 'Lỗi Đọc Ảnh');
        resolve(null);
      };
    });
  }, [currentImage, cleanedImageBase64, bubbles, showToast]);

  // Export current page to device gallery / downloads & chosen folder
  const handleExportCurrent = async () => {
    if (!selectedFilename) return;

    const base64 = await renderCurrentPageToBase64();
    if (!base64) return;

    const targetFolder = outputConfig.customFolderName || 'MangaTranslator/Output';
    const result = await saveOutputImage(selectedFilename, base64, true, targetFolder);
    if (result.success) {
      await saveProjectMetadata(selectedFilename, bubbles, cleanedImageBase64 || undefined);
      // Update image item status
      setImages((prev) =>
        prev.map((img) =>
          img.filename === selectedFilename ? { ...img, status: 'done', outputUrl: base64 } : img
        )
      );
      showToast('success', `Đã xuất "${selectedFilename}" vào ${result.savedPath || targetFolder}`, 'Xuất Ảnh Hoàn Tất');
    } else {
      showToast('error', `Không thể lưu trang "${selectedFilename}". Vui lòng thử lại.`, 'Lỗi Xuất Ảnh');
    }
  };

  // Manual brush inpaint (if connected to an AI inpaint backend)
  const handleManualInpaintArea = async (maskBase64: string) => {
    if (!currentImage) return;
    if (!colabConfig.serverUrl) {
      showToast('error', 'Chưa kết nối Máy Chủ AI. Vui lòng bấm vào "Máy Chủ AI" trên đầu trang để nhập địa chỉ server.', 'Chưa Có Máy Chủ');
      setIsColabModalOpen(true);
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Đang gửi vùng nét vẽ và xóa nền bằng LaMa...');
    showToast('info', 'Đang gửi yêu cầu xóa vùng cọ vẽ tới máy chủ AI...', 'Đang Xử Lý');
    try {
      const sourceImg = cleanedImageBase64 || currentImage.rawUrl;
      const cleaned = await inpaintImageWithLaMa(colabConfig.serverUrl, sourceImg, maskBase64);
      if (cleaned && cleaned !== sourceImg) {
        pushHistory(cleaned, bubbles);
        setCleanedImageBase64(cleaned);
        if (selectedFilename) {
          await saveProjectMetadata(selectedFilename, bubbles, cleaned);
        }
        showToast('success', 'Đã xóa nền vùng cọ vẽ thành công!', 'Xóa Hoàn Tất');
      } else {
        showToast('error', 'Máy chủ không trả về kết quả xóa. Vui lòng kiểm tra lại URL máy chủ.', 'Lỗi Xóa Nền');
      }
    } catch (e: any) {
      console.error('Manual inpaint failed:', e);
      showToast('error', `Lỗi xóa nét vẽ: ${e?.message || e}`, 'Lỗi Kết Nối AI');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Full page AI clean (ComicTextDetector + Dilation + LaMa FFC Inpainting)
  const handleAutoCleanPage = async () => {
    if (!currentImage) return;
    if (!colabConfig.serverUrl) {
      showToast('error', 'Chưa kết nối Máy Chủ AI. Vui lòng bấm vào "Máy Chủ AI" trên đầu trang để nhập địa chỉ server.', 'Chưa Có Máy Chủ');
      setIsColabModalOpen(true);
      return;
    }

    setIsCleaningPage(true);
    setProcessingStatus('Đang gửi ảnh & quét sạch chữ bằng AI...');
    showToast('info', 'Đang quét ký tự và xóa chữ toàn trang trên server...', 'Đang Xử Lý');
    try {
      const sourceImg = currentImage.rawUrl;
      const res = await cleanPageWithAI(colabConfig.serverUrl, sourceImg, {
        dilationPx: 4,
        flatThreshold: 3.5,
      });

      if (res.success && res.cleanedImageBase64) {
        pushHistory(res.cleanedImageBase64, bubbles);
        setCleanedImageBase64(res.cleanedImageBase64);
        if (selectedFilename) {
          await saveProjectMetadata(selectedFilename, bubbles, res.cleanedImageBase64);
        }
        const regions = res.stats?.total_regions ?? (res.stats?.regions ?? (res.stats?.lama ?? 0));
        showToast('success', `Đã quét sạch chữ toàn trang bằng AI (${regions} vùng chữ)!`, 'Xóa Hoàn Tất');
      } else {
        showToast('error', `Xử lý thất bại: ${res.error || 'Vui lòng kiểm tra lại Colab Server.'}`, 'Lỗi Xóa Trang');
      }
    } catch (e: any) {
      showToast('error', `Lỗi kết nối AI: ${e?.message || e}`, 'Lỗi Kết Nối');
    } finally {
      setIsCleaningPage(false);
      setProcessingStatus('');
    }
  };

  // Batch process single page runner (Render & Export)
  const handleProcessSinglePageForBatch = async (filename: string): Promise<boolean> => {
    try {
      const page = images.find((img) => img.filename === filename);
      if (!page) return false;
      const metadata = await loadProjectMetadata(filename);
      const pageBubbles = metadata?.bubbles || [];
      const cleaned = metadata?.cleanedImageBase64 || null;

      // Render to final canvas
      const renderBase64 = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = cleaned || page.rawUrl;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          pageBubbles.forEach((b: Bubble) => {
            renderBubbleOnCanvas(ctx, b);
          });
          resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = () => resolve(null);
      });

      if (renderBase64) {
        const targetFolder = outputConfig.customFolderName || 'MangaTranslator/Output';
        await saveOutputImage(filename, renderBase64, true, targetFolder);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Batch process single page failed:', e);
      return false;
    }
  };


  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-graphite-base text-ink-paper antialiased select-none font-body-md">
      {/* Top App Header */}
      <Header
        currentFilename={selectedFilename}
        colabConfig={colabConfig}
        outputFolderName={outputConfig.customFolderName}
        uiLang={uiLang}
        onOpenColabModal={() => setIsColabModalOpen(true)}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
        onOpenOutputModal={() => setIsOutputModalOpen(true)}
        onExportCurrent={handleExportCurrent}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        isProcessing={isProcessing}
        processingStatus={processingStatus}
      />

      {/* Mobile Sub-Header Telemetry Bar (From Moji Mobile Viewport Spec) */}
      <div className="mobile-only w-full bg-graphite-base px-3 py-1 flex items-center justify-between border-b border-whisper z-30 text-[11px]">
        {/* AI Server & Gemini API Key Quick Settings Button */}
        <button
          onClick={() => {
            triggerSelectionHaptic();
            setIsColabModalOpen(true);
          }}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-high/80 border border-whisper hover:bg-graphite-subtle active:scale-95 transition-all text-left"
          title="Nhấp để nhập Link Google Colab / Hugging Face & Gemini API Key"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {colabConfig.connected ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </>
            ) : (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fbabfe] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#fbabfe]"></span>
              </>
            )}
          </span>
          <span className="font-mono text-ink-paper text-[10.5px] font-medium truncate max-w-[150px]">
            {colabConfig.connected ? (colabConfig.gpuName || 'GPU Cloud • 16ms') : '⚡ Cài Đặt AI & API Key'}
          </span>
          <span className="material-symbols-outlined text-primary text-[13px] shrink-0">tune</span>
        </button>

        {/* Page Indicator & Quick Undo/Redo */}
        <div className="flex items-center gap-2 text-[#8E8E93]">
          {selectedFilename && (
            <span className="font-mono text-[#F5F5F7] text-[10px] font-medium">
              {(() => {
                const idx = images.findIndex((img) => img.filename === selectedFilename);
                const curr = idx >= 0 ? (idx + 1 < 10 ? `0${idx + 1}` : idx + 1) : '01';
                const total = images.length < 10 ? `0${images.length}` : images.length;
                return `P.${curr}/${total}`;
              })()}
            </span>
          )}
          <div className="flex items-center border-l border-white/10 pl-1.5 gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-0.5 hover:text-[#F5F5F7] active:scale-95 disabled:opacity-30"
              title="Undo"
            >
              <span className="material-symbols-outlined text-[15px]">undo</span>
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-0.5 hover:text-[#F5F5F7] active:scale-95 disabled:opacity-30"
              title="Redo"
            >
              <span className="material-symbols-outlined text-[15px]">redo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Studio Workspace */}
      <div ref={workspaceContainerRef} className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop Overlay */}
        {(isMobileSidebarOpen || isMobileInspectorOpen) && (
          <div
            className="mobile-backdrop"
            onClick={() => {
              setIsMobileSidebarOpen(false);
              setIsMobileInspectorOpen(false);
            }}
          />
        )}

        {/* Left: Raw materials gallery */}
        <Sidebar
          images={images}
          selectedFilename={selectedFilename}
          currentFolderName={currentFolderName}
          onSelectImage={(filename) => {
            setSelectedFilename(filename);
            setSelectedBubbleId(null);
          }}
          onRefreshList={loadImages}
          onAddImages={handleAddImages}
          onDeleteImage={handleDeleteImage}
          onClearAllImages={handleClearAllImages}
          onOpenOutputModal={() => setIsOutputModalOpen(true)}
          isLoading={isLoadingImages}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          width={`${layoutRatios.left}%`}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={setIsSidebarCollapsed}
          uiLang={uiLang}
        />

        {/* Left Splitter */}
        <PanelSplitter
          direction="left"
          onResize={handleResizeLeft}
          onDoubleClick={handleResetRatios}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          title="Kéo để chỉnh độ rộng Thư viện ảnh (Nhấp đúp để đặt lại 19%)"
        />

        {/* Center: Canvas Editor */}
        <CanvasEditor
          rawImageUrl={currentImage?.rawUrl || null}
          cleanedImageBase64={cleanedImageBase64}
          bubbles={bubbles}
          selectedBubbleId={selectedBubbleId}
          onSelectBubble={setSelectedBubbleId}
          onUpdateBubble={handleUpdateBubbleAction}
          onAddBubble={handleAddBubbleAction}
          onDeleteBubble={handleDeleteBubbleAction}
          onCommitHistory={handleCommitHistory}
          onManualInpaintArea={handleManualInpaintArea}
          onAutoCleanPage={handleAutoCleanPage}
          isCleaningPage={isCleaningPage}
          isProcessing={isProcessing}
          isColabConnected={colabConfig.connected}
          onOpenColabModal={() => setIsColabModalOpen(true)}
          onAddImages={handleAddImages}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onResetCleaned={handleResetCleaned}
        />

        {/* Right Splitter */}
        <PanelSplitter
          direction="right"
          onResize={handleResizeRight}
          onDoubleClick={handleResetRatios}
          isCollapsed={isInspectorCollapsed}
          onToggleCollapse={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
          title="Kéo để chỉnh độ rộng Bảng thuộc tính (Nhấp đúp để đặt lại 25%)"
        />

        {/* Right: Bubble Property Inspector */}
        <BubbleInspector
          bubbles={bubbles}
          selectedBubbleId={selectedBubbleId}
          onSelectBubble={setSelectedBubbleId}
          onUpdateBubble={handleUpdateBubbleAction}
          onDeleteBubble={handleDeleteBubbleAction}
          onCommitHistory={handleCommitHistory}
          onAddBubble={() => {
            const newB: Bubble = {
              id: `bubble_${Date.now()}`,
              x: 140,
              y: 200,
              width: 180,
              height: 90,
              originalText: '',
              translatedText: 'Nhập chữ dịch...',
              style: { ...defaultTextStyle },
              isInpainted: false,
            };
            handleAddBubbleAction(newB);
          }}
          onReTranslateBubble={async (bubble) => {
            const res = await translateBubbles(colabConfig, [bubble]);
            if (res.length > 0) {
              const updatedBubble = { ...bubble, translatedText: res[0].translatedText };
              handleUpdateBubbleAction(updatedBubble, true);
            }
          }}
          isOpenMobile={isMobileInspectorOpen}
          onCloseMobile={() => setIsMobileInspectorOpen(false)}
          width={`${layoutRatios.right}%`}
          isCollapsed={isInspectorCollapsed}
          onToggleCollapse={setIsInspectorCollapsed}
          uiLang={uiLang}
        />
      </div>

      {/* Mobile Bottom Navigation Bar (Serene Bento Glass Mobile) */}
      <nav className="mobile-bottom-nav mobile-only">
        <button
          onClick={() => {
            triggerSelectionHaptic();
            setIsMobileSidebarOpen((prev) => !prev);
            setIsMobileInspectorOpen(false);
          }}
          className={`mobile-nav-btn ${isMobileSidebarOpen ? 'active' : ''}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>photo_library</span>
          <span>{t.pagesCount} ({images.length})</span>
        </button>

        <button
          onClick={() => {
            triggerSelectionHaptic();
            setIsColabModalOpen(true);
          }}
          className={`mobile-nav-btn ${colabConfig.connected ? 'active' : ''}`}
          title="Cài đặt đường dẫn Google Colab & API Key"
        >
          <span 
            className="material-symbols-outlined" 
            style={{ 
              fontSize: '20px', 
              color: colabConfig.connected ? '#34d399' : '#fbabfe' 
            }}
          >
            {colabConfig.connected ? 'smart_toy' : 'tune'}
          </span>
          <span>{colabConfig.connected ? t.aiOnline : t.linkAiKey}</span>
        </button>

        <button
          onClick={() => {
            triggerSelectionHaptic();
            setIsMobileInspectorOpen((prev) => !prev);
            setIsMobileSidebarOpen(false);
          }}
          className={`mobile-nav-btn ${isMobileInspectorOpen ? 'active' : ''}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>chat_bubble</span>
          <span>{t.bubblesCountLabel} ({bubbles.length})</span>
        </button>

        <button
          onClick={() => {
            triggerSelectionHaptic();
            handleExportCurrent();
          }}
          disabled={!selectedFilename || isProcessing}
          className="mobile-nav-btn primary"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>ios_share</span>
          <span>{isProcessing ? t.exporting : (uiLang === 'en' ? 'Export' : 'Xuất')}</span>
        </button>
      </nav>

      {/* Colab Configuration Modal */}
      <ColabModal
        isOpen={isColabModalOpen}
        onClose={() => setIsColabModalOpen(false)}
        config={colabConfig}
        onSaveConfig={handleSaveColabConfig}
      />

      {/* Batch Processing Modal */}
      <BatchProcessorModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        images={images}
        colabConfig={colabConfig}
        outputFolderName={outputConfig.customFolderName}
        onProcessSinglePage={handleProcessSinglePageForBatch}
        onBatchCompleted={loadImages}
        onOpenOutputModal={() => setIsOutputModalOpen(true)}
      />

      {/* Output Folder Settings & ZIP Export Modal */}
      <OutputFolderModal
        isOpen={isOutputModalOpen}
        onClose={() => setIsOutputModalOpen(false)}
        images={images}
        outputConfig={outputConfig}
        onSaveConfig={handleSaveOutputConfig}
        uiLang={uiLang}
        onChangeUiLang={(lang) => {
          setUiLang(lang);
          saveLanguage(lang);
        }}
      />

      {/* Global Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

