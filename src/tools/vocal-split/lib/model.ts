/**
 * Demucs v4（HTDemucs）的 ONNX 模型，来自 timcsy/demucs-web。固定在一个版本上，直接从 Hugging Face 取：
 * 文件有 180 MB，下过一次就存在浏览器的缓存里，以后不用再下。
 */
export const MODEL_URL = 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d/htdemucs_embedded.onnx';
export const MODEL_BYTES = 180534758;
const CACHE = 'sumerhub-vocal-split-v1';

export async function loadModelBytes(onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(MODEL_URL);
  if (hit) {
    const bytes = await hit.arrayBuffer();
    if (bytes.byteLength === MODEL_BYTES) return bytes;
    await cache!.delete(MODEL_URL);
  }
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) throw new Error(`模型下载失败（${response.status}）`);
  const bytes = new Uint8Array(MODEL_BYTES);
  const reader = response.body.getReader();
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.length > MODEL_BYTES) throw new Error('模型文件大小不对');
    bytes.set(value, loaded); loaded += value.length;
    onProgress(loaded, MODEL_BYTES);
  }
  if (loaded !== MODEL_BYTES) throw new Error('模型没有下载完整，请重试');
  // 存进缓存失败（空间不够、无痕模式）不影响这一次使用。
  await cache?.put(MODEL_URL, new Response(bytes.slice(), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(MODEL_BYTES) } })).catch(() => {});
  return bytes.buffer;
}
