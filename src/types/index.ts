export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  autoFontSize: boolean;
  fontWeight: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string; // e.g. '#ffffff' or 'transparent'
  backgroundOpacity: number; // 0 to 1
  borderRadius: number; // 0 to 50 px
  boxPadding: number; // 0 to 30 px
  boxBorderColor: string; // e.g. '#000000'
  boxBorderWidth: number; // 0 to 10 px
  boxPreset: 'transparent' | 'white' | 'black' | 'custom';
  textAlign: 'center' | 'left' | 'right';
  lineHeight: number;
  letterSpacing: number;
  orientation: 'horizontal' | 'vertical';
  isBold: boolean;
  isItalic: boolean;
  textTransform: 'none' | 'uppercase' | 'capitalize';
}

export interface Bubble {
  id: string;
  x: number; // in image pixels
  y: number;
  width: number;
  height: number;
  rotation?: number;
  originalText: string;
  translatedText: string;
  style: TextStyle;
  isInpainted: boolean;
}

export interface PageItem {
  filename: string;
  rawUrl: string;
  outputUrl: string | null;
  status: 'raw' | 'in_progress' | 'done';
  metadata?: {
    bubbles: Bubble[];
    cleanedImageBase64?: string;
    lastUpdated?: string;
  } | null;
}

export type EngineMode = 'gemini' | 'uncensored' | 'mock';

export interface ColabConfig {
  serverUrl: string;
  geminiApiKey: string;
  connected: boolean;
  gpuName?: string;
  engineMode: EngineMode;
  targetLang: string;
}

export interface OutputFolderConfig {
  customFolderName: string; // e.g. "MangaTranslator/Chapter_01"
  autoDownloadSingle: boolean;
  directoryHandleName?: string | null;
}

