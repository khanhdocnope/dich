import { Bubble, ColabConfig } from '../types';

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

export const inpaintImageWithLaMa = async (
  serverUrl: string,
  imageBase64: string,
  maskBase64: string
): Promise<string> => {
  const cleanUrl = serverUrl.replace(/\/+$/, '');

  if (serverUrl) {
    try {
      const res = await fetch(`${cleanUrl}/api/inpaint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ imageBase64, maskBase64 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cleanedImageBase64) {
          return data.cleanedImageBase64;
        }
      }
    } catch (e) {
      console.warn('Colab Inpaint failed, falling back to local simulation:', e);
    }
  }

  // Fallback: Client-side clean (overlay white/soft fill on masked regions)
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(imageBase64);

      ctx.drawImage(img, 0, 0);

      const maskImg = new Image();
      maskImg.crossOrigin = 'anonymous';
      maskImg.onload = () => {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;
        const maskCtx = maskCanvas.getContext('2d');
        if (!maskCtx) return resolve(canvas.toDataURL('image/png'));

        maskCtx.drawImage(maskImg, 0, 0);
        const maskData = maskCtx.getImageData(0, 0, img.width, img.height);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);

        // Fill white/background average on mask pixels
        for (let i = 0; i < maskData.data.length; i += 4) {
          if (maskData.data[i] > 128) {
            imgData.data[i] = 255;
            imgData.data[i + 1] = 255;
            imgData.data[i + 2] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      maskImg.src = maskBase64;
    };
    img.src = imageBase64;
  });
};

export const ocrBubbles = async (
  config: ColabConfig,
  imageBase64: string,
  bubbles: Bubble[]
): Promise<Bubble[]> => {
  const cleanUrl = config.serverUrl.replace(/\/+$/, '');

  if (config.connected && config.serverUrl) {
    try {
      const res = await fetch(`${cleanUrl}/api/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          imageBase64,
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
