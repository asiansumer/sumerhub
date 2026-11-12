import { PDFDocument, degrees } from 'pdf-lib';

/** 输出里的一页：来自哪个文件的第几页（从 0 数），再顺时针转多少度。 */
export type PagePlan = { source: string; index: number; rotate: number };
export type PdfSource = { id: string; bytes: Uint8Array | ArrayBuffer };

/** A4 纸的短边和长边，单位是点（1/72 英寸）。 */
const A4_SHORT = 595.28, A4_LONG = 841.89;

async function open(sources: PdfSource[], pages: PagePlan[]) {
  const needed = new Set(pages.map(page => page.source)), documents = new Map<string, PDFDocument>();
  for (const { id, bytes } of sources) if (needed.has(id)) documents.set(id, await PDFDocument.load(bytes));
  for (const { source, index } of pages) {
    const document = documents.get(source);
    if (!document || index < 0 || index >= document.getPageCount()) throw new Error('找不到要导出的页面');
  }
  return documents;
}

async function assemble(documents: Map<string, PDFDocument>, pages: PagePlan[]) {
  const output = await PDFDocument.create();
  // 同一个文件的页一次拷过去，共用的字体、图片只会带一份。
  const copies = new Map<PagePlan, Awaited<ReturnType<PDFDocument['copyPages']>>[number]>();
  for (const [id, document] of documents) {
    const wanted = pages.filter(page => page.source === id);
    if (!wanted.length) continue;
    const copied = await output.copyPages(document, wanted.map(page => page.index));
    wanted.forEach((page, position) => copies.set(page, copied[position]));
  }
  for (const plan of pages) {
    const page = copies.get(plan)!;
    if (plan.rotate % 360) page.setRotation(degrees((page.getRotation().angle + plan.rotate) % 360));
    output.addPage(page);
  }
  return output.save();
}

/** 按给定顺序把页面拼成一个 PDF。 */
export async function mergePages(sources: PdfSource[], pages: PagePlan[]) {
  if (!pages.length) throw new Error('没有要导出的页面');
  return assemble(await open(sources, pages), pages);
}

/** 每一页单独存成一个 PDF。 */
export async function splitPages(sources: PdfSource[], pages: PagePlan[], onProgress?: (done: number) => void) {
  if (!pages.length) throw new Error('没有要导出的页面');
  const documents = await open(sources, pages), output: Uint8Array[] = [];
  for (const page of pages) {
    output.push(await assemble(new Map([[page.source, documents.get(page.source)!]]), [page]));
    onProgress?.(output.length);
  }
  return output;
}

/** 把一张 JPG 或 PNG 做成单页 PDF。纸面宽度取 A4，高度跟着图片比例走，四周不留白。 */
export async function imageToPdf(bytes: Uint8Array | ArrayBuffer, type: 'jpeg' | 'png') {
  const document = await PDFDocument.create();
  const image = type === 'jpeg' ? await document.embedJpg(bytes) : await document.embedPng(bytes);
  const width = image.width >= image.height ? A4_LONG : A4_SHORT, height = width * image.height / image.width;
  document.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  return document.save();
}

/** JPG 里 EXIF 记录的拍摄方向（1–8）；1 或没有记录表示不用转。 */
export function jpegOrientation(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  for (let offset = 2; offset + 4 <= view.byteLength;) {
    const marker = view.getUint16(offset), size = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    // APP1 段里以 "Exif\0\0" 开头的才是 EXIF。
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10, end = Math.min(view.byteLength, offset + 2 + size);
      if (tiff + 8 > end) return 1;
      const little = view.getUint16(tiff) === 0x4949, directory = tiff + view.getUint32(tiff + 4, little);
      if (directory + 2 > end) return 1;
      const count = view.getUint16(directory, little);
      for (let i = 0; i < count; i++) {
        const entry = directory + 2 + i * 12;
        if (entry + 12 > end) return 1;
        if (view.getUint16(entry, little) === 0x0112) { const value = view.getUint16(entry + 8, little); return value >= 1 && value <= 8 ? value : 1; }
      }
      return 1;
    }
    offset += 2 + size;
  }
  return 1;
}
