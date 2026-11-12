import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfJs = typeof import('pdfjs-dist');
let library: Promise<PdfJs> | undefined;

/** pdf.js 只在用到时加载；legacy 版本兼容旧一些的浏览器。 */
function load() {
  return library ??= (import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as Promise<PdfJs>).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
    return pdfjs;
  });
}

/** 打开一个 PDF，用来数页数和画缩略图。打不开时抛出给用户看的原因。 */
export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await load();
  let document: PDFDocumentProxy;
  try {
    // 没有内嵌字体的中文 PDF 要靠 cMap 和标准字体才能画对。
    document = await pdfjs.getDocument({ data, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/' }).promise;
  } catch (error) {
    throw new Error((error as Error)?.name === 'PasswordException' ? '带密码保护，去掉密码后再试' : '读不出来，可能不是 PDF 或者已经损坏');
  }
  // 有些文件不用密码就能看，但仍然是加密的，pdf-lib 改不了。
  const { info } = await document.getMetadata().catch(() => ({ info: {} as Record<string, unknown> }));
  if ((info as Record<string, unknown>).EncryptFilterName) { void document.destroy(); throw new Error('带密码保护，去掉密码后再试'); }
  return document;
}

/** 把某一页画成缩略图，返回一个 blob URL（用完要 revoke）。 */
export async function renderThumbnail(source: PDFDocumentProxy, index: number, width = 320) {
  const page = await source.getPage(index + 1);
  const viewport = page.getViewport({ scale: width / Math.max(page.getViewport({ scale: 1 }).width, page.getViewport({ scale: 1 }).height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false })!;
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('缩略图生成失败');
  return URL.createObjectURL(blob);
}
