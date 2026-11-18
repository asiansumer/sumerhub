import { del, get, keys, set } from 'idb-keyval';
import type { Device, SplitRequest, SplitResponse } from '../../vocal-split/types';

/** 分离出来的两条：伴奏，和原唱的人声（跟唱时可以小声垫着）。都是 44.1 kHz 的 WAV。 */
export type Stems = { instrumental: Blob; vocals: Blob };
export type SplitEvent =
  | { kind: 'download'; loaded: number; total: number }
  | { kind: 'ready'; device: Device }
  | { kind: 'progress'; done: number; total: number };

const PREFIX = 'sing-along:stems:';
const KEEP = 5;
type Saved = Stems & { savedAt: number };

/** 文件内容的指纹：同一首歌再打开时，直接用上次分离好的伴奏。 */
export async function fingerprint(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** 读写失败（无痕模式、空间不够）都不影响使用，只是下次要重新分离。 */
export async function loadStems(id: string): Promise<Stems | null> {
  try {
    const saved = await get<Saved>(PREFIX + id);
    return saved?.instrumental && saved.vocals ? { instrumental: saved.instrumental, vocals: saved.vocals } : null;
  } catch { return null; }
}

export async function saveStems(id: string, stems: Stems): Promise<void> {
  try {
    await set(PREFIX + id, { ...stems, savedAt: Date.now() } satisfies Saved);
    // 只留最近的几首，一首大约占 80 MB。
    const mine = (await keys()).filter((key): key is string => typeof key === 'string' && key.startsWith(PREFIX));
    if (mine.length <= KEEP) return;
    const dated = await Promise.all(mine.map(async key => ({ key, savedAt: (await get<Saved>(key))?.savedAt ?? 0 })));
    dated.sort((a, b) => b.savedAt - a.savedAt);
    await Promise.all(dated.slice(KEEP).map(entry => del(entry.key)));
  } catch { /* 存不下就算了 */ }
}

/** 用「人声伴奏分离」的那个模型把伴奏分出来。返回取消函数和结果。 */
export function split(audio: AudioBuffer, onEvent: (event: SplitEvent) => void): { cancel: () => void; result: Promise<Stems> } {
  const worker = new Worker(new URL('../../vocal-split/split.worker.ts', import.meta.url), { type: 'module' });
  const id = crypto.randomUUID();
  const result = new Promise<Stems>((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<SplitResponse>) => {
      if (data.id !== id) return;
      if (data.kind === 'done') { worker.terminate(); resolve({ instrumental: data.stems.instrumental, vocals: data.stems.vocals }); }
      else if (data.kind === 'error') { worker.terminate(); reject(new Error(data.error)); }
      else onEvent(data);
    };
    worker.onerror = () => { worker.terminate(); reject(new Error('分离失败，可能是内存不够。')); };
  });
  const left = audio.getChannelData(0).slice(), right = audio.getChannelData(1).slice();
  const request: SplitRequest = { id, left, right };
  worker.postMessage(request, [left.buffer, right.buffer]);
  return { cancel: () => worker.terminate(), result };
}
