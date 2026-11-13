export const STEMS = ['vocals', 'instrumental', 'drums', 'bass', 'other'] as const;
export type Stem = (typeof STEMS)[number];
export type Device = 'webgpu' | 'wasm';

export type SplitRequest = { id: string; left: Float32Array; right: Float32Array };

export type SplitResponse =
  /** 模型下载进度（字节）。已经缓存过就不会出现。 */
  | { kind: 'download'; id: string; loaded: number; total: number }
  /** 模型就绪，开始分离。device：用显卡（webgpu）还是 CPU（wasm）。 */
  | { kind: 'ready'; id: string; device: Device }
  | { kind: 'progress'; id: string; done: number; total: number }
  | { kind: 'done'; id: string; device: Device; seconds: number; stems: Record<Stem, Blob> }
  | { kind: 'error'; id: string; error: string };
