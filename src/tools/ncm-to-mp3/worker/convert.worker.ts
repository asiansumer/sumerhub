import { decodeNcm, type AudioMetadata } from '../lib/ncm/decode';
import { restoreMetadata } from '../lib/ncm/metadata';
import { encodeMp3 } from '../lib/ncm/encode';
import { fetchArtwork } from '../lib/ncm/artwork';

type Request = { kind: 'decode'; buffer: ArrayBuffer; fallbackTitle: string } | { kind: 'unlock'; buffer: ArrayBuffer } | { kind: 'encode'; channels: Int16Array[]; sampleRate: number; metadata: AudioMetadata };
self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    // 只解出音频和文件里自带的信息，不补标签也不联网（跟唱录音用）。
    if (data.kind === 'unlock') {
      const { data: audio, format, metadata } = decodeNcm(data.buffer);
      const result = { data: audio, format, title: metadata.title, artist: metadata.artist, musicId: metadata.musicId };
      self.postMessage({ kind: 'done', result }, { transfer: [audio] });
      return;
    }
    if (data.kind === 'decode') {
      const result = await restoreMetadata(decodeNcm(data.buffer), data.fallbackTitle, fetchArtwork);
      self.postMessage({ kind: 'done', result }, { transfer: [result.data] });
      return;
    }
    const result = await encodeMp3(data.channels, data.sampleRate, data.metadata, progress => self.postMessage({ kind: 'progress', progress }));
    self.postMessage({ kind: 'done', result });
  } catch (error) {
    self.postMessage({ kind: 'error', error: error instanceof Error ? error.message : '转换失败，请重试' });
  }
};
