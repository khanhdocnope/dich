import { PageItem, Bubble, ColabConfig } from '../types';

const DB_NAME = 'MangaStudioDB';
const DB_VERSION = 2; // Upgraded version for thumbnail support
const STORE_IMAGES = 'images';

/**
 * Convert Base64 Data URL to Blob without creating extra V8 string garbage
 */
export const dataURLToBlob = (dataUrl: string): Blob => {
  if (!dataUrl || !dataUrl.includes(',')) {
    return new Blob([], { type: 'image/png' });
  }
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * Convert Blob to Base64 Data URL only on-demand (e.g. for external AI server requests)
 */
export const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

/**
 * Create memory-efficient Object URL (blob:...) for graphics rendering
 */
export const createSafeObjectURL = (source: Blob | string): string => {
  if (typeof source === 'string') {
    if (source.startsWith('data:') && source.length > 500) {
      const blob = dataURLToBlob(source);
      return URL.createObjectURL(blob);
    }
    return source;
  }
  return URL.createObjectURL(source);
};

/**
 * Revoke Object URL to immediately free RAM from browser memory
 */
export const revokeSafeObjectURL = (url?: string | null) => {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
};

/**
 * Revoke all Object URLs associated with a single PageItem
 */
export const revokePageObjectUrls = (page: PageItem) => {
  if (!page) return;
  revokeSafeObjectURL(page.rawUrl);
  revokeSafeObjectURL(page.thumbnailUrl);
  revokeSafeObjectURL(page.outputUrl);
  if (page.metadata?.cleanedImageBase64) {
    revokeSafeObjectURL(page.metadata.cleanedImageBase64);
  }
};

/**
 * Generate lightweight, high-performance WebP/JPEG thumbnail Blob (max 200px) from raw Blob
 * Prevents decoding massive 4K full-resolution bitmaps in Sidebar lists.
 */
export const generateThumbnailBlob = async (
  sourceBlob: Blob,
  maxDimension = 200,
  quality = 0.72
): Promise<Blob> => {
  try {
    // 1. Try modern createImageBitmap for blazing fast background decoding
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(sourceBlob);
        const { width, height } = bitmap;
        const scale = Math.min(maxDimension / width, maxDimension / height, 1.0);
        const thumbW = Math.max(1, Math.round(width * scale));
        const thumbH = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = thumbW;
        canvas.height = thumbH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(bitmap, 0, 0, thumbW, thumbH);
          bitmap.close();

          return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob returned null'));
              },
              'image/webp',
              quality
            );
          });
        }
      } catch {
        // Fallback to HTMLImageElement below if createImageBitmap fails on specific format
      }
    }

    // 2. Standard HTMLImageElement Fallback
    return await new Promise<Blob>((resolve, reject) => {
      const tempUrl = URL.createObjectURL(sourceBlob);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const { naturalWidth: width, naturalHeight: height } = img;
          const scale = Math.min(maxDimension / width, maxDimension / height, 1.0);
          const thumbW = Math.max(1, Math.round(width * scale));
          const thumbH = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = thumbW;
          canvas.height = thumbH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(tempUrl);
            return reject(new Error('Cannot get 2d context for thumbnail canvas'));
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(img, 0, 0, thumbW, thumbH);
          URL.revokeObjectURL(tempUrl);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Canvas toBlob failed'));
            },
            'image/jpeg',
            quality
          );
        } catch (err) {
          URL.revokeObjectURL(tempUrl);
          reject(err);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
        reject(new Error('Failed to load image for thumbnail creation (corrupted or unsupported format)'));
      };

      img.src = tempUrl;
    });
  } catch (err) {
    console.warn('Thumbnail generation failed, falling back to original blob:', err);
    return sourceBlob;
  }
};

/**
 * Initialize IndexedDB for offline-first image and metadata storage
 */
export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported on this device.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'filename' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all stored images from IndexedDB, converting Blob binaries to lightweight Object URLs
 */
