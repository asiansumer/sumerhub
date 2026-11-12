import { TagLib } from 'taglib-wasm';
import type { AnalyzeRequest, AnalyzeResponse, FileInfo } from './types';

let library: Promise<TagLib> | undefined;

/** 标签和编码参数直接从文件头读，不需要解码音频。读不出来也不影响分析。 */
async function readInfo(file: File): Promise<FileInfo> {
  try {
    const handle = await (await (library ??= TagLib.initialize())).open(new Uint8Array(await file.arrayBuffer()), { partial: false });
    try {
      const tags = handle.properties(), audio = handle.audioProperties();
      const pictures = handle.getPictures(), picture = pictures.find(item => item.type === 'FrontCover') ?? pictures[0];
      return {
        title: tags.title?.[0], artist: tags.artist?.join(', '), album: tags.album?.[0],
        cover: picture ? new Blob([new Uint8Array(picture.data)], { type: picture.mimeType }) : undefined,
        codec: audio?.codec, bitrate: audio?.bitrate, sampleRate: audio?.sampleRate, channels: audio?.channels,
        bitsPerSample: audio?.bitsPerSample, lossless: audio?.isLossless,
      };
    } finally { handle.dispose(); }
  } catch { return {}; }
}

self.onmessage = async ({ data }: MessageEvent<AnalyzeRequest>) => {
  let response: AnalyzeResponse;
  try {
    if (data.kind === 'info') response = { id: data.id, kind: 'info', info: await readInfo(data.file) };
    else {
      // 分析用到的 .wasm 模块要异步加载。放在这里按需引入，线程一启动就能接收消息，不会漏掉第一条。
      const { analyze } = await import('./lib/analyze');
      response = { id: data.id, kind: 'analyze', analysis: await analyze(data.channels, data.sampleRate) };
    }
  } catch (error) {
    response = { id: data.id, kind: 'error', error: error instanceof Error ? error.message : '分析失败，请重试' };
  }
  self.postMessage(response);
};
