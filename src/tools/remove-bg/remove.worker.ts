import type { CutRequest, CutResponse } from './types';

const post = (message: CutResponse) => self.postMessage(message);

self.onmessage = async ({ data }: MessageEvent<CutRequest>) => {
  try {
    // 运行库很大，等真的要抠图时再加载。
    const { removeBackground } = await import('./lib/engine');
    let last = 0;
    const { cutout, width, height, device } = await removeBackground(data.image, data.model, (loaded, total) => {
      const now = performance.now();
      if (loaded < total && now - last < 150) return;
      last = now;
      post({ kind: 'model', loaded, total });
    });
    post({ kind: 'done', id: data.id, cutout, width, height, device });
  } catch (error) {
    console.error(error);
    const text = error instanceof Error ? error.message : String(error);
    const unreadable = /decode|InvalidStateError|could not be decoded|Unsupported image/i.test(text);
    post({ kind: 'error', id: data.id, error: unreadable ? '无法读取这张图片' : /fetch|network|404|Failed to load/i.test(text) ? '模型没下载下来，检查网络后重试' : '抠图失败，图片可能太大' });
  }
};
