export type OutputFormat = 'keep' | 'jpeg' | 'webp' | 'png';
export type Settings = { format: OutputFormat; quality: number; maxSide: number };

export type CompressRequest = { id: string; blob: Blob; sourceType: string; settings: Settings };
export type CompressResponse =
  | { id: string; ok: true; blob: Blob; format: 'jpeg' | 'webp' | 'png'; width: number; height: number; kept: boolean }
  | { id: string; ok: false; error: string };

export const extensions = { jpeg: 'jpg', webp: 'webp', png: 'png' } as const;

/** 「原格式」时：JPG、PNG、WebP 保持不变，其他格式（HEIC、GIF、BMP 等）转成 JPG。 */
export function targetFormat(sourceType: string, format: OutputFormat): 'jpeg' | 'webp' | 'png' {
  if (format !== 'keep') return format;
  if (sourceType === 'image/png') return 'png';
  if (sourceType === 'image/webp') return 'webp';
  return 'jpeg';
}

/** PNG 没有「质量」，用调色板颜色数代替：质量越低颜色越少，90 以上无损。 */
export function pngColors(quality: number) {
  if (quality >= 90) return 0;
  if (quality >= 60) return 256;
  if (quality >= 30) return 128;
  return 64;
}
