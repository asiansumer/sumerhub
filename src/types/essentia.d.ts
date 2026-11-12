declare module 'essentia.js/dist/essentia.js-core.es.js' {
  export default class Essentia {
    constructor(wasm: unknown);
    arrayToVector(samples: Float32Array): { delete(): void };
    KeyExtractor(signal: unknown): { key: string; scale: string; strength: number };
  }
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: unknown;
}
