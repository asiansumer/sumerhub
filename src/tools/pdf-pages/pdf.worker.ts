import { imageToPdf, mergePages, splitPages } from './lib/pdf';
import type { PdfRequest, PdfResponse } from './types';

/** pdf-lib 给的 Uint8Array 可能只占缓冲区的一部分，切成独立的一块再传回去。 */
const detach = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

function explain(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  if (/encrypt/i.test(text)) return '有文件带密码保护，去掉密码后再试';
  if (/[一-龥]/.test(text)) return text;
  return '有文件读不出来，可能已经损坏';
}

self.onmessage = async ({ data }: MessageEvent<PdfRequest>) => {
  const post = (response: PdfResponse, transfer: Transferable[] = []) => self.postMessage(response, { transfer });
  try {
    if (data.kind === 'image') {
      const bytes = detach(await imageToPdf(data.bytes, data.type));
      post({ id: data.id, kind: 'image', bytes }, [bytes]);
    } else {
      const files = data.mode === 'single'
        ? [detach(await mergePages(data.sources, data.pages))]
        : (await splitPages(data.sources, data.pages, done => post({ id: data.id, kind: 'progress', done }))).map(detach);
      post({ id: data.id, kind: 'build', files }, files);
    }
  } catch (error) {
    post({ id: data.id, kind: 'error', error: explain(error) });
  }
};
