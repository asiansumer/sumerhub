declare module 'demucs-web' {
  type Track = { left: Float32Array; right: Float32Array };
  export class DemucsProcessor {
    constructor(options: { ort: unknown; sessionOptions?: Record<string, unknown>; onProgress?: (info: { progress: number; currentSegment: number; totalSegments: number }) => void });
    onProgress: (info: { progress: number; currentSegment: number; totalSegments: number }) => void;
    loadModel(pathOrBuffer?: string | ArrayBuffer): Promise<unknown>;
    separate(left: Float32Array, right: Float32Array): Promise<{ drums: Track; bass: Track; other: Track; vocals: Track }>;
  }
}
