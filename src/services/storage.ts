import { PageItem, Bubble, ColabConfig } from '../types';

const DB_NAME = 'MangaStudioDB';
const DB_VERSION = 1;
const STORE_IMAGES = 'images';

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
 * Get all stored images from IndexedDB
 */
export const getAllStoredImages = async (): Promise<PageItem[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, 'readonly');
      const store = transaction.objectStore(STORE_IMAGES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Error reading from IndexedDB:', err);
    return [];
  }
};

/**
 * Save or update a single image in IndexedDB
 */
export const saveStoredImage = async (item: PageItem): Promise<boolean> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, 'readwrite');
      const store = transaction.objectStore(STORE_IMAGES);
      const request = store.put(item);

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

      items.forEach((item) => store.put(item));

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
 * Read File object as Base64 Data URL
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
 * Import files selected by user from Gallery / Storage and persist in IndexedDB
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
    if (!file.type.startsWith('image/')) continue;

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
      const dataUrl = await readFileAsDataURL(file);
      const newItem: PageItem = {
        filename,
        rawUrl: dataUrl,
        outputUrl: null,
        status: 'raw',
        metadata: {
          bubbles: [],
          lastUpdated: new Date().toISOString(),
        },
      };
      newItems.push(newItem);
    } catch (err) {
      console.error(`Failed to read file ${file.name}:`, err);
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
export const triggerDownloadImage = (filename: string, base64: string) => {
  try {
    const link = document.createElement('a');
    link.href = base64;
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
