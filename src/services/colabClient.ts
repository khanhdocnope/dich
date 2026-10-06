import { Bubble, ColabConfig } from '../types';

/**
 * Basic health check for optional external AI backend
 */
export const checkColabHealth = async (serverUrl: string): Promise<{ online: boolean; gpuName?: string }> => {
  if (!serverUrl) return { online: false };
  try {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/health`, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    if (res.ok) {
      const data = await res.json();
      return { online: true, gpuName: data.gpu || data.gpu_name || data.device || 'Online' };
    }
    return { online: false };
  } catch {
    return { online: false };
  }
};

/**
 * Utility to ensure an image URL or Blob URL is converted to Base64
 */
export const ensureBase64 = async (urlOrBase64: string): Promise<string> => {
  if (!urlOrBase64) return '';
  if (urlOrBase64.startsWith('blob:')) {
    try {
      const res = await fetch(urlOrBase64);
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error('Failed to convert Blob URL to base64:', e);
      return urlOrBase64;
    }
  }
  return urlOrBase64;
};

/**
 * Full page AI clean (ComicTextDetector + Dilation + LaMa FFC Inpainting)
 */
export interface CleanPageResult {
  success: boolean;
  cleanedImageBase64?: string;
  maskBase64?: string;
  stats?: {
    flat?: number;
    lama?: number;
    total_regions?: number;
    regions?: number;
    model?: string;
    engine?: string;
  };
  error?: string;
}

export const switchIOPaintModel = async (
  serverUrl: string,
  modelName: 'anime-lama' | 'lama'
): Promise<{ success: boolean; currentModel?: string }> => {
  if (!serverUrl) return { success: false };
  try {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/switch_model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ modelName }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: data.success, currentModel: data.current_model };
    }
  } catch (e) {
    console.warn('Switch IOPaint model failed:', e);
  }
  return { success: false };
};

export const cleanPageWithAI = async (
  serverUrl: string,
  imageBase64: string,
  options?: { dilationPx?: number; flatThreshold?: number }
): Promise<CleanPageResult> => {
  if (!serverUrl) return { success: false, error: 'Chưa kết nối Colab AI Server' };

  try {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const payloadImg = await ensureBase64(imageBase64);

    const res = await fetch(`${cleanUrl}/api/clean_page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        imageBase64: payloadImg,
        dilationPx: options?.dilationPx ?? 4,
        flatThreshold: options?.flatThreshold ?? 3.5,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        cleanedImageBase64: data.cleanedImageBase64,
        maskBase64: data.maskBase64,
        stats: data.stats,
      };
    } else {
      const err = await res.text();
      return { success: false, error: err || 'Lỗi xử lý từ máy chủ AI' };
    }
  } catch (e: any) {
    console.error('cleanPageWithAI failed:', e);
    return { success: false, error: e?.message || 'Không thể kết nối tới server AI' };
  }
};

/**
 * Text detection connector using ComicTextDetector ONNX
 */
export const detectTextRegions = async (
  serverUrl: string,
  imageBase64: string
): Promise<{ success: boolean; boxes: Array<{ x: number; y: number; width: number; height: number }>; maskBase64?: string }> => {
  if (!serverUrl) return { success: false, boxes: [] };

  try {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const payloadImg = await ensureBase64(imageBase64);

    const res = await fetch(`${cleanUrl}/api/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ imageBase64: payloadImg }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        boxes: data.boxes || [],
        maskBase64: data.maskBase64,
      };
    }
  } catch (e) {
    console.warn('Detect request failed:', e);
  }

  return { success: false, boxes: [] };
};

/**
 * Basic area inpainting connector (for future AI models)
 */
export const inpaintImageWithLaMa = async (
  serverUrl: string,
  imageBase64: string,
  maskBase64: string
): Promise<string> => {
  if (!serverUrl) return imageBase64;

  try {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const payloadImg = await ensureBase64(imageBase64);
    const payloadMask = await ensureBase64(maskBase64);

    const res = await fetch(`${cleanUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ imageBase64: payloadImg, maskBase64: payloadMask }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.cleanedImageBase64) {
        return data.cleanedImageBase64;
      }
    }
  } catch (e) {
    console.warn('Inpaint request failed:', e);
  }

  return imageBase64;
};

/**
 * Basic OCR connector (for future AI models)
 */
export const ocrBubbles = async (
  config: ColabConfig,
  imageBase64: string,
  bubbles: Bubble[]
): Promise<Bubble[]> => {
  if (!config?.serverUrl || !config.connected) return bubbles;

  try {
    const cleanUrl = config.serverUrl.replace(/\/+$/, '');
    const payloadImg = await ensureBase64(imageBase64);
    const res = await fetch(`${cleanUrl}/api/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        imageBase64: payloadImg,
        boxes: bubbles.map((b) => ({ id: b.id, x: b.x, y: b.y, width: b.width, height: b.height })),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.results && Array.isArray(data.results)) {
        return bubbles.map((b, idx) => ({
          ...b,
          originalText: data.results[idx]?.text || b.originalText,
        }));
      }
    }
  } catch (e) {
    console.warn('OCR request failed:', e);
  }

  return bubbles;
};

/**
 * Basic Translation connector (for future AI models)
 */
export const translateBubbles = async (
  config: ColabConfig,
  bubbles: Bubble[]
): Promise<Bubble[]> => {
  if (!config?.serverUrl || !config.connected) return bubbles;

  try {
    const texts = bubbles.map((b) => b.originalText).filter(Boolean);
    if (texts.length === 0) return bubbles;

    const cleanUrl = config.serverUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        texts,
        targetLang: config.targetLang || 'vi',
        apiKey: config.geminiApiKey || undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.translated && Array.isArray(data.translated)) {
        return bubbles.map((b, idx) => ({
          ...b,
          translatedText: data.translated[idx] || b.translatedText,
        }));
      }
    }
  } catch (e) {
    console.warn('Translate request failed:', e);
  }

  return bubbles;
};

/**
 * Empty stub for future auto-detection workflow
 */
export const detectAndTranslatePageAuto = async (
  _config: ColabConfig,
  _rawImageUrl: string,
  _imgWidth: number,
  _imgHeight: number
): Promise<Bubble[]> => {
  // Purposely cleared: awaiting new modular workflow architecture
  return [];
};
