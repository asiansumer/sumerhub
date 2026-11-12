import {
  ALL_FORMATS, BlobSource, BufferTarget, Conversion, FlacOutputFormat, Input, Mp3OutputFormat, Mp4OutputFormat, OggOutputFormat, Output, Quality,
  WavOutputFormat, canEncodeAudio, type AudioCodec, type ConversionAudioOptions, type InputAudioTrack, type MetadataTags, type OutputFormat,
} from 'mediabunny';
import type { Converted, Settings, Target } from '../types.ts';

/**
 * 音频转换：读文件、解码、编码、封装都交给 Mediabunny（MPL-2.0）。
 * 浏览器自己不会编码的格式用它官方的扩展：MP3 用 LAME，AAC 用 FFmpeg 的编码器，FLAC 用 libFLAC。
 */

const CODEC_NAMES: Partial<Record<AudioCodec, string>> = { aac: 'AAC', mp3: 'MP3', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', ac3: 'AC-3', eac3: 'E-AC-3', dts: 'DTS', truehd: 'TrueHD' };
/** 给人看的编码名字。 */
export const codecName = (codec: string) => CODEC_NAMES[codec as AudioCodec] ?? (codec.startsWith('pcm') || codec === 'ulaw' || codec === 'alaw' ? 'PCM' : codec.toUpperCase());

function plan(target: Target, depth: 16 | 24): { codec: AudioCodec; format: () => OutputFormat; mime: string } {
  switch (target) {
    case 'mp3': return { codec: 'mp3', format: () => new Mp3OutputFormat(), mime: 'audio/mpeg' };
    case 'wav': return { codec: depth === 24 ? 'pcm-s24' : 'pcm-s16', format: () => new WavOutputFormat(), mime: 'audio/wav' };
    case 'flac': return { codec: 'flac', format: () => new FlacOutputFormat(), mime: 'audio/flac' };
    case 'm4a': return { codec: 'aac', format: () => new Mp4OutputFormat(), mime: 'audio/mp4' };
    case 'ogg': return { codec: 'opus', format: () => new OggOutputFormat(), mime: 'audio/ogg' };
  }
}

const registered = new Set<AudioCodec>();
/** 浏览器不会编码时，换上扩展里的编码器。每种只装一次。 */
async function ensureEncoder(codec: AudioCodec) {
  if (registered.has(codec) || !['mp3', 'aac', 'flac'].includes(codec)) return;
  registered.add(codec);
  if (await canEncodeAudio(codec)) return;
  if (codec === 'mp3') (await import('@mediabunny/mp3-encoder')).registerMp3Encoder();
  else if (codec === 'aac') (await import('@mediabunny/aac-encoder')).registerAacEncoder();
  else (await import('@mediabunny/flac-encoder')).registerFlacEncoder();
}

const LOSSY_SOURCES = ['mp3', 'aac', 'opus', 'vorbis', 'ac3', 'eac3', 'dts'];
/**
 * FLAC 的位深跟着原文件走：原来是 16 位（或者本来就是有损格式）就写 16 位，更高的写 24 位。
 * 不这样做的话，MP3 转出来的 FLAC 也会是 24 位，白白大一半。
 */
async function flacSampleFormat(track: InputAudioTrack, sourceCodec: string): Promise<'s16' | 's32'> {
  if (LOSSY_SOURCES.includes(sourceCodec) || /^(pcm-(s16|u8|s8)|ulaw|alaw)/.test(sourceCodec)) return 's16';
  if (sourceCodec !== 'flac') return 's32';
  // 原文件是 FLAC：位深写在流头（fLaC + 块头 + STREAMINFO）的第 20、21 个字节里。
  const description = (await track.getDecoderConfig().catch(() => null))?.description;
  if (!description) return 's32';
  const bytes = ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description as ArrayBuffer);
  if (bytes.length < 22 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'fLaC') return 's32';
  return (((bytes[20] & 1) << 4) | (bytes[21] >> 4)) + 1 <= 16 ? 's16' : 's32';
}

