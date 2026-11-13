// 构建前把抠图要用的大文件放进 public/：模型（从 Hugging Face 按固定版本下载并核对 sha256）
// 和 ONNX Runtime 的 wasm（从 node_modules 复制）。这些文件太大，不放进 git。
// 已经在位且校验通过的文件会跳过，所以只有第一次慢。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const models = [
  {
    // 通用：BiRefNet_lite 的 512×512 导出版（MIT）
    folder: 'public/models/remove-bg',
    base: 'https://huggingface.co/studioludens/birefnet-lite-512/resolve/962e67969ec6acec9c19fab76acee4f5e22e990c/',
    files: {
      'config.json': '561965f7aa366c48b95ab1c24220d59a718df4025c2ecb359dd5736ceb49e912',
      'preprocessor_config.json': 'a79663b311d8404dfb329f7b45bc9f970a0c155aeedae8ac15b6b77d76789613',
      'onnx/model_fp16.onnx': 'eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516',
    },
  },
  {
    // 镂空细节：ISNet general-use（MIT）
    folder: 'public/models/remove-bg-fine',
    base: 'https://huggingface.co/imgly/isnet-general-onnx/resolve/440dea96dd4a3b06bbbf5abec3e26569dd7ec49f/',
    files: {
      'config.json': 'd0b94ab052ace79177085c66a00a3f014a973edb09999cb0108bb01e65ded060',
      'preprocessor_config.json': '7f6ea1f0aa49cdc77487e172f3dd67820a842512b4a203b14ffadfb8bd027d40',
      'onnx/model_fp16.onnx': '2eb4b5dda7ec41c617e59706e5aafa1f978c9a5f983d2518d9f0ae4d6eb04f20',
    },
  },
];

async function sha256(file) {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function download(url, target, expected) {
  if (fs.existsSync(target) && await sha256(target) === expected) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = target + '.part';
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
      const actual = await sha256(partial);
      if (actual !== expected) throw new Error(`sha256 不对：${actual}`);
      fs.renameSync(partial, target);
      return true;
    } catch (error) {
      fs.rmSync(partial, { force: true });
      if (attempt === 4) throw new Error(`下载失败 ${url}：${error.message}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

for (const { folder, base, files } of models) {
  for (const [name, expected] of Object.entries(files)) {
    const fetched = await download(base + name, path.join(root, folder, name), expected);
    console.log(`${fetched ? '已下载' : '已就位'} ${folder}/${name}`);
  }
}

// ONNX Runtime 的 wasm：必须和 Transformers.js 自己带的那一版一致，所以优先取它目录下的。
const ort = [
  'node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist',
  'node_modules/onnxruntime-web/dist',
].map(dir => path.join(root, dir)).find(dir => fs.existsSync(dir));
if (!ort) throw new Error('找不到 onnxruntime-web，先运行 npm ci');
const vendor = path.join(root, 'public/vendor/ort');
fs.mkdirSync(vendor, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  fs.copyFileSync(path.join(ort, name), path.join(vendor, name));
}
console.log('已就位 public/vendor/ort');

// 人声伴奏分离用的是顶层的 onnxruntime-web（WebGPU 版），它的 wasm 单独放一份，版本和 JS 一致。
const ortWeb = path.join(root, 'public/vendor/ort-web');
fs.mkdirSync(ortWeb, { recursive: true });
for (const name of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
  fs.copyFileSync(path.join(root, 'node_modules/onnxruntime-web/dist', name), path.join(ortWeb, name));
}
console.log('已就位 public/vendor/ort-web');

// 二维码识别（zxing-wasm）的 wasm：从 node_modules 复制，版本和 JS 一致。
const zxing = path.join(root, 'public/vendor/zxing');
fs.mkdirSync(zxing, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'), path.join(zxing, 'zxing_reader.wasm'));
console.log('已就位 public/vendor/zxing');
