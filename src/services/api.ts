import { PageItem, Bubble } from '../types';
import {
  getAllStoredImages,
  saveStoredImage,
  saveMultipleStoredImages,
  deleteStoredImage,
  clearAllStoredImages,
  triggerDownloadImage,
  importImagesFromFiles
} from './storage';
import {
  saveImageToOutputFolder,
  importImagesFromFolderOrFiles,
  exportImagesAsZip,
  pickLocalOutputDirectory
} from './folderService';

export {
  deleteStoredImage,
  clearAllStoredImages,
  triggerDownloadImage,
  importImagesFromFiles,
  saveImageToOutputFolder,
  importImagesFromFolderOrFiles,
  exportImagesAsZip,
  pickLocalOutputDirectory
};


/**
 * Fetch image list from local IndexedDB first, with automatic fallback/sync to Node.js backend if available
 */
export const fetchImageList = async (): Promise<{
  success: boolean;
  images: PageItem[];
  rawDir?: string;
  outputDir?: string;
}> => {
  try {
    // 1. Check IndexedDB first (Offline-first / Mobile App / Gallery)
    const localImages = await getAllStoredImages();
    if (localImages && localImages.length > 0) {
      return { success: true, images: localImages };
    }

    // 2. If IndexedDB is empty, check if desktop Node.js backend is running with default raw materials
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const res = await fetch('/api/images', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.images) && data.images.length > 0) {
          // Cache into IndexedDB for persistent offline access
          await saveMultipleStoredImages(data.images);
          return data;
        }
      }
    } catch {
      // Backend not running (normal on Android Capacitor standalone app)
    }

    return { success: true, images: localImages || [] };
  } catch (error) {
    console.error('Error fetching image list:', error);
    return { success: false, images: [] };
  }
};

/**
 * Save output image: Persist in IndexedDB, trigger save to chosen device folder / download, and sync to Node.js backend if available
 */
export const saveOutputImage = async (
  filename: string,
  imageBase64: string,
  autoDownload: boolean = true,
  folderName: string = 'MangaTranslator/Output'
): Promise<{ success: boolean; savedPath?: string }> => {
  try {
    // 1. Update status and outputUrl in IndexedDB
    const localImages = await getAllStoredImages();
    const existing = localImages.find((img) => img.filename === filename);
    if (existing) {
      existing.outputUrl = imageBase64;
      existing.status = 'done';
      await saveStoredImage(existing);
    }

    // 2. Save directly to Android Documents / chosen folder or trigger download
    let savedPath = filename;
    if (autoDownload) {
      const result = await saveImageToOutputFolder(filename, imageBase64, folderName, true);
      if (result.savedPath) {
        savedPath = result.savedPath;
      }
    }

    // 3. Sync to desktop Node backend if available
    try {
      fetch('/api/save-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, imageBase64 }),
      }).catch(() => {});
    } catch {}

    return { success: true, savedPath };

  } catch (error) {
    console.error('Error saving output image:', error);
    return { success: false };
  }
};


/**
 * Save project metadata (bubbles, inpainting mask/clean layer) locally in IndexedDB and backend
 */
export const saveProjectMetadata = async (
  filename: string,
  bubbles: Bubble[],
  cleanedImageBase64?: string
): Promise<boolean> => {
  try {
    const metadata = {
      bubbles,
      cleanedImageBase64,
      lastUpdated: new Date().toISOString(),
    };

    // 1. Update IndexedDB
    const localImages = await getAllStoredImages();
    const target = localImages.find((img) => img.filename === filename);
    if (target) {
      target.metadata = metadata;
      if (bubbles.length > 0 && target.status === 'raw') {
        target.status = 'in_progress';
      }
      await saveStoredImage(target);
    }

    // 2. Sync to desktop backend if available
    try {
      fetch('/api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, metadata }),
      }).catch(() => {});
    } catch {}

    return true;
  } catch (error) {
    console.error('Error saving project metadata:', error);
    return false;
  }
};

/**
 * Load project metadata for a specific image
 */
export const loadProjectMetadata = async (filename: string): Promise<any> => {
  try {
    // 1. Check IndexedDB first
    const localImages = await getAllStoredImages();
    const target = localImages.find((img) => img.filename === filename);
    if (target && target.metadata) {
      return target.metadata;
    }

    // 2. Fallback to desktop backend if available
    try {
      const res = await fetch(`/api/project/${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        return data.metadata;
      }
    } catch {}

    return null;
  } catch (error) {
    console.error('Error loading project metadata:', error);
    return null;
  }
};
