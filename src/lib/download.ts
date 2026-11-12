/** 把一批文件打成 ZIP 并触发下载。文件本身已经压缩过，所以只打包不再压缩。 */
export async function downloadZip(files: { name: string; blob: Blob }[], zipName: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, await file.blob.arrayBuffer());
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = zipName;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
