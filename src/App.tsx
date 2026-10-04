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
import { PageItem, Bubble, ColabConfig, EngineMode, OutputFolderConfig } from './types';
import { 
  fetchImageList, 
  saveOutputImage, 
  saveProjectMetadata, 
  loadProjectMetadata,
  deleteStoredImage,
  clearAllStoredImages,
  importImagesFromFolderOrFiles
} from './services/api';
import { loadSavedColabConfig, saveStoredColabConfig, createSafeObjectURL, revokeSafeObjectURL } from './services/storage';
import { 
  inpaintImageWithLaMa, 
  ocrBubbles, 
  translateBubbles,
  detectAndTranslatePageAuto
} from './services/colabClient';
import { defaultTextStyle, renderBubbleOnCanvas } from './services/typesettingEngine';

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
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Mobile Drawer States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState<boolean>(false);

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

  // History Management for Undo / Redo (RAM Optimized with Blob URLs & Max Cap)
  const [history, setHistory] = useState<Array<{ cleanedImageBase64: string | null; bubbles: Bubble[] }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const MAX_HISTORY_STEPS = 20;

  const pushHistory = useCallback((newCleaned: string | null, newBubbles: Bubble[]) => {
    const safeCleaned = newCleaned ? createSafeObjectURL(newCleaned) : null;
    setHistory((prev) => {
      const updated = prev.slice(0, historyIndex + 1);
      const nextList = [...updated, { cleanedImageBase64: safeCleaned, bubbles: newBubbles }];
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
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      const target = history[nextIdx];
      setHistoryIndex(nextIdx);
      setCleanedImageBase64(target.cleanedImageBase64);
      setBubbles(target.bubbles);
      if (selectedFilename) {
        saveProjectMetadata(selectedFilename, target.bubbles, target.cleanedImageBase64 || undefined);
      }
    }
  }, [history, historyIndex, selectedFilename]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      const target = history[nextIdx];
      setHistoryIndex(nextIdx);
      setCleanedImageBase64(target.cleanedImageBase64);
      setBubbles(target.bubbles);
      if (selectedFilename) {
        saveProjectMetadata(selectedFilename, target.bubbles, target.cleanedImageBase64 || undefined);
      }
    }
  }, [history, historyIndex, selectedFilename]);

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
      }
    } catch (err) {
      console.error('Error importing images / folder:', err);
      alert('Không thể nhập ảnh hoặc thư mục. Vui lòng thử lại.');
    } finally {
      setIsLoadingImages(false);
    }
  };

  // Delete single image
  const handleDeleteImage = async (filename: string) => {
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
  };

  // Clear all images
  const handleClearAllImages = async () => {
    await clearAllStoredImages();
    setImages([]);
    setSelectedFilename(null);
    setCurrentFolderName('');
    setBubbles([]);
    setSelectedBubbleId(null);
    setCleanedImageBase64(null);
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

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
    });
  }, [currentImage, cleanedImageBase64, bubbles]);

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
      alert(`🎉 Đã xuất thành công "${selectedFilename}"!\n📂 Vị trí: ${result.savedPath || targetFolder}`);
    } else {
      alert(`⚠️ Không thể lưu trang "${selectedFilename}". Vui lòng thử lại.`);
    }
  };

  // 1. Action: AI LaMa Manga inpainting ONLY (Xóa chữ tái tạo nền)
  const handleRunAutoCleanOnly = async () => {
    if (!selectedFilename || !currentImage) return;

    setIsProcessing(true);
    setProcessingStatus('🧼 Đang xóa chữ & tái tạo nền bằng LaMa...');
    try {
      let targetBubbles = bubbles;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res) => {
        img.onload = res;
        img.src = currentImage.rawUrl;
      });

      // If no bubbles exist yet, auto detect them first
      if (targetBubbles.length === 0) {
        setProcessingStatus('🔍 Đang tự động tìm vị trí chữ trên trang...');
        targetBubbles = await detectAndTranslatePageAuto(colabConfig, currentImage.rawUrl, img.width, img.height);
        setBubbles(targetBubbles);
      }

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = img.width;
      maskCanvas.height = img.height;
      const mctx = maskCanvas.getContext('2d');
      if (mctx) {
        mctx.fillStyle = '#000000';
        mctx.fillRect(0, 0, img.width, img.height);
        mctx.fillStyle = '#ffffff';
        targetBubbles.forEach((b) => {
          mctx.beginPath();
          mctx.roundRect(b.x, b.y, b.width, b.height, 8);
          mctx.fill();
        });
      }

      setProcessingStatus('🧼 Đang chạy mô hình LaMa tái tạo nét vẽ...');
      const maskBase64 = maskCanvas.toDataURL('image/png');
      const sourceImg = cleanedImageBase64 || currentImage.rawUrl;
      const cleaned = await inpaintImageWithLaMa(colabConfig.serverUrl, sourceImg, maskBase64);

      if (cleaned && cleaned !== sourceImg) {
        pushHistory(cleaned, targetBubbles);
        setCleanedImageBase64(cleaned);
        await saveProjectMetadata(selectedFilename, targetBubbles, cleaned);
      }
    } catch (e) {
      console.error('Auto clean failed:', e);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 2. Action: Translate ONLY (Dịch văn bản bằng Gemini / Manga-OCR)
  const handleRunTranslateOnly = async () => {
    if (!selectedFilename || !currentImage) return;

    setIsProcessing(true);
    setProcessingStatus('🔍 Đang nhận diện & dịch câu thoại...');
    try {
      let targetBubbles = bubbles;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res) => {
        img.onload = res;
        img.src = currentImage.rawUrl;
      });

      if (targetBubbles.length === 0) {
        setProcessingStatus('🔍 Đang tự động quét ô thoại & dịch sang tiếng Việt...');
        targetBubbles = await detectAndTranslatePageAuto(colabConfig, currentImage.rawUrl, img.width, img.height);
      } else {
        setProcessingStatus('🌐 Đang dịch nội dung sang tiếng Việt...');
        const ocrResultBubbles = await ocrBubbles(colabConfig, currentImage.rawUrl, targetBubbles);
        targetBubbles = await translateBubbles(colabConfig, ocrResultBubbles);
      }

      pushHistory(cleanedImageBase64, targetBubbles);
      setBubbles(targetBubbles);
      await saveProjectMetadata(selectedFilename, targetBubbles, cleanedImageBase64 || undefined);
    } catch (e) {
      console.error('Translation failed:', e);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 3. Action: ⚡ TRUE 1-CLICK AUTO TRANSLATE (Auto Detect + LaMa Inpaint + Translate)
  const handleRunAutoCleanAndTranslate = async () => {
    if (!selectedFilename || !currentImage) return;

    setIsProcessing(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res) => {
        img.onload = res;
        img.src = currentImage.rawUrl;
      });

      let targetBubbles = bubbles;

      // Step 1: Auto-detect bubbles if user hasn't drawn any
      if (targetBubbles.length === 0) {
        setProcessingStatus('🔍 [1/3] Đang tự động nhận diện các ô thoại trên trang...');
        targetBubbles = await detectAndTranslatePageAuto(colabConfig, currentImage.rawUrl, img.width, img.height);
        if (targetBubbles.length > 0) {
          setBubbles(targetBubbles);
        } else {
          setIsProcessing(false);
          setProcessingStatus('');
          alert('💡 Chưa phát hiện được ô thoại tự động!\n👉 Bạn có thể dùng chuột kéo vẽ trực tiếp trên tranh để tạo ô thoại (hoặc kết nối Colab GPU / nhập Gemini API Key để AI đọc ảnh).');
          return;
        }
      }

      // Step 2: LaMa Inpainting
      let cleaned = cleanedImageBase64;
      if (targetBubbles.length > 0) {
        setProcessingStatus('🧼 [2/3] Đang dùng LaMa xóa chữ & tái tạo nền tranh...');
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;
        const mctx = maskCanvas.getContext('2d');
        if (mctx) {
          mctx.fillStyle = '#000000';
          mctx.fillRect(0, 0, img.width, img.height);
          mctx.fillStyle = '#ffffff';
          targetBubbles.forEach((b) => {
            mctx.beginPath();
            mctx.roundRect(b.x, b.y, b.width, b.height, 8);
            mctx.fill();
          });
        }

        const maskBase64 = maskCanvas.toDataURL('image/png');
        const sourceImg = cleanedImageBase64 || currentImage.rawUrl;
        cleaned = await inpaintImageWithLaMa(colabConfig.serverUrl, sourceImg, maskBase64);
        if (cleaned && cleaned !== sourceImg) {
          setCleanedImageBase64(cleaned);
        }
      }

      // Step 3: OCR & Translation refinement if needed
      setProcessingStatus('✍️ [3/3] Đang hoàn thiện bản dịch tiếng Việt...');
      const ocrResultBubbles = await ocrBubbles(colabConfig, currentImage.rawUrl, targetBubbles);
      const translatedResultBubbles = await translateBubbles(colabConfig, ocrResultBubbles);

      pushHistory(cleaned || null, translatedResultBubbles);
      setBubbles(translatedResultBubbles);
      await saveProjectMetadata(selectedFilename, translatedResultBubbles, cleaned || undefined);
    } catch (e) {
      console.error('Auto clean and translate failed:', e);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Manual brush inpaint with LaMa Manga
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

  // Batch process single page runner
  const handleProcessSinglePageForBatch = async (filename: string): Promise<boolean> => {
    try {
      const page = images.find((img) => img.filename === filename);
      if (!page) return false;
      const metadata = await loadProjectMetadata(filename);
      const pageBubbles = metadata?.bubbles || [];
      let cleaned = metadata?.cleanedImageBase64 || null;

      if (pageBubbles.length > 0 && colabConfig.serverUrl) {
        const maskCanvas = document.createElement('canvas');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((res) => {
          img.onload = res;
          img.src = page.rawUrl;
        });
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;
        const mctx = maskCanvas.getContext('2d');
        if (mctx) {
          mctx.fillStyle = '#000000';
          mctx.fillRect(0, 0, img.width, img.height);
          mctx.fillStyle = '#ffffff';
          pageBubbles.forEach((b: Bubble) => {
            mctx.beginPath();
            mctx.roundRect(b.x, b.y, b.width, b.height, 8);
            mctx.fill();
          });
        }
        const maskBase64 = maskCanvas.toDataURL('image/png');
        const inpaintRes = await inpaintImageWithLaMa(colabConfig.serverUrl, page.rawUrl, maskBase64);
        if (inpaintRes && inpaintRes !== page.rawUrl) {
          cleaned = inpaintRes;
        }
      }

      let translatedResult = pageBubbles;
      if (pageBubbles.length > 0) {
        const ocrResult = await ocrBubbles(colabConfig, page.rawUrl, pageBubbles);
        translatedResult = await translateBubbles(colabConfig, ocrResult);
      }

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
          translatedResult.forEach((b: Bubble) => {
            renderBubbleOnCanvas(ctx, b);
          });
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
      });

      if (renderBase64) {
        const targetFolder = outputConfig.customFolderName || 'MangaTranslator/Output';
        await saveOutputImage(filename, renderBase64, true, targetFolder);
        await saveProjectMetadata(filename, translatedResult, cleaned || undefined);
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
        onRunAutoCleanOnly={handleRunAutoCleanOnly}
        onRunTranslateOnly={handleRunTranslateOnly}
        onRunAutoCleanAndTranslate={handleRunAutoCleanAndTranslate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        isProcessing={isProcessing}
        processingStatus={processingStatus}
        onEngineChange={(mode: EngineMode) =>
          handleSaveColabConfig({ ...colabConfig, engineMode: mode })
        }
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
          onUpdateBubble={(updated) =>
            setBubbles((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
          }
          onAddBubble={(newB) => {
            setBubbles((prev) => [...prev, newB]);
            setSelectedBubbleId(newB.id);
          }}
          onDeleteBubble={(id) => {
            setBubbles((prev) => prev.filter((b) => b.id !== id));
            if (selectedBubbleId === id) setSelectedBubbleId(null);
          }}
          onManualInpaintArea={handleManualInpaintArea}
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
          onUpdateBubble={(updated) =>
            setBubbles((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
          }
          onDeleteBubble={(id) => {
            setBubbles((prev) => prev.filter((b) => b.id !== id));
            if (selectedBubbleId === id) setSelectedBubbleId(null);
          }}
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
            setBubbles((prev) => [...prev, newB]);
            setSelectedBubbleId(newB.id);
          }}
          onReTranslateBubble={async (bubble) => {
            const res = await translateBubbles(colabConfig, [bubble]);
            if (res.length > 0) {
              setBubbles((prev) =>
                prev.map((b) => (b.id === bubble.id ? { ...b, translatedText: res[0].translatedText } : b))
              );
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
            setIsMobileSidebarOpen((prev) => !prev);
            setIsMobileInspectorOpen(false);
          }}
          className={`mobile-nav-btn ${isMobileSidebarOpen ? 'active' : ''}`}
        >
          <Images className="w-4 h-4 text-indigo-400" />
          <span>Trang ({images.length})</span>
        </button>

        <button
          onClick={handleRunAutoCleanAndTranslate}
          disabled={!selectedFilename || isProcessing}
          className="mobile-nav-btn primary"
        >
          <Sparkles className="w-4 h-4 text-yellow-300" />
          <span>{isProcessing ? 'Đang dịch...' : 'Dịch AI'}</span>
        </button>

        <button
          onClick={() => {
            setIsMobileInspectorOpen((prev) => !prev);
            setIsMobileSidebarOpen(false);
          }}
          className={`mobile-nav-btn ${isMobileInspectorOpen ? 'active' : ''}`}
        >
          <Type className="w-4 h-4 text-emerald-400" />
          <span>Công Cụ ({bubbles.length})</span>
        </button>

        <button
          onClick={handleExportCurrent}
          disabled={!selectedFilename}
          className="mobile-nav-btn"
        >
          <Download className="w-4 h-4 text-slate-300" />
          <span>Xuất Ảnh</span>
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
    </div>
  );
};

