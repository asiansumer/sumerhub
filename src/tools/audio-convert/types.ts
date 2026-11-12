export type Target = 'mp3' | 'wav' | 'flac' | 'm4a' | 'ogg';
export type Settings = {
  target: Target;
  /** 有损格式（MP3、M4A、OGG）的码率，kbps。 */
  bitrate: number;
  /** WAV 的位深。 */
  depth: 16 | 24;
};

export const targets: { value: Target; label: string; lossy: boolean }[] = [
  { value: 'mp3', label: 'MP3', lossy: true },
  { value: 'wav', label: 'WAV', lossy: false },
  { value: 'flac', label: 'FLAC', lossy: false },
  { value: 'm4a', label: 'M4A', lossy: true },
  { value: 'ogg', label: 'OGG', lossy: true },
];
export const bitrates = [128, 192, 256, 320];

/** 转换结果里除了文件本身以外的信息。 */
export type Converted = {
  /** 时长，秒。 */
  duration: number;
  sampleRate: number;
  channels: number;
  /** 原文件里音频的编码，例如 aac、mp3。 */
  sourceCodec: string;
  /** 原文件带不带画面。 */
  hadVideo: boolean;
  /** 音频原样取出，没有重新编码。 */
  copied: boolean;
};

export type ConvertRequest = { id: string; file: Blob; settings: Settings };
export type ConvertResponse =
  | { id: string; kind: 'progress'; progress: number }
  | { id: string; kind: 'done'; buffer: ArrayBuffer; mime: string; info: Converted }
  | { id: string; kind: 'error'; error: string };
