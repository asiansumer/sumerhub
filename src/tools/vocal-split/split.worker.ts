import type { Device, SplitRequest, SplitResponse, Stem } from './types';

/**
 * 人声伴奏分离：模型和前后处理来自 timcsy/demucs-web（MIT），用 ONNX Runtime Web 运行。
 * 有显卡加速（WebGPU）就用，没有或者失败了退回 CPU（wasm，单线程，很慢）。
 */
const RATE = 44100;
const post = (message: SplitResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(message, transfer);

type Processor = { separate(left: Float32Array, right: Float32Array): Promise<Record<'drums' | 'bass' | 'other' | 'vocals', { left: Float32Array; right: Float32Array }>>; onProgress: (info: { currentSegment: number; totalSegments: number }) => void };
let ready: { processor: Processor; device: Device } | null = null;
let modelBytes: ArrayBuffer | null = null;

async function hasWebGpu() {
  try { return Boolean(await (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter()); }
  catch { return false; }
}

async function create(device: Device, id: string) {
  const [ort, { DemucsProcessor }, { loadModelBytes }] = await Promise.all([import('onnxruntime-web/webgpu'), import('demucs-web'), import('./lib/model')]);
  ort.env.wasm.wasmPaths = '/vendor/ort-web/';
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  modelBytes ??= await loadModelBytes((loaded, total) => post({ kind: 'download', id, loaded, total }));
  const processor = new DemucsProcessor({ ort, sessionOptions: { executionProviders: [device] } });
  await processor.loadModel(modelBytes);
  return processor as unknown as Processor;
}

async function prepare(id: string) {
  if (ready) return ready;
  let device: Device = await hasWebGpu() ? 'webgpu' : 'wasm';
  let processor: Processor;
  try { processor = await create(device, id); }
  catch (error) {
    if (device !== 'webgpu') throw error;
    device = 'wasm';
    processor = await create(device, id);
  }
  modelBytes = null;
  return ready = { processor, device };
}

self.onmessage = async ({ data }: MessageEvent<SplitRequest>) => {
  const { id, left, right } = data;
  try {
    const { encodeWav } = await import('./lib/wav');
    let { processor, device } = await prepare(id);
    post({ kind: 'ready', id, device });
    const started = performance.now();
    processor.onProgress = ({ currentSegment, totalSegments }) => post({ kind: 'progress', id, done: currentSegment, total: totalSegments });
    let result;
    try { result = await processor.separate(left, right); }
    catch (error) {
      // 显卡跑到一半出错（显存不够等），换 CPU 重来一遍。
      if (device !== 'webgpu') throw error;
      ready = null;
      processor = await create('wasm', id); device = 'wasm'; ready = { processor, device };
      post({ kind: 'ready', id, device });
      processor.onProgress = ({ currentSegment, totalSegments }) => post({ kind: 'progress', id, done: currentSegment, total: totalSegments });
      result = await processor.separate(left, right);
    }
    // 伴奏 = 原曲减去人声，这样人声和伴奏加起来正好是原曲。
    const instLeft = new Float32Array(left.length), instRight = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) { instLeft[i] = left[i] - result.vocals.left[i]; instRight[i] = right[i] - result.vocals.right[i]; }
    const stems = {
      vocals: encodeWav(result.vocals.left, result.vocals.right, RATE),
      instrumental: encodeWav(instLeft, instRight, RATE),
      drums: encodeWav(result.drums.left, result.drums.right, RATE),
      bass: encodeWav(result.bass.left, result.bass.right, RATE),
      other: encodeWav(result.other.left, result.other.right, RATE),
    } satisfies Record<Stem, Blob>;
    post({ kind: 'done', id, device, seconds: (performance.now() - started) / 1000, stems });
  } catch (error) {
    console.error(error);
    const text = error instanceof Error ? error.message : String(error);
    post({ kind: 'error', id, error: /模型/.test(text) ? text : /fetch|network|load/i.test(text) ? '模型下载失败，请检查网络后重试' : '分离失败，可能是内存不够。可以换一首短一点的试试' });
  }
};
