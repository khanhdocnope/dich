import React, { useState } from 'react';
import { 
  X, 
  FolderCheck, 
  FolderPlus, 
  Download, 
  FileArchive, 
  Smartphone, 
  HardDrive,
  CheckCircle2,
  Info
} from 'lucide-react';
import { PageItem, OutputFolderConfig } from '../types';
import { pickLocalOutputDirectory, exportImagesAsZip } from '../services/folderService';

interface OutputFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: PageItem[];
  outputConfig: OutputFolderConfig;
  onSaveConfig: (config: OutputFolderConfig) => void;
}

export const OutputFolderModal: React.FC<OutputFolderModalProps> = ({
  isOpen,
  onClose,
  images,
  outputConfig,
  onSaveConfig,
}) => {
  if (!isOpen) return null;

  const [folderName, setFolderName] = useState(outputConfig.customFolderName || 'MangaTranslator/Chapter_01');
  const [selectedWebDir, setSelectedWebDir] = useState<string | null>(outputConfig.directoryHandleName || null);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const handlePickDirectory = async () => {
    const res = await pickLocalOutputDirectory();
    if (res.success && res.dirName) {
      setSelectedWebDir(res.dirName);
      onSaveConfig({
        ...outputConfig,
        customFolderName: folderName,
        directoryHandleName: res.dirName,
      });
      alert(`✅ Đã chọn thư mục lưu: ${res.dirName}`);
    } else if (res.error) {
      alert(res.error);
    }
  };

  const handleExportZip = async () => {
    setIsExportingZip(true);
    const cleanZipName = `${folderName.replace(/[\/\\:]/g, '_')}_Translated.zip`;
    await exportImagesAsZip(images, cleanZipName);
    setIsExportingZip(false);
  };

  const handleSaveAndClose = () => {
    onSaveConfig({
      ...outputConfig,
      customFolderName: folderName.trim() || 'MangaTranslator/Output',
      directoryHandleName: selectedWebDir,
    });
    onClose();
  };

  const doneCount = images.filter((img) => img.status === 'done').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-lg glass-panel rounded-2xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <FolderCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">
                Thư Mục Lưu Kết Quả Dịch
              </h3>
              <p className="text-xs text-slate-400">
                Tùy chỉnh nơi lưu ảnh đã dịch trên điện thoại & máy tính
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Section 1: Android & Custom Folder Name */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center space-x-2 text-indigo-300 font-semibold">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>Tên Thư Mục Lưu (Android / Thiết bị)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Ảnh xuất sẽ được tự động lưu vào bộ nhớ máy tại thư mục:
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="VD: MangaTranslator/Chapter_01"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="text-[10.5px] text-emerald-400 flex items-center space-x-1.5 bg-emerald-950/40 p-2 rounded-lg border border-emerald-800/40 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Đường dẫn: Documents/{folderName}/[tên_trang].png</span>
            </div>
          </div>

          {/* Section 2: Direct Directory Picker (Chrome/PC) */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-purple-300 font-semibold">
                <HardDrive className="w-4 h-4 text-purple-400" />
                <span>Chọn Thư Mục Lưu Trực Tiếp (PC / Trình duyệt)</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Chọn trực tiếp 1 thư mục bất kỳ trên ổ đĩa. Khi xuất ảnh sẽ ghi thẳng vào thư mục đó mà không cần tải lại từng file.
            </p>
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handlePickDirectory}
                className="px-3 py-2 rounded-lg bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 font-semibold flex items-center space-x-1.5 transition-all"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Chọn Thư Mục Trên Máy</span>
              </button>
              {selectedWebDir && (
                <span className="text-[11px] text-emerald-400 font-mono truncate max-w-[180px]">
                  Đang chọn: <strong>{selectedWebDir}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Section 3: 1-Click ZIP Package Export */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/50 to-purple-950/50 border border-indigo-800/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                <FileArchive className="w-4 h-4 text-amber-400" />
                <span>Đóng Gói Trọn Bộ Thư Mục (.ZIP)</span>
              </div>
              <span className="text-[10.5px] bg-slate-900 px-2 py-0.5 rounded text-slate-300">
                {images.length} trang ({doneCount} đã hoàn thành)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Tải toàn bộ các trang truyện đã dịch gom chung trong một file nén <code>.ZIP</code> duy nhất để dễ dàng giải nén hoặc chia sẻ lên điện thoại / Google Drive.
            </p>
            <button
              onClick={handleExportZip}
              disabled={isExportingZip || images.length === 0}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold flex items-center justify-center space-x-2 transition-all shadow-md shadow-amber-600/20 active:scale-98 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isExportingZip
                  ? 'Đang tạo gói nén ZIP...'
                  : `Tải Về Toàn Bộ ${images.length} Trang (.ZIP)`}
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            Hủy
          </button>
          <button
            onClick={handleSaveAndClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold btn-primary text-white"
          >
            Lưu Cấu Hình
          </button>
        </div>
      </div>
    </div>
  );
};
