import { fill, outputFormat, type Settings } from '../types';

/** 把抠好的透明图按设置铺上背景色、存成选好的格式。透明 PNG 就是抠图结果本身。 */
export async function compose(cutout: Blob, settings: Settings): Promise<Blob> {
  const color = fill(settings), format = outputFormat(settings);
  if (!color && format === 'png') return cutout;
  const bitmap = await createImageBitmap(cutout);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持处理这张图片');
    if (color) { context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('图片太大，浏览器存不下来');
    return blob;
  } finally { bitmap.close(); }
}

/**
 * 卡片上显示用的小图（最长边 720）。页面只显示小图，不让浏览器为了显示去解码几千万像素的原图。
 * 浏览器解不了这张图时会抛错：Safari 自己能解 HEIC，Chrome 和 Firefox 不能。
 */
export async function thumbnail(image: Blob, side = 720): Promise<Blob> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器不支持处理这张图片');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // 原图可能本来就带透明（PNG、WebP），所以存成 PNG。
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('浏览器不支持处理这张图片');
    return blob;
  } finally { bitmap.close(); }
}
