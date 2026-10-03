import { PageItem, Bubble, ColabConfig } from '../types';

const DB_NAME = 'MangaStudioDB';
const DB_VERSION = 1;
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
 * Revoke Object URL to immediately free RAM
 */
export const revokeSafeObjectURL = (url?: string | null) => {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
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
      // If rawUrl is a blob URL, don't store blob URL string in IDB
      if (dbItem.rawUrl && dbItem.rawUrl.startsWith('blob:')) {
        delete dbItem.rawUrl;
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
 * Import files selected by user from Gallery / Storage using zero-copy Blobs and Object URLs
 */
export const importImagesFromFiles = async (
  files: FileList | File[],
  existingImages: PageItem[] = []
): Promise<PageItem[]> => {
  const fileArray = Array.from(files);
  const newItems: PageItem[] = [];
  const existingNames = new Set(existingImages.map((img) => img.filename));

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name)) continue;

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
      // Zero-copy: Create Object URL directly from File object (Blob)
      const blobUrl = URL.createObjectURL(file);
      const newItem: PageItem = {
        filename,
        rawUrl: blobUrl,
        rawBlob: file,
        outputUrl: null,
        status: 'raw',
        metadata: {
          bubbles: [],
          lastUpdated: new Date().toISOString(),
        },
      };
      newItems.push(newItem);
    } catch (err) {
      console.error(`Failed to process file ${file.name}:`, err);
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

