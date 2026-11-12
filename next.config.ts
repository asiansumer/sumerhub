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
    return config;
  },
};
export default nextConfig;
