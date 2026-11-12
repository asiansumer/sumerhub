import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';

/** 浏览器里用的 Essentia 实例。体积不小（约 2.5 MB），只在分析音频时才加载。 */
export const essentia = new Essentia(EssentiaWASM);
