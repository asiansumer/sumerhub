import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { analyze, waveformPeaks } from '../src/tools/audio-analyze/lib/analyze.ts';
import { describeKey, estimateKey } from '../src/tools/audio-analyze/lib/key.ts';
import { measureLoudness } from '../src/tools/audio-analyze/lib/loudness.ts';
import { estimateTempo } from '../src/tools/audio-analyze/lib/tempo.ts';

// Essentia 的浏览器版在 Node 里跑不起来，这里用同一个包的 CommonJS 版，算法是同一份 WebAssembly。
const { Essentia, EssentiaWASM } = createRequire(import.meta.url)('essentia.js');
const essentia = new Essentia(EssentiaWASM);

// 所有素材都是现场合成的，答案是已知的。
const RATE = 44100;
let seed = 1;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; };

/** 一段鼓：每拍一个底鼓，二、四拍加军鼓，八分音符上有踩镲。 */
function drums(bpm: number, seconds: number) {
  const out = new Float32Array(Math.floor(seconds * RATE)), beat = 60 / bpm * RATE;
  const hit = (start: number, length: number, voice: (t: number) => number) => {
    for (let i = 0; i < length && start + i < out.length; i++) out[Math.floor(start) + i] += voice(i / RATE);
  };
  for (let n = 0; n * beat < out.length; n++) {
    hit(n * beat, 6000, t => 0.8 * Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-t * 40)) * t) * Math.exp(-t * 18));
    if (n % 2 === 1) hit(n * beat, 5000, t => 0.5 * random() * Math.exp(-t * 25));
    hit((n + 0.5) * beat, 1500, t => 0.2 * random() * Math.exp(-t * 90));
  }
  return out;
}

/** 一段和弦进行，每个音带几个泛音，听起来像简单的合成器。 */
function chords(progression: number[][], seconds: number) {
  const out = new Float32Array(Math.floor(seconds * RATE)), bar = Math.floor(1.5 * RATE);
  for (let i = 0; i < out.length; i++) {
    const chord = progression[Math.floor(i / bar) % progression.length], t = i / RATE, fade = Math.min(1, (i % bar) / 400, (bar - (i % bar)) / 400);
    let value = 0;
    for (const midi of chord) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      for (let h = 1; h <= 4; h++) value += Math.sin(2 * Math.PI * frequency * h * t) / (h * h);
    }
    out[i] = 0.12 * value * fade;
  }
  return out;
}
const triad = (root: number, minor = false) => [root - 12, root, root + (minor ? 3 : 4), root + 7];

test('tempo of synthetic drum loops', async () => {
  for (const bpm of [92, 100, 120, 128, 140, 174]) {
    const tempo = await estimateTempo(drums(bpm, 30), RATE);
    assert.equal(tempo?.bpm, bpm);
    assert.ok(tempo.confidence > 0.5, `${bpm} BPM confidence ${tempo.confidence}`);
  }
});

test('tempo outside 90–180 is reported as its double, with the other reading offered', async () => {
  const tempo = await estimateTempo(drums(70, 30), RATE);
  assert.equal(tempo?.bpm, 140);
  assert.deepEqual(tempo?.alternatives, [70]);
});

test('audio without a beat, or too short, gives no tempo', async () => {
  const noise = Float32Array.from({ length: RATE * 20 }, () => random() * 0.3);
  assert.equal(await estimateTempo(noise, RATE), null);
  assert.equal(await estimateTempo(drums(120, 3), RATE), null);
});

test('key of simple chord progressions', () => {
  const cases: [string, number[][]][] = [
    ['C 大调', [triad(60), triad(65), triad(67), triad(60)]],
    ['G 大调', [triad(67), triad(60), triad(62), triad(67)]],
    ['A 小调', [triad(57, true), triad(62, true), triad(64, true), triad(57, true)]],
    ['F♯ 小调', [triad(54, true), triad(59, true), triad(61, true), triad(54, true)]],
    ['E♭ 大调', [triad(63), triad(60, true), triad(56), triad(58)]],
  ];
  for (const [expected, progression] of cases) {
    const key = estimateKey(essentia, chords(progression, 24));
    assert.equal(key?.name, expected);
    assert.ok(key.confidence > 0.5 && key.confidence <= 1);
  }
});

test('silence and very short audio give no key', () => {
  assert.equal(estimateKey(essentia, new Float32Array(RATE * 10)), null);
  assert.equal(estimateKey(essentia, chords([triad(60)], 1)), null);
});

test('Camelot numbers and compatible keys', () => {
  const camelot = (tonic: number, mode: 'major' | 'minor') => describeKey(tonic, mode).camelot;
  assert.deepEqual([camelot(0, 'major'), camelot(7, 'major'), camelot(11, 'major'), camelot(4, 'major')], ['8B', '9B', '1B', '12B']);
  assert.deepEqual([camelot(9, 'minor'), camelot(4, 'minor'), camelot(8, 'minor'), camelot(1, 'minor')], ['8A', '9A', '1A', '12A']);
  assert.deepEqual(describeKey(9, 'minor').compatible, ['7A', '9A', '8B']);
  assert.deepEqual(describeKey(11, 'major').compatible, ['12B', '2B', '1A']);
  assert.equal(describeKey(6, 'minor').short, 'F♯m');
  // 十二个大调、十二个小调各占一个编号，互不重复。
  assert.equal(new Set(Array.from({ length: 24 }, (_, i) => camelot(i % 12, i < 12 ? 'major' : 'minor'))).size, 24);
});

test('loudness matches the EBU R128 reference: a 1 kHz stereo sine at −23 dBFS reads −23 LUFS', () => {
  const sine = (level: number, rate: number) => Float32Array.from({ length: rate * 5 }, (_, i) => 10 ** (level / 20) * Math.sin(2 * Math.PI * 997 * i / rate));
  for (const rate of [44100, 48000]) {
    assert.deepEqual(measureLoudness([sine(-23, rate), sine(-23, rate)], rate), { lufs: -23, peak: -23 });
  }
  // 单声道少一个声道的能量，低 3 LU。
  assert.deepEqual(measureLoudness([sine(-23, RATE)], RATE), { lufs: -26, peak: -23 });
  assert.deepEqual(measureLoudness([new Float32Array(RATE * 2)], RATE), { lufs: null, peak: null });
  assert.deepEqual(measureLoudness([], RATE), { lufs: null, peak: null });
});

test('full analysis of a drum loop over chords', async () => {
  const beat = drums(128, 30), harmony = chords([triad(57, true), triad(65), triad(60), triad(55)], 30);
  const mix = Float32Array.from(beat, (value, i) => 0.6 * value + harmony[i]);
  const result = await analyze([mix, mix], RATE, essentia);
  assert.equal(result.tempo?.bpm, 128);
  assert.equal(result.key?.camelot.slice(0, -1), '8');
  assert.ok(Math.abs(result.duration - 30) < 0.01);
  assert.ok(result.lufs !== null && result.lufs < 0 && result.peak !== null);
  assert.equal(result.waveform.length, 180);
  assert.ok(result.waveform.every(value => value >= 0 && value <= 1) && Math.max(...result.waveform) === 1);
  assert.deepEqual(waveformPeaks([new Float32Array(1000)], 10), new Array(10).fill(0));
});
