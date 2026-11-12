import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // ncmswift.xyz 旧版的地址，都带到 NCM 工具页。
  async redirects() {
    return ['/convert', '/machine', '/contact'].map(source => ({ source, destination: '/tools/ncm-to-mp3', permanent: false }));
  },
  webpack(config) {
    // Next compiles worker dependencies in both graphs. Always choose the browser backend.
    config.resolve.alias['taglib-wasm$'] = require.resolve('taglib-wasm').replace(/index\.js$/, 'index.browser.js');
    // TagLib's Emscripten loader has an unreachable Node branch in browsers.
    config.resolve.fallback = { ...config.resolve.fallback, module: false };
    // Transformers.js（抠图）在浏览器里用不到这两个只给 Node 用的包。
    config.resolve.alias['sharp$'] = false;
    config.resolve.alias['onnxruntime-node$'] = false;
    // ebur128-wasm（音频分析的响度测量）是以 ES 模块形式引入的 .wasm。
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.output.environment = { ...config.output.environment, asyncFunction: true };
    return config;
  },
};
export default nextConfig;
