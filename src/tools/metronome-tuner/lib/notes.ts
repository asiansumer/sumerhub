/** 音名和频率的换算（十二平均律）。 */

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export type Reading = {
  /** MIDI 音高，69 = A4。 */
  midi: number;
  name: string;
  octave: number;
  /** 偏离最近那个音多少音分，−50 到 +50。 */
  cents: number;
  frequency: number;
};

export function readFrequency(frequency: number, a4 = 440): Reading {
  const exact = 69 + 12 * Math.log2(frequency / a4);
  const midi = Math.round(exact);
  return {
    midi,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round((exact - midi) * 100),
    frequency,
  };
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
