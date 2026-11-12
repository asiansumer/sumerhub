import type { ConvertRequest, ConvertResponse } from './types';

const post = (response: ConvertResponse, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(response, transfer);

self.onmessage = async ({ data }: MessageEvent<ConvertRequest>) => {
  const { id } = data;
  try {
    // 转换库按需引入，线程一启动就能接收消息。
    const { convertAudio } = await import('./lib/convert');
    let last = 0;
    const { buffer, mime, info } = await convertAudio(data.file, data.settings, progress => {
      // 进度不用报得太密。
      const now = Date.now();
      if (now - last > 100) { last = now; post({ id, kind: 'progress', progress }); }
    });
    post({ id, kind: 'done', buffer, mime, info }, [buffer]);
  } catch (error) {
    // 只有自己写的提示才给用户看，库里的英文报错换成一句通用的话。
    const known = error instanceof Error && error.name === 'ConvertError';
    post({ id, kind: 'error', error: known ? (error as Error).message : '转换失败，文件可能已损坏' });
  }
};
