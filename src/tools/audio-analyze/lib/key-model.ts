import * as ort from 'onnxruntime-web/wasm';
import type { KeyModel } from './key';

/**
 * 调性模型：MusicalKeyCNN 训练好的卷积网络（MIT），连同前面的 CQT 频谱一起打包成一个 ONNX 文件，
 * 用 ONNX Runtime 在浏览器里运行。文件由 scripts/keynet/export_onnx.py 生成。
 */
const MODEL_URL = '/models/keynet/keynet.onnx';

let session: Promise<ort.InferenceSession> | undefined;

function load() {
  // 多线程需要页面开启跨源隔离，这里用单线程就够快了。
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: new URL('onnxruntime-web/ort-wasm-simd-threaded.wasm', import.meta.url).href };
  return ort.InferenceSession.create(new URL(MODEL_URL, self.location.origin).href, { executionProviders: ['wasm'] });
}

export const keyModel: KeyModel = async audio => {
  session ??= load();
  let ready: ort.InferenceSession;
  // 没加载成功（比如断网）就清掉，下一首再试。
  try { ready = await session; } catch (error) { session = undefined; throw error; }
  const { probs } = await ready.run({ audio: new ort.Tensor('float32', audio, [1, audio.length]) });
  return probs.data as Float32Array;
};
