/** 触发浏览器下载一个 blob URL。 */
export function saveUrl(url: string, name: string) {
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
}

/** 把一批文件打成 ZIP。文件本身已经压缩过，所以只打包不再压缩。 */
export async function zipFiles(files: { name: string; blob: Blob }[]) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, await file.blob.arrayBuffer());
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

/** 把一批文件打成 ZIP 并触发下载。 */
export async function downloadZip(files: { name: string; blob: Blob }[], zipName: string) {
  const url = URL.createObjectURL(await zipFiles(files));
  saveUrl(url, zipName);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
