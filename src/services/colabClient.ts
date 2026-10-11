import { Bubble, ColabConfig } from '../types';

/**
 * Chuẩn hóa và tự động chuyển đổi URL máy chủ:
 * - Tự động chuyển link web Hugging Face Spaces (https://huggingface.co/spaces/{user}/{space})
 *   thành link API trực tiếp (https://{user}-{space}.hf.space)
 * - Loại bỏ dấu gạch chéo ở cuối URL
 */
export const normalizeServerUrl = (rawUrl: string): string => {
  if (!rawUrl) return '';
  let url = rawUrl.trim().replace(/\/+$/, '');

  // Phát hiện và chuyển đổi link web Hugging Face Spaces
  const hfMatch = url.match(/^https?:\/\/huggingface\.co\/spaces\/([^/]+)\/([^/?#]+)/i);
  if (hfMatch) {
    const user = hfMatch[1].toLowerCase().replace(/_/g, '-');
    const space = hfMatch[2].toLowerCase().replace(/_/g, '-');
    url = `https://${user}-${space}.hf.space`;
  }

  return url;
};

/**
 * Basic health check for optional external AI backend
 */
export const checkColabHealth = async (serverUrl: string): Promise<{ online: boolean; gpuName?: string }> => {
  if (!serverUrl) return { online: false };
  try {
    const cleanUrl = normalizeServerUrl(serverUrl);
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
  if (urlOrBase64.startsWith('data:image/')) {
    return urlOrBase64;
  }
  if (
    urlOrBase64.startsWith('blob:') ||
    urlOrBase64.startsWith('http://') ||
    urlOrBase64.startsWith('https://') ||
    urlOrBase64.startsWith('/') ||
    urlOrBase64.startsWith('./')
  ) {
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
      console.error('Failed to convert URL/Blob to base64:', e);
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
    const cleanUrl = normalizeServerUrl(serverUrl);
    let res = await fetch(`${cleanUrl}/api/switch_model`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ modelName }),
    });

    if (res.status === 405 || res.status === 404) {
      res = await fetch(`${cleanUrl}/switch_model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ modelName }),
      });
    }

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
    const cleanUrl = normalizeServerUrl(serverUrl);
    const payloadImg = await ensureBase64(imageBase64);
    const bodyStr = JSON.stringify({
      imageBase64: payloadImg,
      dilationPx: options?.dilationPx ?? 4,
      flatThreshold: options?.flatThreshold ?? 3.5,
    });

    let res = await fetch(`${cleanUrl}/api/clean_page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: bodyStr,
    });

    // Fallback to /clean_page if Gradio intercepts /api/clean_page with 405 Method Not Allowed or 404
    if (res.status === 405 || res.status === 404) {
      res = await fetch(`${cleanUrl}/clean_page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: bodyStr,
      });
    }

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
      let friendlyErr = err;
      try {
        const jsonErr = JSON.parse(err);
        if (jsonErr?.error?.message === 'Method Not Allowed' || jsonErr?.message === 'Method Not Allowed') {
          friendlyErr = 'Máy chủ phản hồi "Method Not Allowed". Nếu bạn dùng Hugging Face Space, vui lòng đảm bảo dùng link trực tiếp https://<user>-<space>.hf.space thay vì link web huggingface.co/spaces/... (Hệ thống đã tự động sửa link trong bảng Cài đặt Máy Chủ AI).';
        }
      } catch {}
      return { success: false, error: friendlyErr || 'Lỗi xử lý từ máy chủ AI' };
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
    const cleanUrl = normalizeServerUrl(serverUrl);
    const payloadImg = await ensureBase64(imageBase64);
    const bodyStr = JSON.stringify({ imageBase64: payloadImg });

    let res = await fetch(`${cleanUrl}/api/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: bodyStr,
    });

    if (res.status === 405 || res.status === 404) {
      res = await fetch(`${cleanUrl}/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: bodyStr,
      });
    }

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
  if (!serverUrl) {
    throw new Error('Chưa kết nối Máy Chủ AI. Vui lòng bấm vào "Máy Chủ AI" trên đầu trang để nhập địa chỉ server.');
  }

  const cleanUrl = normalizeServerUrl(serverUrl);
  const payloadImg = await ensureBase64(imageBase64);
  const payloadMask = await ensureBase64(maskBase64);
  const bodyStr = JSON.stringify({ imageBase64: payloadImg, maskBase64: payloadMask });

  let res: Response;
  try {
    res = await fetch(`${cleanUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: bodyStr,
    });

    if (res.status === 405 || res.status === 404) {
      res = await fetch(`${cleanUrl}/inpaint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: bodyStr,
      });
    }
  } catch (networkErr: any) {
    throw new Error(`Không thể gửi dữ liệu tới máy chủ AI (${networkErr?.message || networkErr}). Vui lòng kiểm tra lại đường truyền hoặc link server.`);
  }

  if (res.ok) {
    const data = await res.json();
    if (data.cleanedImageBase64) {
      return data.cleanedImageBase64;
    }
    throw new Error('Máy chủ phản hồi thành công nhưng không tìm thấy dữ liệu ảnh trả về.');
  } else {
    const errText = await res.text();
    let friendlyErr = errText;
    try {
      const jsonErr = JSON.parse(errText);
      if (jsonErr?.error?.message === 'Method Not Allowed' || jsonErr?.message === 'Method Not Allowed') {
        friendlyErr = 'Máy chủ phản hồi "Method Not Allowed". Nếu dùng Hugging Face Space, vui lòng dùng link trực tiếp https://<user>-<space>.hf.space thay vì link web huggingface.co/spaces/... (Hệ thống đã tự động sửa link trong bảng Cài đặt Máy Chủ AI).';
      }
    } catch {}
    throw new Error(`Máy chủ báo lỗi HTTP ${res.status}: ${friendlyErr || res.statusText}`);
  }
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
    const cleanUrl = normalizeServerUrl(config.serverUrl);
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
