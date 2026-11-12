import type { Analysis } from './lib/analyze';

/** 文件自带的信息：标签、封面、编码参数。 */
export type FileInfo = {
  title?: string; artist?: string; album?: string; cover?: Blob;
  codec?: string; bitrate?: number; sampleRate?: number; channels?: number; bitsPerSample?: number; lossless?: boolean;
};

export type AnalyzeRequest =
  | { id: string; kind: 'info'; file: File }
  | { id: string; kind: 'analyze'; channels: Float32Array[]; sampleRate: number };

export type AnalyzeResponse =
  | { id: string; kind: 'info'; info: FileInfo }
  | { id: string; kind: 'analyze'; analysis: Analysis }
  | { id: string; kind: 'error'; error: string };
