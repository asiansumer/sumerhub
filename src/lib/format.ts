/** 文件大小：小于 1 MB 用 KB，否则用 MB。 */
export function formatSize(bytes: number) {
  return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + ' MB';
}

/** 去掉文件名里不能用的字符，并保证同一批里不重名。 */
export function uniqueFileName(stem: string, extension: string, used: Set<string>) {
  const clean = stem.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').trim().slice(0, 160) || 'file';
  let candidate = `${clean}.${extension}`, i = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${clean} (${i++}).${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}