export const getAllStoredImages = async (): Promise<PageItem[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, 'readonly');
      const store = transaction.objectStore(STORE_IMAGES);
      const request = store.getAll();

      request.onsuccess = () => {
        const items: PageItem[] = request.result || [];
        const processed = items.map((item) => {
          let rawUrl = item.rawUrl;
          if (item.rawBlob) {
            rawUrl = URL.createObjectURL(item.rawBlob);
          }

          let thumbnailUrl = item.thumbnailUrl;
          if (item.thumbnailBlob) {
            thumbnailUrl = URL.createObjectURL(item.thumbnailBlob);
          } else if (item.rawBlob) {
            // Lazy fallback: use rawUrl, background generation will update it
            thumbnailUrl = rawUrl;
          }

          let outputUrl = item.outputUrl;
          if (item.outputBlob) {
            outputUrl = URL.createObjectURL(item.outputBlob);
          }
          let metadata = item.metadata;
          if (metadata && metadata.cleanedBlob) {
            metadata = {
              ...metadata,
              cleanedImageBase64: URL.createObjectURL(metadata.cleanedBlob),
            };
          }
          return {
            ...item,
            rawUrl,
            thumbnailUrl,
            outputUrl,
            metadata,
          };
        });
        resolve(processed);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Error reading from IndexedDB:', err);
    return [];
  }
};

/**
 * Save or update a single image in IndexedDB with Blob binaries for zero Base64 bloat
 */
export const saveStoredImage = async (item: PageItem): Promise<boolean> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, 'readwrite');
      const store = transaction.objectStore(STORE_IMAGES);

      // Clone item to avoid mutating in-memory object
      const dbItem: any = { ...item };

      // Convert rawUrl Base64 to Blob if needed
      if (!dbItem.rawBlob && dbItem.rawUrl && dbItem.rawUrl.startsWith('data:')) {
        dbItem.rawBlob = dataURLToBlob(dbItem.rawUrl);
      }
      if (dbItem.rawUrl && dbItem.rawUrl.startsWith('blob:')) {
        delete dbItem.rawUrl;
      }

      // Preserve thumbnail blob
      if (dbItem.thumbnailUrl && dbItem.thumbnailUrl.startsWith('blob:')) {
        delete dbItem.thumbnailUrl;
      }

      // Convert outputUrl Base64 to Blob if needed
      if (!dbItem.outputBlob && dbItem.outputUrl && dbItem.outputUrl.startsWith('data:')) {
        dbItem.outputBlob = dataURLToBlob(dbItem.outputUrl);
      }
      if (dbItem.outputUrl && dbItem.outputUrl.startsWith('blob:')) {
        delete dbItem.outputUrl;
      }

      // Convert cleanedImageBase64 to Blob in metadata
      if (dbItem.metadata && dbItem.metadata.cleanedImageBase64) {
        if (dbItem.metadata.cleanedImageBase64.startsWith('data:')) {
          dbItem.metadata.cleanedBlob = dataURLToBlob(dbItem.metadata.cleanedImageBase64);
        }
        if (dbItem.metadata.cleanedImageBase64.startsWith('blob:')) {
          delete dbItem.metadata.cleanedImageBase64;
        }
      }

      const request = store.put(dbItem);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error saving image to IndexedDB:', err);
    return false;
  }
};

/**
 * Save multiple images in IndexedDB in a single transaction
 */
export const saveMultipleStoredImages = async (items: PageItem[]): Promise<boolean> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, 'readwrite');
      const store = transaction.objectStore(STORE_IMAGES);

      items.forEach((item) => {
        const dbItem: any = { ...item };
        if (!dbItem.rawBlob && dbItem.rawUrl && dbItem.rawUrl.startsWith('data:')) {
          dbItem.rawBlob = dataURLToBlob(dbItem.rawUrl);
        }
        if (dbItem.rawUrl && dbItem.rawUrl.startsWith('blob:')) {
          delete dbItem.rawUrl;
        }

        if (dbItem.thumbnailUrl && dbItem.thumbnailUrl.startsWith('blob:')) {
          delete dbItem.thumbnailUrl;
        }

        if (!dbItem.outputBlob && dbItem.outputUrl && dbItem.outputUrl.startsWith('data:')) {
          dbItem.outputBlob = dataURLToBlob(dbItem.outputUrl);
        }
        if (dbItem.outputUrl && dbItem.outputUrl.startsWith('blob:')) {
          delete dbItem.outputUrl;
        }

        if (dbItem.metadata && dbItem.metadata.cleanedImageBase64) {
          if (dbItem.metadata.cleanedImageBase64.startsWith('data:')) {
            dbItem.metadata.cleanedBlob = dataURLToBlob(dbItem.metadata.cleanedImageBase64);
          }
          if (dbItem.metadata.cleanedImageBase64.startsWith('blob:')) {
            delete dbItem.metadata.cleanedImageBase64;
          }
        }

        store.put(dbItem);
      });

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error('Error saving multiple images to IndexedDB:', err);
    return false;
  }
};

