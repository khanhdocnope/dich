import { Bubble, TextStyle } from '../types';

export const defaultTextStyle: TextStyle = {
  fontFamily: "'Nunito', 'Be Vietnam Pro', sans-serif",
  fontSize: 18,
  autoFontSize: true,
  fontWeight: '700',
  color: '#000000',
  strokeColor: '#ffffff',
  strokeWidth: 4,
  backgroundColor: '#ffffff',
  backgroundOpacity: 0, // 0 = Transparent by default, can toggle 1 for solid white
  borderRadius: 16,
  boxPadding: 8,
  boxBorderColor: '#000000',
  boxBorderWidth: 0,
  boxPreset: 'transparent',
  textAlign: 'center',
  lineHeight: 1.25,
  letterSpacing: 0.5,
  orientation: 'horizontal',
  isBold: true,
  isItalic: false,
  textTransform: 'none',
};

// Word wrap algorithm for canvas text
export const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
};

// Auto calculate optimal font size to fit inside width & height
export const calculateOptimalFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  fontFamily: string,
  padding: number = 8,
  maxFontSize: number = 42,
  minFontSize: number = 9
): { fontSize: number; lines: string[] } => {
  const targetW = Math.max(10, width - padding * 2);
  const targetH = Math.max(10, height - padding * 2);

  for (let size = maxFontSize; size >= minFontSize; size -= 1) {
    ctx.font = `bold ${size}px ${fontFamily}`;
    const lines = wrapText(ctx, text, targetW);
    const totalH = lines.length * (size * 1.25);

    if (totalH <= targetH) {
      let maxLineWidth = 0;
      for (const l of lines) {
        const w = ctx.measureText(l).width;
        if (w > maxLineWidth) maxLineWidth = w;
      }
      if (maxLineWidth <= targetW) {
        return { fontSize: size, lines };
      }
    }
  }

  ctx.font = `bold ${minFontSize}px ${fontFamily}`;
  const lines = wrapText(ctx, text, targetW);
  return { fontSize: minFontSize, lines };
};

// Render a single bubble on canvas (Background Fill + Box Border + Typeset Text)
export const renderBubbleOnCanvas = (
  ctx: CanvasRenderingContext2D,
  bubble: Bubble
) => {
  const { x, y, width, height, translatedText, style } = bubble;

  ctx.save();
  ctx.translate(x, y);

  if (bubble.rotation) {
    ctx.rotate((bubble.rotation * Math.PI) / 180);
  }

  const radius = Math.min(style.borderRadius ?? 16, width / 2, height / 2);

  // 1. Draw Background Fill if opacity > 0
  if (style.backgroundColor && style.backgroundOpacity > 0) {
    ctx.save();
    ctx.fillStyle = style.backgroundColor;
    ctx.globalAlpha = style.backgroundOpacity;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(0, 0, width, height, radius);
    } else {
      ctx.rect(0, 0, width, height);
    }
    ctx.fill();

    // 2. Draw Box Border Stroke if specified
    if (style.boxBorderWidth > 0 && style.boxBorderColor) {
      ctx.lineWidth = style.boxBorderWidth;
      ctx.strokeStyle = style.boxBorderColor;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Render Text
  if (!translatedText || !translatedText.trim()) {
    ctx.restore();
    return;
  }

  let textToRender = translatedText;
  if (style.textTransform === 'uppercase') textToRender = textToRender.toUpperCase();
  else if (style.textTransform === 'capitalize') {
    textToRender = textToRender.replace(/\b\w/g, (l) => l.toUpperCase());
  }

  const padding = style.boxPadding ?? 8;
  const targetW = Math.max(10, width - padding * 2);

  let finalFontSize = style.fontSize;
  let lines: string[] = [];

  if (style.autoFontSize) {
    const calc = calculateOptimalFontSize(ctx, textToRender, width, height, style.fontFamily, padding);
    finalFontSize = calc.fontSize;
    lines = calc.lines;
  } else {
    const fontWeightStr = style.isBold ? 'bold ' : '';
    const fontStyleStr = style.isItalic ? 'italic ' : '';
    ctx.font = `${fontStyleStr}${fontWeightStr}${finalFontSize}px ${style.fontFamily}`;
    lines = wrapText(ctx, textToRender, targetW);
  }

  const fontStyleStr = style.isItalic ? 'italic ' : '';
  const fontWeightStr = style.isBold ? 'bold ' : '';
  ctx.font = `${fontStyleStr}${fontWeightStr}${finalFontSize}px ${style.fontFamily}`;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = 'middle';

  const lineHeight = finalFontSize * (style.lineHeight || 1.25);
  const totalTextHeight = lines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2 + lineHeight / 2;

  let textX = width / 2;
  if (style.textAlign === 'left') textX = padding + 4;
  if (style.textAlign === 'right') textX = width - padding - 4;

  // Render each line with stroke + text fill
  lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight;

    if (style.strokeWidth > 0 && style.strokeColor) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line, textX, lineY);
    }

    ctx.fillStyle = style.color || '#000000';
    ctx.fillText(line, textX, lineY);
  });

  ctx.restore();
};
