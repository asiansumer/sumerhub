import encodeJpeg from '@jsquash/jpeg/encode';
import encodeWebp from '@jsquash/webp/encode';
import UPNG from 'upng-js';
import { pngColors, targetFormat, type CompressRequest, type CompressResponse } from './types';

const mime = { jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' } as const;

async function compress({ id, blob, sourceType, settings }: CompressRequest): Promise<CompressResponse> {
  const bitmap = await createImageBitmap(blob);
  const scale = settings.maxSide > 0 ? Math.min(1, settings.maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const format = targetFormat(sourceType, settings.format);

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器不支持在后台处理图片');
  // JPG 没有透明通道，先铺白底。
  if (format === 'jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, width, height);

  let buffer: ArrayBuffer;
  if (format === 'jpeg') buffer = await encodeJpeg(pixels, { quality: settings.quality });
  else if (format === 'webp') buffer = await encodeWebp(pixels, { quality: settings.quality });
  else buffer = UPNG.encode([pixels.data.buffer as ArrayBuffer], width, height, pngColors(settings.quality));

  // 没改格式也没缩小、结果反而更大时，原图就是最好的，直接还给用户。
  const sameFormat = mime[format] === sourceType;
  if (sameFormat && scale === 1 && buffer.byteLength >= blob.size) return { id, ok: true, blob, format, width, height, kept: true };
  return { id, ok: true, blob: new Blob([buffer], { type: mime[format] }), format, width, height, kept: false };
}

self.onmessage = async ({ data }: MessageEvent<CompressRequest>) => {
  let response: CompressResponse;
  try { response = await compress(data); }
  catch (error) {
    const unreadable = error instanceof DOMException && error.name === 'InvalidStateError';
    response = { id: data.id, ok: false, error: unreadable ? '无法读取这张图片' : error instanceof Error ? error.message : '压缩失败' };
  }
  self.postMessage(response);
};
