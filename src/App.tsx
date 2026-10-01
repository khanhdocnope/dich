import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CanvasEditor } from './components/CanvasEditor';
import { BubbleInspector } from './components/BubbleInspector';
import { ColabModal } from './components/ColabModal';
import { BatchProcessorModal } from './components/BatchProcessorModal';
import { PageItem, Bubble, ColabConfig, EngineMode } from './types';
import { 
  fetchImageList, 
  saveOutputImage, 
  saveProjectMetadata, 
  loadProjectMetadata 
} from './services/api';
import { 
  inpaintImageWithLaMa, 
  ocrBubbles, 
  translateBubbles 
} from './services/colabClient';
import { defaultTextStyle, renderBubbleOnCanvas } from './services/typesettingEngine';

export const App: React.FC = () => {
  // Application Data States
  const [images, setImages] = useState<PageItem[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const [cleanedImageBase64, setCleanedImageBase64] = useState<string | null>(null);

  // Status & Progress States
  const [isLoadingImages, setIsLoadingImages] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Modals
  const [isColabModalOpen, setIsColabModalOpen] = useState<boolean>(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);

  // Colab & AI Config
  const [colabConfig, setColabConfig] = useState<ColabConfig>({
    serverUrl: '',
    geminiApiKey: '',
    connected: false,
    engineMode: 'gemini',
    targetLang: 'vi',
  });

  // Load images list from local backend on mount
  const loadImages = useCallback(async () => {
    setIsLoadingImages(true);
    const res = await fetchImageList();
    setIsLoadingImages(false);
    if (res.success && res.images.length > 0) {
      setImages(res.images);
      if (!selectedFilename) {
        setSelectedFilename(res.images[0].filename);
      }
    }
  }, [selectedFilename]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // Load metadata and image data whenever selectedFilename changes
  useEffect(() => {
    if (!selectedFilename) return;

    const loadPageData = async () => {
      const metadata = await loadProjectMetadata(selectedFilename);
      if (metadata && metadata.bubbles) {
        setBubbles(metadata.bubbles);
        setCleanedImageBase64(metadata.cleanedImageBase64 || null);
        if (metadata.bubbles.length > 0) {
          setSelectedBubbleId(metadata.bubbles[0].id);
        } else {
          setSelectedBubbleId(null);
        }
      } else {
        // Initialize default sample bubble for convenient instant editing
        const initialBubble: Bubble = {
          id: `bubble_${Date.now()}`,
          x: 120,
          y: 180,
          width: 220,
          height: 120,
          originalText: 'これは何ですか！？',
          translatedText: 'Cái quái gì thế này!?',
          style: { ...defaultTextStyle },
          isInpainted: false,
        };
        setBubbles([initialBubble]);
        setSelectedBubbleId(initialBubble.id);
        setCleanedImageBase64(null);
      }
    };

    loadPageData();
  }, [selectedFilename]);

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

  // Export current page to test-case directory
  const handleExportCurrent = async () => {
    if (!selectedFilename) return;

    const base64 = await renderCurrentPageToBase64();
    if (!base64) return;

    const success = await saveOutputImage(selectedFilename, base64);
    if (success) {
      await saveProjectMetadata(selectedFilename, bubbles, cleanedImageBase64 || undefined);
      // Update image item status
      setImages((prev) =>
        prev.map((img) =>
          img.filename === selectedFilename ? { ...img, status: 'done' } : img
        )
      );
      alert(`🎉 Đã xuất thành công trang "${selectedFilename}" vào thư mục d:\\dich\\test-case!`);
    } else {
      alert(`⚠️ Không thể lưu trang "${selectedFilename}". Vui lòng thử lại.`);
    }
  };

  // Run full Auto Clean (LaMa) + OCR + Translation for current page
  const handleRunAutoCleanAndTranslate = async () => {
    if (!selectedFilename || !currentImage) return;

    setIsProcessing(true);
    try {
      // 1. Generate text mask for bubbles to inpaint with LaMa
      const maskCanvas = document.createElement('canvas');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res) => {
        img.onload = res;
        img.src = currentImage.rawUrl;
      });

      maskCanvas.width = img.width;
      maskCanvas.height = img.height;
      const mctx = maskCanvas.getContext('2d');
      if (mctx) {
        mctx.fillStyle = '#000000';
        mctx.fillRect(0, 0, img.width, img.height);
        mctx.fillStyle = '#ffffff';
        bubbles.forEach((b) => {
          mctx.beginPath();
          mctx.roundRect(b.x, b.y, b.width, b.height, 8);
          mctx.fill();
        });
      }

      const maskBase64 = maskCanvas.toDataURL('image/png');

      // 2. Call LaMa Inpainting
      const cleaned = await inpaintImageWithLaMa(
        colabConfig.serverUrl,
        currentImage.rawUrl,
        maskBase64
      );
      setCleanedImageBase64(cleaned);

      // 3. Call OCR
      const ocrResultBubbles = await ocrBubbles(colabConfig, currentImage.rawUrl, bubbles);

      // 4. Call Translation (Vision AI or Uncensored Manga-OCR + DeepL/Google)
      const translatedResultBubbles = await translateBubbles(colabConfig, ocrResultBubbles);

      setBubbles(translatedResultBubbles);
      await saveProjectMetadata(selectedFilename, translatedResultBubbles, cleaned);
    } catch (e) {
      console.error('Auto clean and translate failed:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Process a single page (used by Batch Processor)
  const handleProcessSinglePageForBatch = async (filename: string): Promise<boolean> => {
    try {
      const imgItem = images.find((i) => i.filename === filename);
      if (!imgItem) return false;

      // Check if project metadata already exists
      const existingMeta = await loadProjectMetadata(filename);
      let pageBubbles = existingMeta?.bubbles || [
        {
          id: `bubble_batch_${Date.now()}`,
          x: 100,
          y: 150,
          width: 240,
          height: 120,
          originalText: 'これは何ですか！？',
          translatedText: 'Cái quái gì thế này!?',
          style: { ...defaultTextStyle },
          isInpainted: false,
        },
      ];

      // Clean with LaMa
      const maskCanvas = document.createElement('canvas');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res) => {
        img.onload = res;
        img.src = imgItem.rawUrl;
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
      const cleaned = await inpaintImageWithLaMa(colabConfig.serverUrl, imgItem.rawUrl, maskBase64);

      // OCR & Translate
      const ocred = await ocrBubbles(colabConfig, imgItem.rawUrl, pageBubbles);
      const translated = await translateBubbles(colabConfig, ocred);

      // Render to image
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = img.width;
      renderCanvas.height = img.height;
      const rctx = renderCanvas.getContext('2d');
      if (!rctx) return false;

      const cleanImg = new Image();
      cleanImg.crossOrigin = 'anonymous';
      await new Promise((res) => {
        cleanImg.onload = res;
        cleanImg.src = cleaned;
      });

      rctx.drawImage(cleanImg, 0, 0);
      translated.forEach((b: Bubble) => {
        renderBubbleOnCanvas(rctx, b);
      });

      const finalBase64 = renderCanvas.toDataURL('image/png');

      // Save to test-case
      const ok = await saveOutputImage(filename, finalBase64);
      if (ok) {
        await saveProjectMetadata(filename, translated, cleaned);
      }
      return ok;
    } catch (e) {
      console.error(`Failed batch page ${filename}:`, e);
      return false;
    }
  };

  // Manual brush inpaint
  const handleManualInpaintArea = async (maskBase64: string) => {
    if (!currentImage) return;
    setIsProcessing(true);
    const sourceImg = cleanedImageBase64 || currentImage.rawUrl;
    const cleaned = await inpaintImageWithLaMa(colabConfig.serverUrl, sourceImg, maskBase64);
    setCleanedImageBase64(cleaned);
    setIsProcessing(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top App Header */}
      <Header
        currentFilename={selectedFilename}
        colabConfig={colabConfig}
        onOpenColabModal={() => setIsColabModalOpen(true)}
        onOpenBatchModal={() => setIsBatchModalOpen(true)}
        onExportCurrent={handleExportCurrent}
        onRunAutoCleanAndTranslate={handleRunAutoCleanAndTranslate}
        isProcessing={isProcessing}
        onEngineChange={(mode: EngineMode) => setColabConfig((prev) => ({ ...prev, engineMode: mode }))}
      />

      {/* Main Studio Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Raw materials gallery */}
        <Sidebar
          images={images}
          selectedFilename={selectedFilename}
          onSelectImage={(filename) => {
            setSelectedFilename(filename);
            setSelectedBubbleId(null);
          }}
          onRefreshList={loadImages}
          isLoading={isLoadingImages}
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
        />
      </div>

      {/* Colab Configuration Modal */}
      <ColabModal
        isOpen={isColabModalOpen}
        onClose={() => setIsColabModalOpen(false)}
        config={colabConfig}
        onSaveConfig={setColabConfig}
      />

      {/* Batch Processing Modal */}
      <BatchProcessorModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        images={images}
        colabConfig={colabConfig}
        onProcessSinglePage={handleProcessSinglePageForBatch}
        onBatchCompleted={loadImages}
      />
    </div>
  );
};
