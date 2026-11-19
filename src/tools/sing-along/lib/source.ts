/** 打开用户放进来的歌：普通音频直接用，.ncm 先解开（和「NCM 转 MP3」是同一段解码）。 */
export type Source = {
  /** 可以直接解码播放的音频。 */
  blob: Blob;
  fileName: string;
  title: string;
  artist?: string;
  /** .ncm 文件里自带的网易云歌曲 id，有它就不用再贴链接。 */
  musicId?: string;
};

export const RATE = 44100;
export const MAX_FILE_SIZE = 300 * 1024 * 1024;
export const MAX_SECONDS = 12 * 60;

type Unlocked = { data: ArrayBuffer; format: 'mp3' | 'flac'; title?: string; artist?: string; musicId?: string };

function unlockNcm(buffer: ArrayBuffer): Promise<Unlocked> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../ncm-to-mp3/worker/convert.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { worker.terminate(); if (data.kind === 'error') reject(new Error(data.error)); else resolve(data.result); };
    worker.onerror = () => { worker.terminate(); reject(new Error('无法读取这个 NCM 文件')); };
    worker.postMessage({ kind: 'unlock', buffer }, [buffer]);
  });
}

export async function openSource(file: File): Promise<Source> {
  const stem = file.name.replace(/\.[^.]+$/, '');
  if (!/\.ncm$/i.test(file.name)) return { blob: file, fileName: file.name, title: stem };
  const unlocked = await unlockNcm(await file.arrayBuffer());
  return {
    blob: new Blob([unlocked.data], { type: unlocked.format === 'mp3' ? 'audio/mpeg' : 'audio/flac' }),
    fileName: file.name, title: unlocked.title || stem, artist: unlocked.artist, musicId: unlocked.musicId,
  };
}

/** 解码成 44.1 kHz 的立体声。整个录音台都用这一个采样率，伴奏、录音、导出的文件才能对齐。 */
export async function decode(blob: Blob): Promise<AudioBuffer> {
  const decoded = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(await blob.arrayBuffer());
  if (decoded.numberOfChannels === 2) return decoded;
  const stereo = new AudioBuffer({ numberOfChannels: 2, length: decoded.length, sampleRate: RATE });
  stereo.copyToChannel(decoded.getChannelData(0), 0);
  stereo.copyToChannel(decoded.getChannelData(decoded.numberOfChannels > 1 ? 1 : 0), 1);
  return stereo;
}
