const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const MAJOR_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MINOR_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11], MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
/** 调号里用降号的大调：F、B♭、E♭、A♭、D♭。 */
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1]);

/** 模型要的采样率。 */
export const MODEL_RATE = 44100;
/** 模型输出的 24 个类别按 Camelot 排列：1A–12A（小调），然后 1B–12B（大调）。这里是每个编号的主音，C = 0。 */
const MINOR_TONICS = [8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1], MAJOR_TONICS = [11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4];
/** 太长的音频只听中间这一段。 */
const MAX_SECONDS = 240, MIN_SECONDS = 3;

type Mode = 'major' | 'minor';

export type Key = {
  /** 主音，C = 0。 */
  tonic: number; mode: Mode;
  /** 例如「A 小调」。 */
  name: string;
  /** 例如 Am。 */
  short: string;
  /** DJ 常用的 Camelot 编号，例如 8A。 */
  camelot: string;
  /** 混音时好接的调。 */
  compatible: string[];
  /** 关系大小调：用的是同一组音，修音时选哪个都一样。例如 A 小调 ↔ C 大调。 */
  relative: string;
  /** 音阶里的七个音，从主音开始。 */
  notes: string[];
  /** 模型给这个调的概率，0–1。 */
  confidence: number;
};

/** 最可能的调，以及音阶不同的其他候选。 */
export type KeyEstimate = Key & { alternatives: Key[] };

/** 调性模型：输入 44.1 kHz 单声道音频，输出 24 个调的概率。 */
export type KeyModel = (audio: Float32Array) => Promise<ArrayLike<number>>;

const keyName = (tonic: number, mode: Mode) => `${(mode === 'major' ? MAJOR_NAMES : MINOR_NAMES)[tonic]} ${mode === 'major' ? '大调' : '小调'}`;
/** 关系大调的主音：同一组音对应的那个大调。 */
const signature = (tonic: number, mode: Mode) => mode === 'major' ? tonic : (tonic + 3) % 12;

export function describeKey(tonic: number, mode: Mode, confidence = 1): Key {
  const number = ((signature(tonic, mode) * 7 + 7) % 12) + 1, letter = mode === 'major' ? 'B' : 'A';
  const wrap = (value: number) => ((value + 11) % 12) + 1;
  const note = (mode === 'major' ? MAJOR_NAMES : MINOR_NAMES)[tonic];
  // 音名跟着调名走：调名带降号就用降号，带升号就用升号，否则看调号。
  const names = note.includes('♭') || (!note.includes('♯') && FLAT_MAJORS.has(signature(tonic, mode))) ? FLAT : SHARP;
  return {
    tonic, mode, confidence,
    name: keyName(tonic, mode),
    short: note + (mode === 'major' ? '' : 'm'),
    camelot: number + letter,
    compatible: [wrap(number - 1) + letter, wrap(number + 1) + letter, number + (letter === 'A' ? 'B' : 'A')],
    // 关系调的名字用同一套升降号：E♭ 小调对 G♭ 大调，F♯ 大调对 D♯ 小调。
    relative: mode === 'major' ? `${names[(tonic + 9) % 12]} 小调` : `${names[(tonic + 3) % 12]} 大调`,
    notes: (mode === 'major' ? MAJOR_STEPS : MINOR_STEPS).map(step => names[(tonic + step) % 12]),
  };
}

/** 把模型的 24 个概率整理成结果：概率最高的调，加上最多两个音阶不同的候选。 */
export function keysFromProbabilities(probabilities: ArrayLike<number>): KeyEstimate | null {
  if (probabilities.length !== 24) return null;
  const ranked = Array.from(probabilities, (probability, index) => ({
    probability, mode: (index < 12 ? 'minor' : 'major') as Mode, tonic: index < 12 ? MINOR_TONICS[index] : MAJOR_TONICS[index - 12],
  })).sort((a, b) => b.probability - a.probability);
  const [best, ...rest] = ranked;
  if (!(best.probability > 0)) return null;
  const seen = new Set([signature(best.tonic, best.mode)]), alternatives: Key[] = [];
  for (const { tonic, mode, probability } of rest) {
    if (alternatives.length === 2 || probability < 0.08) break;
    // 关系大小调的音阶相同，不算另一个候选。
    if (seen.has(signature(tonic, mode))) continue;
    seen.add(signature(tonic, mode));
    alternatives.push(describeKey(tonic, mode, probability));
  }
  return { ...describeKey(best.tonic, best.mode, best.probability), alternatives };
}

export async function estimateKey(model: KeyModel, samples: Float32Array, sampleRate: number): Promise<KeyEstimate | null> {
  if (sampleRate !== MODEL_RATE || samples.length < MIN_SECONDS * sampleRate) return null;
  const limit = MAX_SECONDS * sampleRate, start = samples.length > limit ? Math.floor((samples.length - limit) / 2) : 0;
  const excerpt = samples.length > limit ? samples.subarray(start, start + limit) : samples;
  let energy = 0;
  for (let i = 0; i < excerpt.length; i += 16) energy += excerpt[i] * excerpt[i];
  // 接近静音的文件没有调可言。
  if (Math.sqrt(energy / (excerpt.length / 16)) < 1e-4) return null;
  return keysFromProbabilities(await model(excerpt));
}
