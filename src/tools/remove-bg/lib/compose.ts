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
