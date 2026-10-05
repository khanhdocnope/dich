import React, { useState } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Layers, 
  FolderCheck,
  Sparkles,
  Download,
  FolderOpen,
  FileArchive
} from 'lucide-react';
import { PageItem, ColabConfig } from '../types';
import { exportImagesAsZip } from '../services/folderService';

interface BatchProcessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: PageItem[];
  colabConfig: ColabConfig;
  outputFolderName?: string;
  onProcessSinglePage: (filename: string) => Promise<boolean>;
  onBatchCompleted: () => void;
  onOpenOutputModal?: () => void;
}

export const BatchProcessorModal: React.FC<BatchProcessorModalProps> = ({
  isOpen,
  onClose,
  images,
  colabConfig,
  outputFolderName = 'MangaTranslator/Chapter_01',
  onProcessSinglePage,
  onBatchCompleted,
  onOpenOutputModal,
}) => {
  if (!isOpen) return null;


  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [logs, setLogs] = useState<Array<{ filename: string; status: 'pending' | 'success' | 'failed'; message: string }>>([]);

  const handleStartBatch = async () => {
    setIsRunning(true);
    setLogs(images.map((img) => ({ filename: img.filename, status: 'pending', message: 'Đang đợi...' })));

    let successCount = 0;

    for (let i = 0; i < images.length; i++) {
      if (!isRunning && i > 0 && !isRunning) {
        // Paused
        break;
      }

      const img = images[i];
      setCurrentIndex(i);

      setLogs((prev) =>
        prev.map((log, idx) =>
          idx === i ? { ...log, message: 'Đang kết xuất trang...' } : log
        )
      );

      try {
        const ok = await onProcessSinglePage(img.filename);
        if (ok) {
          successCount++;
          setLogs((prev) =>
            prev.map((log, idx) =>
              idx === i
                ? { ...log, status: 'success', message: 'Hoàn thành và đã lưu ảnh!' }
                : log
            )
          );
        } else {
          setLogs((prev) =>
            prev.map((log, idx) =>
              idx === i ? { ...log, status: 'failed', message: 'Lỗi xử lý trang này' } : log
            )
          );
        }
      } catch (err: any) {
        setLogs((prev) =>
          prev.map((log, idx) =>
            idx === i ? { ...log, status: 'failed', message: err.message || 'Lỗi không xác định' } : log
          )
        );
      }

      setProcessedCount(i + 1);
    }

    setIsRunning(false);
    onBatchCompleted();
  };

  const progressPercent = images.length > 0 ? Math.round((processedCount / images.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-2xl glass-panel rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">
                Xử Lý Hàng Loạt (Batch Auto-Translator)
              </h3>
              <p className="text-xs text-slate-400">
                Tự động dịch toàn bộ {images.length} trang từ <code className="text-slate-300">raw materials</code> ra <code className="text-indigo-400">test-case</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                Tiến độ: {processedCount} / {images.length} trang
              </span>
              <span className="font-mono font-bold text-indigo-400">{progressPercent}%</span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 shadow-lg shadow-indigo-500/30"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Engine Indicator */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
            <span className="text-slate-400">Chế độ dịch đang chọn:</span>
            <span className="font-semibold text-indigo-300">
              {colabConfig.engineMode === 'gemini'
                ? '⚡ AI Vision (Gemini)'
                : '🛡️ Uncensored (Manga-OCR + DeepL/Google)'}
            </span>
          </div>

          {/* Log Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 max-h-64 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="p-2.5">Trang</th>
                  <th className="p-2.5">Trạng thái</th>
                  <th className="p-2.5">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-slate-500">
                      Bấm "Bắt Đầu Chạy Hàng Loạt" để tự động xử lý tất cả các trang
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => (
                    <tr key={log.filename} className={idx === currentIndex && isRunning ? 'bg-indigo-950/30' : ''}>
                      <td className="p-2.5 font-medium text-slate-200">{log.filename}</td>
                      <td className="p-2.5">
                        {log.status === 'pending' ? (
                          idx === currentIndex && isRunning ? (
                            <span className="inline-flex items-center space-x-1 text-indigo-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang chạy</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">Chờ</span>
                          )
                        ) : log.status === 'success' ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Xong</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-red-400">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Lỗi</span>
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-400 truncate max-w-xs">{log.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <span>Lưu vào:</span>
            <span className="text-indigo-300 font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 truncate max-w-[200px]">
              {outputFolderName}
            </span>
            {onOpenOutputModal && (
              <button
                onClick={onOpenOutputModal}
                disabled={isRunning}
                className="p-1 hover:text-indigo-300 text-slate-400 rounded transition-colors"
                title="Thay đổi thư mục lưu"
              >
                <FolderCheck className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 justify-end">
            {processedCount > 0 && !isRunning && (
              <button
                onClick={() => exportImagesAsZip(images, `${outputFolderName.replace(/[\/\\:]/g, '_')}_Translated.zip`)}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 flex items-center space-x-1.5 transition-all"
                title="Tải toàn bộ kết quả về dạng file .ZIP"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>Tải .ZIP</span>
              </button>
            )}

            <button
              onClick={onClose}
              disabled={isRunning}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Đóng
            </button>
            <button
              onClick={handleStartBatch}
              disabled={isRunning || images.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-semibold btn-primary text-white flex items-center space-x-1.5 disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang xử lý ({processedCount}/{images.length})...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Bắt Đầu Chạy Hàng Loạt</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

