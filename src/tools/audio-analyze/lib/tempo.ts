import { analyzeChannelData } from 'realtime-bpm-analyzer/node';

export type Tempo = {
  bpm: number;
  /** 0–1，节拍有多规整。 */
  confidence: number;
  /** 快一倍或慢一倍的读法。 */
  alternatives: number[];
};

/** 低于这个值基本就是没有节拍（噪声、环境音大约 0.03）。 */
const MIN_CONFIDENCE = 0.05;

/**
 * BPM 检测用 realtime-bpm-analyzer 的 tempogram 检测器（Apache-2.0）。
 * 它把结果收在 90–180 之间，所以 70 会读成 140；另一种读法放在 alternatives 里。
 */
export async function estimateTempo(samples: Float32Array, sampleRate: number): Promise<Tempo | null> {
  if (samples.length < sampleRate * 6) return null;
  let candidates;
  try { candidates = await analyzeChannelData(samples, sampleRate, { detector: 'tempogram' }); } catch { return null; }
  const best = candidates[0];
  if (!best || !(best.confidence >= MIN_CONFIDENCE)) return null;
  return {
    bpm: best.tempo,
    confidence: best.confidence,
    alternatives: [best.tempo / 2, best.tempo * 2].filter(value => value >= 45 && value <= 240),
  };
}
