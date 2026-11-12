import { decimate } from './fft.ts';
import { estimateKey, type Key } from './key.ts';
import { measureLoudness } from './loudness.ts';
import { estimateTempo, type Tempo } from './tempo.ts';

export type Analysis = {
  duration: number;
  tempo: Tempo | null;
  key: Key | null;
  lufs: number | null;
  peak: number | null;
  /** 画波形用：每一格的音量峰值，0–1。 */
  waveform: number[];
};

const WAVEFORM_BARS = 180;
/** 太长的音频只分析中间这一段，足够判断速度和调性。 */
const MAX_SECONDS = 480;

export function waveformPeaks(channels: Float32Array[], bars = WAVEFORM_BARS) {
  const length = channels[0]?.length ?? 0, size = length / bars, output: number[] = [];
  let loudest = 0;
  for (let bar = 0; bar < bars; bar++) {
    const start = Math.floor(bar * size), end = Math.max(start + 1, Math.floor((bar + 1) * size));
    // 均方根比单纯的峰值更接近听感上的起伏。
    let sum = 0, count = 0;
    for (const channel of channels) for (let i = start; i < end && i < length; i += 4) { sum += channel[i] * channel[i]; count++; }
    const value = count ? Math.sqrt(sum / count) : 0;
    output.push(value); if (value > loudest) loudest = value;
  }
  return output.map(value => loudest ? Math.round(value / loudest * 1000) / 1000 : 0);
}

export async function analyze(channels: Float32Array[], sampleRate: number): Promise<Analysis> {
  const length = channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  const limit = Math.floor(MAX_SECONDS * sampleRate), start = length > limit ? Math.floor((length - limit) / 2) : 0;
  const excerpt = length > limit ? mono.subarray(start, start + limit) : mono;
  const reduced = decimate(excerpt, sampleRate);
  return {
    duration: length / sampleRate,
    tempo: await estimateTempo(excerpt, sampleRate),
    key: estimateKey(reduced.samples, reduced.sampleRate),
    ...measureLoudness(channels, sampleRate),
    waveform: waveformPeaks(channels),
  };
}
