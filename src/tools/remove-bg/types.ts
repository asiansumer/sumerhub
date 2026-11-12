export type Background = 'transparent' | 'white' | 'black' | 'custom';
export type OutputFormat = 'png' | 'jpeg';
/** general：BiRefNet-lite，人、动物、物品都稳。fine：ISNet，自行车、栏杆这类镂空的细结构更好。 */
export type Model = 'general' | 'fine';
export type Settings = { model: Model; background: Background; color: string; format: OutputFormat };

export const models: { value: Model; label: string }[] = [{ value: 'general', label: '通用' }, { value: 'fine', label: '镂空细节' }];

export const backgrounds: { value: Background; label: string }[] = [
  { value: 'transparent', label: '透明' }, { value: 'white', label: '白色' }, { value: 'black', label: '黑色' }, { value: 'custom', label: '自选' },
];
export const extensions = { png: 'png', jpeg: 'jpg' } as const;

/** 背景色；透明时是 null。 */
export function fill({ background, color }: Settings) {
  return background === 'transparent' ? null : background === 'white' ? '#ffffff' : background === 'black' ? '#000000' : color;
}
/** 透明背景只能存成 PNG。 */
export function outputFormat(settings: Settings): OutputFormat {
  return settings.background === 'transparent' ? 'png' : settings.format;
}

export type CutRequest = { id: string; image: Blob; model: Model };
export type CutResponse =
  /** 模型下载进度（字节）。只在第一次用时出现。 */
  | { kind: 'model'; loaded: number; total: number }
  /** device：这张是用显卡（webgpu）还是 CPU（wasm）算的。 */
  | { kind: 'done'; id: string; cutout: Blob; width: number; height: number; device: 'webgpu' | 'wasm' }
  | { kind: 'error'; id: string; error: string };
