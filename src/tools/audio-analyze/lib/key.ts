import { createFft, hann } from './fft.ts';

const WINDOW = 8192, HOP = 4096, LOW = 65, HIGH = 2000;

// Krumhansl & Kessler (1982) 的调性轮廓：在某个调里，十二个音各自听起来有多「稳」。
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];

export type Key = {
  /** 主音，C = 0。 */
  tonic: number; mode: 'major' | 'minor';
  /** 例如「A 小调」。 */
  name: string;
  /** 例如 Am。 */
  short: string;
  /** DJ 常用的 Camelot 编号，例如 8A。 */
  camelot: string;
  /** 混音时好接的调。 */
  compatible: string[];
  /** 0–1，越高越确定。 */
  confidence: number;
};

export function describeKey(tonic: number, mode: 'major' | 'minor', confidence = 1): Key {
  const number = (((mode === 'major' ? tonic : tonic + 3) * 7 + 7) % 12) + 1, letter = mode === 'major' ? 'B' : 'A';
  const wrap = (value: number) => ((value + 11) % 12) + 1;
  const note = (mode === 'major' ? MAJOR_NAMES : MINOR_NAMES)[tonic];
  return {
    tonic, mode, confidence,
    name: `${note} ${mode === 'major' ? '大调' : '小调'}`,
    short: note + (mode === 'major' ? '' : 'm'),
    camelot: number + letter,
    compatible: [wrap(number - 1) + letter, wrap(number + 1) + letter, number + (letter === 'A' ? 'B' : 'A')],
  };
}

/** 整首歌里十二个音各出现了多少（不分八度）。 */
export function chromagram(samples: Float32Array, sampleRate: number) {
  const chroma = new Float64Array(12);
  const frames = Math.floor((samples.length - WINDOW) / HOP) + 1;
  if (frames < 1) return chroma;
  const fft = createFft(WINDOW), window = hann(WINDOW);
  const re = new Float64Array(WINDOW), im = new Float64Array(WINDOW), magnitude = new Float64Array(WINDOW / 2);
  const first = Math.max(2, Math.ceil(LOW * WINDOW / sampleRate)), last = Math.min(WINDOW / 2 - 2, Math.floor(HIGH * WINDOW / sampleRate));
  const peaks: { frame: number; pitch: number; level: number }[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * HOP;
    for (let i = 0; i < WINDOW; i++) { re[i] = samples[offset + i] * window[i]; im[i] = 0; }
    fft(re, im);
    let loudest = 0;
    for (let k = first - 1; k <= last + 1; k++) { magnitude[k] = Math.hypot(re[k], im[k]); if (magnitude[k] > loudest) loudest = magnitude[k]; }
    if (loudest < 1e-4) continue;
    for (let k = first; k <= last; k++) {
      const level = magnitude[k];
      if (level < loudest * 0.02 || level <= magnitude[k - 1] || level < magnitude[k + 1]) continue;
      // 抛物线插值，得到比频率格更准的峰值位置。
      const a = Math.log(magnitude[k - 1] + 1e-12), b = Math.log(level), c = Math.log(magnitude[k + 1] + 1e-12);
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      const frequency = (k + Math.max(-0.5, Math.min(0.5, shift))) * sampleRate / WINDOW;
      peaks.push({ frame, pitch: 69 + 12 * Math.log2(frequency / 440), level });
    }
  }
  // 录音不一定按 A = 440 Hz 调音，先估计整体偏了多少。
  let x = 0, y = 0;
  for (const { pitch, level } of peaks) { const angle = 2 * Math.PI * (pitch - Math.round(pitch)); x += Math.cos(angle) * level; y += Math.sin(angle) * level; }
  const tuning = Math.atan2(y, x) / (2 * Math.PI);

  const row = new Float64Array(12);
  const flush = () => {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += row[i];
    // 开平方：响的段落占的分量大一些，但不至于盖过其他部分。
    if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] += row[i] / Math.sqrt(sum);
    row.fill(0);
  };
  let current = -1;
  for (const { frame, pitch, level } of peaks) {
    if (frame !== current) { flush(); current = frame; }
    const tuned = pitch - tuning, nearest = Math.round(tuned);
    row[((nearest % 12) + 12) % 12] += level * Math.cos(Math.PI * (tuned - nearest)) ** 2;
  }
  flush();
  return chroma;
}

function correlation(a: ArrayLike<number>, b: number[], shift: number) {
  let meanA = 0, meanB = 0;
  for (let i = 0; i < 12; i++) { meanA += a[i]; meanB += b[i]; }
  meanA /= 12; meanB /= 12;
  let top = 0, left = 0, right = 0;
  for (let i = 0; i < 12; i++) {
    const da = a[(i + shift) % 12] - meanA, db = b[i] - meanB;
    top += da * db; left += da * da; right += db * db;
  }
  return left && right ? top / Math.sqrt(left * right) : 0;
}

export function keyFromChroma(chroma: ArrayLike<number>): Key | null {
  const scores: { tonic: number; mode: 'major' | 'minor'; score: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    scores.push({ tonic, mode: 'major', score: correlation(chroma, MAJOR, tonic) });
    scores.push({ tonic, mode: 'minor', score: correlation(chroma, MINOR, tonic) });
  }
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!(best.score > 0.2)) return null;
  return describeKey(best.tonic, best.mode, Math.max(0, Math.min(1, (best.score - second.score) / 0.25)));
}

export function estimateKey(samples: Float32Array, sampleRate: number) {
  return keyFromChroma(chromagram(samples, sampleRate));
}