/**
 * Delete a single image by filename from IndexedDB
 */
export const deleteStoredImage = async (filename: string): Promise<boolean> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, 'readwrite');
      const store = transaction.objectStore(STORE_IMAGES);
      const request = store.delete(filename);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error deleting image from IndexedDB:', err);
    return false;
  }
};

/**
 * Clear all images from IndexedDB
 */
export const clearAllStoredImages = async (): Promise<boolean> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, 'readwrite');
      const store = transaction.objectStore(STORE_IMAGES);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error clearing IndexedDB:', err);
    return false;
  }
};

/**
 * Read File object as Base64 Data URL (kept for API compatibility)
 */
export const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

/**
 * Import files selected by user with automatic thumbnail generation and zero-copy Blobs
 */
export const importImagesFromFiles = async (
  files: FileList | File[],
  existingImages: PageItem[] = [],
  onErrorCallback?: (filename: string, errorMsg: string) => void
): Promise<PageItem[]> => {
  const fileArray = Array.from(files);
  const newItems: PageItem[] = [];
  const existingNames = new Set(existingImages.map((img) => img.filename));

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|bmp|gif|avif)$/i.test(file.name)) {
      onErrorCallback?.(file.name, 'Định dạng không hỗ trợ (chỉ nhận JPG, PNG, WEBP, BMP, GIF, AVIF)');
      continue;
    }

    let filename = file.name;
    // Handle name collision
    if (existingNames.has(filename)) {
      const dotIdx = filename.lastIndexOf('.');
      const baseName = dotIdx !== -1 ? filename.substring(0, dotIdx) : filename;
      const ext = dotIdx !== -1 ? filename.substring(dotIdx) : '';
      filename = `${baseName}_${Date.now()}_${i + 1}${ext}`;
    }
    existingNames.add(filename);

    try {
      // 1. Generate lightweight thumbnail
      let thumbBlob: Blob | undefined;
      let thumbUrl: string | null = null;
      try {
        thumbBlob = await generateThumbnailBlob(file, 200, 0.72);
        thumbUrl = URL.createObjectURL(thumbBlob);
      } catch (thumbErr) {
        console.warn(`Could not generate thumbnail for ${file.name}, using raw:`, thumbErr);
      }

      // 2. Zero-copy: Create Object URL directly from File object (Blob)
      const blobUrl = URL.createObjectURL(file);
      const newItem: PageItem = {
        filename,
        rawUrl: blobUrl,
        rawBlob: file,
        thumbnailUrl: thumbUrl || blobUrl,
        thumbnailBlob: thumbBlob || file,
        outputUrl: null,
        status: 'raw',
        metadata: {
          bubbles: [],
          lastUpdated: new Date().toISOString(),
        },
      };
      newItems.push(newItem);
    } catch (err: any) {
      console.error(`Failed to process file ${file.name}:`, err);
      onErrorCallback?.(file.name, err.message || 'Lỗi khi đọc file ảnh');
    }
  }

  if (newItems.length > 0) {
    await saveMultipleStoredImages(newItems);
  }

  return newItems;
};

/**
 * Trigger file download directly to device (phone Gallery / Downloads / PC)
 */
export const triggerDownloadImage = (filename: string, base64OrBlobUrl: string) => {
  try {
    const link = document.createElement('a');
    link.href = base64OrBlobUrl;
    const downloadName = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Failed to trigger download:', err);
  }
};

/**
 * Load Colab config from localStorage
 */
export const loadSavedColabConfig = (): ColabConfig | null => {
  try {
    const saved = localStorage.getItem('manga_studio_colab_config');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Could not load saved Colab config:', e);
  }
  return null;
};

/**
 * Save Colab config to localStorage
 */
export const saveStoredColabConfig = (config: ColabConfig) => {
  try {
    localStorage.setItem('manga_studio_colab_config', JSON.stringify(config));
  } catch (e) {
    console.warn('Could not save Colab config:', e);
  }
};
