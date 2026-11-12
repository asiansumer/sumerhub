import { env, pipeline, type RawImage } from '@huggingface/transformers';
import type { Model } from '../types';

/**
 * 抠图：模型由 Transformers.js（Apache-2.0）的 background-removal 流程来跑，
 * 预处理、推理、把遮罩贴回原图都是它做的，这里只负责告诉它模型在哪、用显卡还是 CPU。
 */

/** 模型文件放在自己的站点上（public/models/ 下面，构建时由 scripts/fetch-assets.mjs 取来），不依赖别的网站。 */
const FOLDERS: Record<Model, string> = { general: 'remove-bg', fine: 'remove-bg-fine' };
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
// ONNX Runtime 的 wasm 也从自己的站点取（默认是从 jsDelivr 取）。用哪个版本的文件仍由 Transformers.js 决定。
const wasm = env.backends.onnx?.wasm;
if (wasm && wasm.wasmPaths && typeof wasm.wasmPaths === 'object') {
  const paths = wasm.wasmPaths as { mjs?: string; wasm?: string };
  for (const key of ['mjs', 'wasm'] as const) if (paths[key]) paths[key] = '/vendor/ort/' + paths[key]!.split('/').pop();
}

export type Device = 'webgpu' | 'wasm';
type Remover = ((image: Blob) => Promise<RawImage | RawImage[]>) & { dispose?: () => Promise<unknown> };
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

/** 去掉背景，返回带透明通道的 PNG，以及这次是用显卡还是 CPU 算的。 */
export async function removeBackground(image: Blob, model: Model, onModel: Progress) {
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
  const cutout = Array.isArray(result) ? result[0] : result;
  return { cutout: await cutout.toBlob('image/png') as Blob, width: cutout.width, height: cutout.height, device: loaded.device };
}
