import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // ncmswift.xyz 旧版的地址，都带到 NCM 工具页。
  async redirects() {
    return ['/convert', '/machine', '/contact'].map(source => ({ source, destination: '/tools/ncm-to-mp3', permanent: false }));
  },
  webpack(config) {
    // Next compiles worker dependencies in both graphs. Always choose the browser backend.
    config.resolve.alias['taglib-wasm$'] = require.resolve('taglib-wasm').replace(/index\.js$/, 'index.browser.js');
    // TagLib's and Essentia's Emscripten loaders have unreachable Node branches in browsers.
    config.resolve.fallback = { ...config.resolve.fallback, module: false, fs: false, path: false, crypto: false };
    // ebur128-wasm（音频分析的响度测量）是以 ES 模块形式引入的 .wasm。
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.output.environment = { ...config.output.environment, asyncFunction: true };
    return config;
  },
};
export default nextConfig;