/** 有些 WAV 里的标签其实是 UTF-8，却被当成 Latin-1 读出来，变成乱码；能还原就还原。 */
function repair(text: string) {
  if (!/[\u0080-\u00ff]/.test(text) || /[^\u0000-\u00ff]/.test(text)) return text;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(text, char => char.charCodeAt(0))); }
  catch { return text; }
}
/** 标题、歌手、封面这些通用标签带过去；各格式私有的原始标签不带，免得封面被写两遍。 */
export function cleanTags(tags: MetadataTags): MetadataTags {
  return Object.fromEntries(Object.entries(tags).filter(([key]) => key !== 'raw').map(([key, value]) => [key, typeof value === 'string' ? repair(value) : value]));
}

/** 可以直接给用户看的错误。 */
export class ConvertError extends Error { name = 'ConvertError'; }

export type ConvertResult = { buffer: ArrayBuffer; mime: string; info: Converted };

export async function convertAudio(file: Blob, settings: Settings, onProgress?: (progress: number) => void): Promise<ConvertResult> {
  const { codec, format, mime } = plan(settings.target, settings.depth);
  const lossy = codec === 'mp3' || codec === 'aac' || codec === 'opus';
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    let track;
    try { track = await input.getPrimaryAudioTrack(); }
    catch { throw new ConvertError('读不出来，可能不是音频或视频文件'); }
    if (!track) throw new ConvertError('这个文件里没有声音');
    const sourceCodec = await track.getCodec();
    if (!sourceCodec) throw new ConvertError('不认识这个文件里的音频编码');
    const [sampleRate, channels, hadVideo] = await Promise.all([track.getSampleRate(), track.getNumberOfChannels(), input.getPrimaryVideoTrack().then(Boolean, () => false)]);
    await ensureEncoder(codec);
    const sampleFormat = codec === 'flac' ? await flacSampleFormat(track, sourceCodec) : undefined;

    // 原文件已经是目标编码、码率也不比选的高时，直接把音频原样取出来：不损失音质，也快得多。
    let copy = sourceCodec === codec && lossy;
    if (copy) {
      const stats = await track.computePacketStats(400).catch(() => null);
      if (stats && stats.averageBitrate > settings.bitrate * 1000 * 1.1) copy = false;
    }

    // 只留声音时，整体时间挪动一点没有关系，所以允许挪动（shiftTolerance），这样带编码延迟的 MP3、AAC 也能原样取出。
    const run = async (copying: boolean) => {
      const output = new Output({ format: format(), target: new BufferTarget() });
      const audio: ConversionAudioOptions = copying ? {} : { codec, forceTranscode: true, ...(sampleFormat && { sampleFormat }), ...(lossy && { quality: new Quality({ bitrate: settings.bitrate * 1000 }) }) };
      const conversion = await Conversion.init({ input, output, tracks: 'primary', video: { discard: true }, audio, tags: cleanTags, copy: copying ? { mode: 'forced', shiftTolerance: Infinity } : false, showWarnings: false });
      if (!conversion.isValid) return conversion.discardedTracks.find(({ track: discarded }) => discarded.type === 'audio')?.reason ?? 'invalid';
      if (onProgress) conversion.onProgress = progress => onProgress(progress);
      await conversion.execute();
      return output.target.buffer;
    };

    let result = await run(copy);
    if (copy && typeof result === 'string') { copy = false; result = await run(false); }
    if (typeof result === 'string' || !result) {
      if (result === 'undecodable_source_codec') throw new ConvertError(`这个浏览器解不了 ${codecName(sourceCodec)}，换 Chrome 试试`);
      if (result === 'no_encodable_target_codec') throw new ConvertError(`这个浏览器不能输出 ${settings.target.toUpperCase()}，换一种格式或换 Chrome 试试`);
      throw new ConvertError('转换失败');
    }
    return { buffer: result, mime, info: { duration: await input.computeDuration([track]), sampleRate, channels, sourceCodec, hadVideo, copied: copy } };
  } finally {
    input.dispose();
  }
}
