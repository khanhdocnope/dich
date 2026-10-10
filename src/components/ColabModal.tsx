import React, { useState } from 'react';
import { 
  X, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Copy, 
  Key, 
  Cpu, 
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { ColabConfig } from '../types';
import { checkColabHealth } from '../services/colabClient';

interface ColabModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ColabConfig;
  onSaveConfig: (config: ColabConfig) => void;
}

export const ColabModal: React.FC<ColabModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
}) => {
  if (!isOpen) return null;

  const [serverUrl, setServerUrl] = useState(config.serverUrl);
  const [geminiApiKey, setGeminiApiKey] = useState(config.geminiApiKey);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleTestConnection = async () => {
    if (!serverUrl.trim()) {
      setTestResult({ success: false, message: 'Vui lòng nhập URL Colab ngrok' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const health = await checkColabHealth(serverUrl);
    setIsTesting(false);

    if (health.online) {
      setTestResult({
        success: true,
        message: `Kết nối thành công! Thiết bị: ${health.gpuName || 'GPU Colab'}`,
      });
      onSaveConfig({
        ...config,
        serverUrl,
        geminiApiKey,
        connected: true,
        gpuName: health.gpuName,
      });
    } else {
      setTestResult({
        success: false,
        message: 'Không thể kết nối đến URL này. Hãy kiểm tra server Colab đã chạy chưa.',
      });
    }
  };

  const handleSave = () => {
    onSaveConfig({
      ...config,
      serverUrl,
      geminiApiKey,
      connected: testResult?.success || config.connected,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-xl glass-panel rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">
                Kết Nối AI Cloud (Hugging Face ZeroGPU / Google Colab)
              </h3>
              <p className="text-xs text-slate-400">
                Xóa chữ sạch hoàn hảo bằng mô hình LaMa Inpainting trên Nvidia A100 / T4 GPU
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Instructions Guide */}
          <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs space-y-2.5 text-indigo-200">
            <div className="font-semibold text-indigo-300 flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Hai phương thức chạy AI Cloud miễn phí:</span>
            </div>

            <div className="space-y-2 text-slate-300 text-[11.5px] leading-relaxed">
              <div className="p-2 rounded-lg bg-indigo-900/30 border border-indigo-700/40">
                <strong className="text-indigo-300 block mb-0.5">🌟 Cách 1: Hugging Face Spaces (ZeroGPU A100 - Khuyên dùng)</strong>
                Deploy mã nguồn từ thư mục <code className="text-indigo-200 font-mono">hf_space/</code> lên Hugging Face Space (chọn ZeroGPU). Copy URL dạng <code className="text-indigo-300 font-mono">https://username-space.hf.space</code> dán vào bên dưới. Chạy 24/7 ổn định!
              </div>

              <div className="p-2 rounded-lg bg-slate-900/40 border border-slate-800">
                <strong className="text-slate-200 block mb-0.5">⚡ Cách 2: Google Colab (T4 GPU)</strong>
                Mở file <code className="text-indigo-300 font-mono">colab/Manga_Translator_LaMa_Colab.ipynb</code> trên Colab, chọn Runtime GPU và bấm Run all. Copy link <code className="text-indigo-300 font-mono">https://xxxx.ngrok-free.app</code> dán vào bên dưới.
              </div>
            </div>
          </div>

          {/* AI Server URL Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>Đường dẫn AI Server URL (Hugging Face Space hoặc ngrok):</span>
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://user-space.hf.space hoặc https://xxxx.ngrok-free.app"
                className="flex-1 bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-all flex items-center space-x-1 shrink-0"
              >
                {isTesting ? (
                  <span>Đang test...</span>
                ) : (
                  <span>Kiểm tra kết nối</span>
                )}
              </button>
            </div>
            {testResult && (
              <div
                className={`p-2 rounded-lg text-xs flex items-center space-x-1.5 ${
                  testResult.success
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                    : 'bg-red-950/60 text-red-300 border border-red-800/60'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Optional Gemini API Key */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Key className="w-3.5 h-3.5 text-yellow-400" />
              <span>Gemini API Key (Tùy chọn cho chế độ AI Vision):</span>
            </label>
            <input
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Nếu không có API Key, hệ thống sẽ tự động dùng Google Translate / Manga-OCR miễn phí không giới hạn.
            </p>
          </div>

          {/* Sensitive Content / NSFW Notice */}
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300 flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Mẹo Dịch Truyện 18+/Nhạy Cảm:</span> Nếu truyện chứa nội dung nhạy cảm, bạn hãy chọn chế độ <strong>Uncensored (Manga-OCR)</strong> ở thanh công cụ trên cùng để không bao giờ bị AI Filter chặn!
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
          >
            Đóng
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-semibold btn-primary text-white transition-all shadow-md"
          >
            Lưu Cấu Hình
          </button>
        </div>
      </div>
    </div>
  );
};
