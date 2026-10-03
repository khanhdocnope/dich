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
