import { Bubble, ColabConfig } from '../types';
import { defaultTextStyle } from './typesettingEngine';

export const checkColabHealth = async (serverUrl: string): Promise<{ online: boolean; gpuName?: string }> => {
  try {
    const cleanUrl = serverUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/health`, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
    });
    if (res.ok) {
      const data = await res.json();
      return { online: true, gpuName: data.gpu || data.gpu_name || data.device };
    }
    return { online: false };
  } catch (error) {
    return { online: false };
  }
};

const ensureBase64 = async (urlOrBase64: string): Promise<string> => {
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

export const inpaintImageWithLaMa = async (
  serverUrl: string,
  imageBase64: string,
  maskBase64: string
): Promise<string> => {
  const cleanUrl = serverUrl.replace(/\/+$/, '');

  if (serverUrl) {
    try {
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
      } else {
        const errText = await res.text().catch(() => '');
        console.error('Colab inpaint server error:', res.status, errText);
        alert(`⚠️ Server AI LaMa báo lỗi (${res.status}): ${errText || 'Không thể xử lý'}`);
      }
    } catch (e: any) {
      console.error('Colab Inpaint connection failed:', e);
      alert(`⚠️ Không thể kết nối đến Colab AI Server: ${e.message || 'Lỗi mạng'}\n👉 Vui lòng kiểm tra lại link Server URL ở nút "Colab GPU".`);
    }
  } else {
    alert('⚠️ Bạn chưa kết nối Colab AI Server!\n👉 Hãy bấm vào nút "Colab GPU" ở trên thanh công cụ, mở Google Colab và dán URL vào để mô hình LaMa tái tạo tranh.');
  }

  // If server unavailable, return original image intact (do NOT fill white!)
  return imageBase64;
};


export const ocrBubbles = async (
  config: ColabConfig,
  imageBase64: string,
  bubbles: Bubble[]
): Promise<Bubble[]> => {
  const cleanUrl = config.serverUrl.replace(/\/+$/, '');

  if (config.connected && config.serverUrl) {
    try {
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
      console.warn('Colab OCR failed, using fallback:', e);
    }
  }

  // Fallback demo texts
  const sampleJapanese = [
    'これは何ですか！？',
    '待って、本当に行くの？',
    '信じられない…',
    'よし、やってみよう！',
    '早く逃げろ！',
    '大丈夫、私に任せて。',
  ];

  return bubbles.map((b, idx) => ({
    ...b,
    originalText: b.originalText || sampleJapanese[idx % sampleJapanese.length],
  }));
};

export const translateBubbles = async (
  config: ColabConfig,
  bubbles: Bubble[]
): Promise<Bubble[]> => {
  const texts = bubbles.map((b) => b.originalText);
  const cleanUrl = config.serverUrl.replace(/\/+$/, '');

  if (config.connected && config.serverUrl) {
    try {
      const res = await fetch(`${cleanUrl}/api/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          texts,
          targetLang: config.targetLang || 'vi',
          engine: config.engineMode === 'gemini' ? 'gemini' : 'google',
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
      console.warn('Colab translation failed, using fallback:', e);
    }
  }

  // Fallback sample Vietnamese translations
  const sampleTranslations: { [key: string]: string } = {
    'これは何ですか！？': 'Cái quái gì thế này!?',
    '待って、本当に行くの？': 'Khoan đã, cậu thật sự muốn đi sao?',
    '信じられない…': 'Không thể tin được...',
    'よし、やってみよう！': 'Được rồi, thử xem sao!',
    '早く逃げろ！': 'Chạy nhanh lên!',
    '大丈夫、私に任せて。': 'Đừng lo, cứ để đó cho tôi.',
  };

  return bubbles.map((b) => ({
    ...b,
    translatedText: sampleTranslations[b.originalText] || b.translatedText || `[Dịch: ${b.originalText}]`,
  }));
};

/**
 * ⚡ 1-Click Auto Pipeline: Automatically detect speech bubbles, extract text, and translate to Vietnamese
 */
export const detectAndTranslatePageAuto = async (
  config: ColabConfig,
  rawImageUrl: string,
  imgWidth: number,
  imgHeight: number
): Promise<Bubble[]> => {
  const payloadImg = await ensureBase64(rawImageUrl);

  // 1. Try Gemini Vision API directly if API key exists or engine is gemini
  const apiKey = config.geminiApiKey || '';
  if (apiKey && apiKey.length > 10) {
    try {
      const cleanB64 = payloadImg.includes(',') ? payloadImg.split(',')[1] : payloadImg;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this manga/comic page image.
Detect all speech bubbles, thought bubbles, dialogue boxes, and text balloons.
For every bubble, output its bounding box [ymin, xmin, ymax, xmax] on a 0 to 1000 normalized scale, its original text, and a natural Vietnamese translation.
Return ONLY valid JSON array:
[
  {
    "box_2d": [ymin, xmin, ymax, xmax],
    "originalText": "Japanese/English text",
    "translatedText": "Vietnamese translated dialogue"
  }
]`,
                },
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: cleanB64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            response_mime_type: 'application/json',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) {
          const parsed = JSON.parse(rawJsonText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item: any, idx: number): Bubble => {
              const [ymin, xmin, ymax, xmax] = item.box_2d || [100, 100, 250, 350];
              const x = Math.round((xmin / 1000) * imgWidth);
              const y = Math.round((ymin / 1000) * imgHeight);
              const width = Math.max(40, Math.round(((xmax - xmin) / 1000) * imgWidth));
              const height = Math.max(30, Math.round(((ymax - ymin) / 1000) * imgHeight));

              return {
                id: `auto_bubble_${Date.now()}_${idx}`,
                x,
                y,
                width,
                height,
                originalText: item.originalText || '',
                translatedText: item.translatedText || item.originalText || '',
                style: { ...defaultTextStyle },
                isInpainted: false,
              };
            });
          }
        }
      }
    } catch (err) {
      console.warn('Gemini auto detection failed, trying next method:', err);
    }
  }

  // 2. Try Colab Server Auto Detection if connected
  if (config.connected && config.serverUrl) {
    try {
      const cleanUrl = config.serverUrl.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/api/detect_and_translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          imageBase64: payloadImg,
          targetLang: config.targetLang || 'vi',
          apiKey: config.geminiApiKey || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.bubbles && Array.isArray(data.bubbles) && data.bubbles.length > 0) {
          return data.bubbles.map((b: any, idx: number): Bubble => ({
            id: b.id || `auto_colab_${Date.now()}_${idx}`,
            x: Math.round(b.x || 100),
            y: Math.round(b.y || 100),
            width: Math.round(b.width || 180),
            height: Math.round(b.height || 100),
            originalText: b.originalText || '',
            translatedText: b.translatedText || '',
            style: { ...defaultTextStyle },
            isInpainted: false,
          }));
        }
      }
    } catch (e) {
      console.warn('Colab auto detection failed:', e);
    }
  }

  // 3. If neither Gemini nor Colab detected bubbles, return empty array cleanly
  return [];
};

