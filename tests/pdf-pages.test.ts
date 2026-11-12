import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { imageToPdf, jpegOrientation, mergePages, splitPages } from '../src/tools/pdf-pages/lib/pdf.ts';

/** 一份测试用的 PDF：每页宽度不同（200、210、220…），方便认出是哪一页。 */
async function sample(pages: number, base = 200, rotation = 0) {
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = document.addPage([base + i * 10, 400]);
    page.drawText(`page ${i + 1}`, { x: 20, y: 200, size: 18, font });
    if (rotation) page.setRotation(degrees(rotation));
  }
  return document.save();
}
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map(page => Math.round(page.getWidth()));
const rotations = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map(page => page.getRotation().angle);

/** 最小的 PNG：纯色，RGB，不带透明。 */
function png(width: number, height: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (data: Buffer) => { let c = 0xffffffff; for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

test('merges pages from several files in the given order', async () => {
  const sources = [{ id: 'a', bytes: await sample(3, 200) }, { id: 'b', bytes: await sample(2, 300) }];
  const merged = await mergePages(sources, [
    { source: 'b', index: 1, rotate: 0 }, { source: 'a', index: 0, rotate: 0 }, { source: 'a', index: 2, rotate: 0 }, { source: 'b', index: 0, rotate: 0 }, { source: 'a', index: 1, rotate: 0 },
  ]);
  assert.deepEqual(await widths(merged), [310, 200, 220, 300, 210]);
});

test('extracts a subset and leaves out deleted pages', async () => {
  const sources = [{ id: 'a', bytes: await sample(5) }];
  assert.deepEqual(await widths(await mergePages(sources, [{ source: 'a', index: 1, rotate: 0 }, { source: 'a', index: 3, rotate: 0 }])), [210, 230]);
});

test('rotation is added to the rotation a page already has', async () => {
  const sources = [{ id: 'a', bytes: await sample(4, 200, 90) }];
  const merged = await mergePages(sources, [0, 90, 180, 270].map((rotate, index) => ({ source: 'a', index, rotate })));
  assert.deepEqual(await rotations(merged), [90, 180, 270, 0]);
});

test('splits into one file per page and reports progress', async () => {
  const sources = [{ id: 'a', bytes: await sample(2, 200) }, { id: 'b', bytes: await sample(1, 300) }];
  const seen: number[] = [];
  const files = await splitPages(sources, [{ source: 'a', index: 1, rotate: 90 }, { source: 'b', index: 0, rotate: 0 }, { source: 'a', index: 0, rotate: 0 }], done => seen.push(done));
  assert.equal(files.length, 3);
  assert.deepEqual(await Promise.all(files.map(widths)), [[210], [300], [200]]);
  assert.deepEqual(await rotations(files[0]), [90]);
  assert.deepEqual(seen, [1, 2, 3]);
});

test('the same page can appear twice', async () => {
  const sources = [{ id: 'a', bytes: await sample(2) }];
  assert.deepEqual(await widths(await mergePages(sources, [{ source: 'a', index: 0, rotate: 0 }, { source: 'a', index: 0, rotate: 0 }])), [200, 200]);
});

test('rejects empty plans, unknown files and pages that do not exist', async () => {
  const sources = [{ id: 'a', bytes: await sample(2) }];
  await assert.rejects(mergePages(sources, []), /没有要导出的页面/);
  await assert.rejects(mergePages(sources, [{ source: 'a', index: 2, rotate: 0 }]), /找不到/);
  await assert.rejects(mergePages(sources, [{ source: 'missing', index: 0, rotate: 0 }]), /找不到/);
  await assert.rejects(mergePages([{ id: 'a', bytes: new Uint8Array([1, 2, 3]) }], [{ source: 'a', index: 0, rotate: 0 }]));
});

test('an image becomes one page as wide as A4, keeping its proportions', async () => {
  const portrait = await PDFDocument.load(await imageToPdf(png(30, 60), 'png'));
  assert.equal(portrait.getPageCount(), 1);
  assert.deepEqual([Math.round(portrait.getPage(0).getWidth()), Math.round(portrait.getPage(0).getHeight())], [595, 1191]);
  const landscape = await PDFDocument.load(await imageToPdf(png(80, 40), 'png'));
  assert.deepEqual([Math.round(landscape.getPage(0).getWidth()), Math.round(landscape.getPage(0).getHeight())], [842, 421]);
  // 图片页可以和普通页合在一起。
  const merged = await mergePages([{ id: 'p', bytes: await imageToPdf(png(30, 60), 'png') }, { id: 'a', bytes: await sample(1) }], [{ source: 'a', index: 0, rotate: 0 }, { source: 'p', index: 0, rotate: 0 }]);
  assert.deepEqual(await widths(merged), [200, 595]);
});

test('reads the EXIF orientation of a JPEG', () => {
  const exif = (orientation: number, little: boolean) => {
    const tiff = Buffer.alloc(26);
    tiff.write(little ? 'II' : 'MM', 0);
    const u16 = (value: number, at: number) => little ? tiff.writeUInt16LE(value, at) : tiff.writeUInt16BE(value, at);
    const u32 = (value: number, at: number) => little ? tiff.writeUInt32LE(value, at) : tiff.writeUInt32BE(value, at);
    u16(42, 2); u32(8, 4); u16(1, 8); u16(0x0112, 10); u16(3, 12); u32(1, 14); u16(orientation, 18);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]), length = Buffer.alloc(2);
    length.writeUInt16BE(body.length + 2);
    // 前面放一个 APP0 段，确认会跳过无关的段。
    return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xe1]), length, body, Buffer.from([0xff, 0xda, 0x00, 0x02])]));
  };
  assert.equal(jpegOrientation(exif(6, true)), 6);
  assert.equal(jpegOrientation(exif(8, false)), 8);
  assert.equal(jpegOrientation(exif(1, false)), 1);
  assert.equal(jpegOrientation(exif(0, true)), 1);
  assert.equal(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])), 1);
  assert.equal(jpegOrientation(png(2, 2)), 1);
  assert.equal(jpegOrientation(new Uint8Array(0)), 1);
});
