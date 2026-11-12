import { env, pipeline, RawImage } from '@huggingface/transformers';
import type { Model } from '../types';

/**
 * 抠图：模型由 Transformers.js（Apache-2.0）的 background-removal 流程来跑，
 * 预处理、推理、把遮罩贴回原图都是它做的，这里只负责告诉它模型在哪、用显卡还是 CPU。
 */

/** 模型文件放在自己的站点上（public/models/ 下面，构建时由 scripts/fetch-assets.mjs 取来），不依赖别的网站。 */
const FOLDERS: Record<Model, string> = { general: 'remove-bg', fine: 'remove-bg-fine' };
/** 模型文件的大小（字节），和 scripts/fetch-assets.mjs 取来的文件一致。 */
const BYTES: Record<Model, number> = { general: 98484532, fine: 88152708 };
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
// ONNX Runtime 的 wasm 也从自己的站点取（默认是从 jsDelivr 取）。用哪个版本的文件仍由 Transformers.js 决定。
const wasm = env.backends.onnx?.wasm;
if (wasm && wasm.wasmPaths && typeof wasm.wasmPaths === 'object') {
  const paths = wasm.wasmPaths as { mjs?: string; wasm?: string };
  for (const key of ['mjs', 'wasm'] as const) if (paths[key]) paths[key] = '/vendor/ort/' + paths[key]!.split('/').pop();
}

// 网站的服务器会压缩着发模型文件，这时响应里没有 Content-Length。Transformers.js 不知道总大小，
// 就报不出下载进度，而且每收到一小块都要重新分配一整块内存，很慢。这里把已知的大小补回去。
const plainFetch = env.fetch;
env.fetch = async (input: string | URL, init?: RequestInit) => {
  const path = new URL(String(input), self.location.href).pathname;
  const model = (Object.keys(FOLDERS) as Model[]).find(key => path === `/models/${FOLDERS[key]}/onnx/model_fp16.onnx`);
  if (!model) return plainFetch(input, init);
  // 模型下载后由 Transformers.js 自己存进浏览器（Cache Storage），不用再进一遍 HTTP 缓存：
  // 近百 MB 又不带长度的响应，浏览器的 HTTP 缓存可能写不下，连带着让这次下载失败。
  const response: Response = await plainFetch(input, { ...init, cache: 'no-store' });
  if (response.status !== 200 || !response.body || response.headers.get('content-length')) return response;
  const headers = new Headers(response.headers);
  headers.set('content-length', String(BYTES[model]));
  headers.delete('content-encoding'); // 拿到手的已经是解压后的内容
  return new Response(response.body, { status: 200, statusText: response.statusText, headers });
};

export type Device = 'webgpu' | 'wasm';
type Remover = ((image: RawImage) => Promise<RawImage | RawImage[]>) & { dispose?: () => Promise<unknown> };
type Loaded = { model: Model; device: Device; ready: Promise<Remover> };
/** 同一时间只留一个模型在内存里，换模型时先把旧的放掉。 */
let loaded: Loaded | null = null;

/** 有能用的显卡就用 WebGPU，快很多；没有（或者显卡不支持半精度）就用 CPU（WebAssembly）。 */
async function pickDevice(): Promise<Device> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = gpu && await gpu.requestAdapter();
    if (adapter && adapter.features.has('shader-f16')) return 'webgpu';
  } catch { /* 用 CPU */ }
  return 'wasm';
}

type Progress = (loaded: number, total: number) => void;
function create(model: Model, device: Device, onModel: Progress): Loaded {
  const progress = (event: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (event.status === 'progress' && event.file?.endsWith('.onnx') && event.total) onModel(event.loaded ?? 0, event.total);
  };
  const ready = pipeline('background-removal', FOLDERS[model], { device, dtype: 'fp16', progress_callback: progress }) as unknown as Promise<Remover>;
  return { model, device, ready };
}
const release = (entry: Loaded) => entry.ready.then(remover => remover.dispose?.()).then(() => {}, () => {});

/** 交给模型的图最长边不超过这么多像素。模型内部只按 512 或 1024 算，再大也没有用，只是白占内存。 */
const WORK_SIDE = 2048;
/** 页面上卡片里显示的小图最长边。 */
const PREVIEW_SIDE = 720;

async function run(image: RawImage, model: Model, onModel: Progress): Promise<RawImage> {
  if (loaded && loaded.model !== model) { const previous = loaded; loaded = null; await release(previous); }
  loaded ??= create(model, await pickDevice(), onModel);
  let result: RawImage | RawImage[];
  try {
    result = await (await loaded.ready)(image);
  } catch (error) {
    const failed = loaded; loaded = null;
    if (failed) await release(failed);
    if (failed?.device !== 'webgpu') throw error;
    // 显卡上没跑成（常见原因是显存不够）：换成 CPU 再来一次。
    console.warn('WebGPU 抠图失败，改用 CPU', error);
    loaded = create(model, 'wasm', onModel);
    try { result = await (await loaded.ready)(image); }
    catch (again) { const broken = loaded; loaded = null; if (broken) await release(broken); throw again; }
  }
  return Array.isArray(result) ? result[0] : result;
}

const context = (canvas: OffscreenCanvas) => {
  const made = canvas.getContext('2d');
  if (!made) throw new Error('浏览器不支持处理这张图片');
  made.imageSmoothingQuality = 'high';
  return made;
};

/**
 * 去掉背景，返回带透明通道的 PNG（原图尺寸）、一张卡片上用的小图，以及这次是用显卡还是 CPU 算的。
 *
 * 手机拍的照片有两千万到五千万像素，整张交给 Transformers.js 的话，它会在内存里留好几份完整的像素。
 * 所以这里只把缩小后的图交给模型，拿到遮罩后再用画布贴回原图：原图全程只有浏览器解码的那一份和输出的那一份。
 */
export async function removeBackground(image: Blob, model: Model, onModel: Progress) {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, WORK_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    const work = new OffscreenCanvas(w, h), small = context(work);
    small.drawImage(bitmap, 0, 0, w, h);
    const cut = await run(new RawImage(small.getImageData(0, 0, w, h).data, w, h, 4), model, onModel);
    if (cut.width !== w || cut.height !== h || cut.channels !== 4) throw new Error('抠图结果的尺寸不对');
    // 模型给回来的是同样大小、带透明度的图。原图不比它大时，它就是结果；否则把它当遮罩贴到原图上。
    small.putImageData(new ImageData(new Uint8ClampedArray(cut.data), w, h), 0, 0);
    let full = work;
    if (scale < 1) {
      full = new OffscreenCanvas(width, height);
      const large = context(full);
      large.drawImage(bitmap, 0, 0);
      large.globalCompositeOperation = 'destination-in';
      large.drawImage(work, 0, 0, width, height);
    }
    const cutout = await full.convertToBlob({ type: 'image/png' });
    const shrink = Math.min(1, PREVIEW_SIDE / Math.max(width, height));
    let preview = cutout;
    if (shrink < 1) {
      const thumb = new OffscreenCanvas(Math.max(1, Math.round(width * shrink)), Math.max(1, Math.round(height * shrink)));
      context(thumb).drawImage(full, 0, 0, thumb.width, thumb.height);
      preview = await thumb.convertToBlob({ type: 'image/png' });
    }
    return { cutout, preview, width, height, device: loaded!.device };
  } finally { bitmap.close(); }
}
