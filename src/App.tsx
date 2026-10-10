import React, { useState, useEffect, useCallback } from 'react';
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
import { inpaintImageWithLaMa, translateBubbles, cleanPageWithAI } from './services/colabClient';
import { defaultTextStyle, renderBubbleOnCanvas } from './services/typesettingEngine';
import { triggerSelectionHaptic } from './services/haptics';

export const App: React.FC = () => {
  // Application Data States
  const [images, setImages] = useState<PageItem[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState<string>('');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [cleanedImageBase64, setCleanedImageBase64] = useState<string | null>(null);

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
    setIsProcessing(true);
    try {
      const sourceImg = cleanedImageBase64 || currentImage.rawUrl;
      const cleaned = await inpaintImageWithLaMa(colabConfig.serverUrl, sourceImg, maskBase64);
      if (cleaned && cleaned !== sourceImg) {
        pushHistory(cleaned, bubbles);
        setCleanedImageBase64(cleaned);
        if (selectedFilename) {
          await saveProjectMetadata(selectedFilename, bubbles, cleaned);
        }
      }
    } catch (e) {
      console.error('Manual inpaint failed:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Full page AI clean (ComicTextDetector + Dilation + LaMa FFC Inpainting)
  const handleAutoCleanPage = async () => {
    if (!currentImage) return;
    if (!colabConfig.serverUrl) {
      alert('Vui lòng kết nối Colab GPU trước khi dùng tính năng AI Làm Sạch Trang.');
      setIsColabModalOpen(true);
      return;
    }

    setIsCleaningPage(true);
    setProcessingStatus('Đang quét ký tự & khôi phục chi tiết bằng IOPaint...');
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
        const modelName = res.stats?.model ? ` (${res.stats.model})` : '';
        alert(`🎉 Đã làm sạch trang bằng IOPaint${modelName} thành công!\n• Số vùng chữ đã xóa & khôi phục: ${regions}`);
      } else {
        alert(`⚠️ Xử lý thất bại: ${res.error || 'Vui lòng kiểm tra lại Colab Server.'}`);
      }
    } catch (e: any) {
      alert(`❌ Lỗi kết nối AI: ${e?.message || e}`);
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top App Header */}
      <Header
        currentFilename={selectedFilename}
        colabConfig={colabConfig}
        outputFolderName={outputConfig.customFolderName}
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

      {/* Main Studio Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
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
          isColabConnected={colabConfig.connected}
          onOpenColabModal={() => setIsColabModalOpen(true)}
          onAddImages={handleAddImages}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onResetCleaned={handleResetCleaned}
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
        />
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        <button
          onClick={() => {
            triggerSelectionHaptic();
            setIsMobileSidebarOpen((prev) => !prev);
            setIsMobileInspectorOpen(false);
          }}
          className={`mobile-nav-btn ${isMobileSidebarOpen ? 'active' : ''}`}
        >
          <Images className="w-4 h-4 text-indigo-400" />
          <span>Trang ({images.length})</span>
        </button>

        <button
          onClick={() => {
            triggerSelectionHaptic();
            setIsColabModalOpen(true);
          }}
          className="mobile-nav-btn"
        >
          <Sparkles className={`w-4 h-4 ${colabConfig.connected ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span>{colabConfig.connected ? 'AI Sẵn Sàng' : 'Kết Nối AI'}</span>
        </button>

        <button
          onClick={() => {
            triggerSelectionHaptic();
            setIsMobileInspectorOpen((prev) => !prev);
            setIsMobileSidebarOpen(false);
          }}
          className={`mobile-nav-btn ${isMobileInspectorOpen ? 'active' : ''}`}
        >
          <Type className="w-4 h-4 text-purple-400" />
          <span>Ô Thoại ({bubbles.length})</span>
        </button>

        <button
          onClick={() => {
            triggerSelectionHaptic();
            handleExportCurrent();
          }}
          disabled={!selectedFilename || isProcessing}
          className="mobile-nav-btn primary"
        >
          <Download className="w-4 h-4 text-white" />
          <span>{isProcessing ? 'Đang xuất...' : 'Xuất Ảnh'}</span>
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
      />

      {/* Global Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

