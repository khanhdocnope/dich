import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import JSZip from 'jszip';
import { PageItem } from '../types';
import { readFileAsDataURL, saveMultipleStoredImages } from './storage';

// In-memory directory handle for Web File System Access API
let webDirectoryHandle: any = null;

export const setWebDirectoryHandle = (handle: any) => {
  webDirectoryHandle = handle;
};

export const getWebDirectoryHandle = () => {
  return webDirectoryHandle;
};

/**
 * Natural alphabetical + numerical sorting (e.g. 1.jpg, 2.jpg, 10.jpg instead of 1, 10, 2)
 */
export const naturalSortFiles = (files: File[]): File[] => {
  return [...files].sort((a, b) => {
    const nameA = a.webkitRelativePath || a.name;
    const nameB = b.webkitRelativePath || b.name;
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });
};

/**
 * Request user to pick a folder on disk (supported in Chrome, Edge, modern WebViews)
 */
export const pickLocalOutputDirectory = async (): Promise<{ success: boolean; dirName?: string; error?: string }> => {
  try {
    if ('showDirectoryPicker' in window) {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      webDirectoryHandle = handle;
      return { success: true, dirName: handle.name };
    } else {
      return { success: false, error: 'Trình duyệt không hỗ trợ File System Access API. Hệ thống sẽ lưu trực tiếp vào Thư mục Documents / Tải về.' };
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Đã hủy chọn thư mục.' };
    }
    return { success: false, error: err.message || 'Không thể chọn thư mục' };
  }
};

/**
 * Import images from selected folder or files with natural numerical sorting & progress callback
 */
export const importImagesFromFolderOrFiles = async (
  fileList: FileList | File[],
  existingImages: PageItem[] = [],
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<{ newItems: PageItem[]; detectedFolderName?: string }> => {
  const rawArray = Array.from(fileList);
  // Filter for images only
  const imageFiles = rawArray.filter(
    (f) =>
      f.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name)
  );

  if (imageFiles.length === 0) {
    return { newItems: [], detectedFolderName: undefined };
  }

  // Naturally sort files
  const sortedFiles = naturalSortFiles(imageFiles);

  // Detect folder name if webkitRelativePath exists
  let detectedFolderName: string | undefined;
  if (sortedFiles[0].webkitRelativePath) {
    const parts = sortedFiles[0].webkitRelativePath.split('/');
    if (parts.length > 1) {
      detectedFolderName = parts[0];
    }
  }

  const newItems: PageItem[] = [];
  const existingNames = new Set(existingImages.map((img) => img.filename));

  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    let filename = file.name;

    // Avoid collision
    if (existingNames.has(filename)) {
      const dotIdx = filename.lastIndexOf('.');
      const base = dotIdx !== -1 ? filename.substring(0, dotIdx) : filename;
      const ext = dotIdx !== -1 ? filename.substring(dotIdx) : '';
      filename = `${base}_${Date.now()}_${i + 1}${ext}`;
    }
    existingNames.add(filename);

    if (onProgress) {
      onProgress(i + 1, sortedFiles.length, filename);
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      newItems.push({
        filename,
        rawUrl: dataUrl,
        outputUrl: null,
        status: 'raw',
        metadata: {
          bubbles: [],
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error(`Error reading ${file.name}:`, err);
    }
  }

  if (newItems.length > 0) {
    await saveMultipleStoredImages(newItems);
  }

  return { newItems, detectedFolderName };
};

/**
 * Save image to chosen folder across Android APK (Capacitor Filesystem), Web Directory Handle, or Download
 */
export const saveImageToOutputFolder = async (
  filename: string,
  imageBase64: string,
  folderName: string = 'MangaTranslator/Output',
  triggerDownload: boolean = true
): Promise<{ success: boolean; savedPath?: string; method: string }> => {
  const cleanFilename = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`;

  // 1. Android Capacitor Native Filesystem
  if (Capacitor.isNativePlatform()) {
    try {
      // Strip data url prefix if present
      const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      const path = `${folderName.replace(/\\/g, '/')}/${cleanFilename}`;

      await Filesystem.writeFile({
        path,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });

      return {
        success: true,
        savedPath: `Documents/${path}`,
        method: 'Capacitor Native Filesystem',
      };
    } catch (err: any) {
      console.warn('Native Filesystem write failed, attempting fallback:', err);
    }
  }

  // 2. Web Directory Handle (File System Access API)
  if (webDirectoryHandle) {
    try {
      const fileHandle = await webDirectoryHandle.getFileHandle(cleanFilename, { create: true });
      const writable = await fileHandle.createWritable();
      
      // Convert base64 to Blob
      const response = await fetch(imageBase64);
      const blob = await response.blob();
      await writable.write(blob);
      await writable.close();

      return {
        success: true,
        savedPath: `${webDirectoryHandle.name}/${cleanFilename}`,
        method: 'File System Access API',
      };
    } catch (err: any) {
      console.warn('Web Directory Handle write failed:', err);
    }
  }

  // 3. Fallback browser / webview trigger download
  if (triggerDownload) {
    try {
      const link = document.createElement('a');
      link.href = imageBase64;
      link.download = cleanFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return {
        success: true,
        savedPath: `Downloads/${cleanFilename}`,
        method: 'Direct Download',
      };
    } catch (err: any) {
      console.error('Trigger download failed:', err);
    }
  }

  return { success: true, savedPath: cleanFilename, method: 'IndexedDB & Backend' };
};

/**
 * Export all processed / translated images as a single .ZIP archive
 */
export const exportImagesAsZip = async (
  images: PageItem[],
  zipFilename: string = 'Manga_Translated_Folder.zip'
): Promise<boolean> => {
  try {
    const zip = new JSZip();
    let count = 0;

    for (const img of images) {
      const exportUrl = img.outputUrl || img.rawUrl;
      if (!exportUrl) continue;

      const base64Data = exportUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      const cleanName = img.filename.toLowerCase().endsWith('.png') ? img.filename : `${img.filename}.png`;
      zip.file(cleanName, base64Data, { base64: true });
      count++;
    }

    if (count === 0) {
      alert('Không có ảnh nào để đóng gói ZIP!');
      return false;
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // In Capacitor native, write zip to Documents
    if (Capacitor.isNativePlatform()) {
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64data = (reader.result as string).split(',')[1];
            resolve(base64data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(zipBlob);
        });

        const zipBase64 = await base64Promise;
        await Filesystem.writeFile({
          path: `MangaTranslator/${zipFilename}`,
          data: zipBase64,
          directory: Directory.Documents,
          recursive: true,
        });

        alert(`🎉 Đã lưu trọn gói ZIP vào: Documents/MangaTranslator/${zipFilename}`);
        return true;
      } catch (err) {
        console.warn('Native ZIP write fallback:', err);
      }
    }

    // Web download
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (err) {
    console.error('Failed to create ZIP package:', err);
    alert('Không thể tạo file ZIP. Vui lòng thử lại!');
    return false;
  }
};
