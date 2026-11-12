/**
 * 节拍器的调度，移植自 cwilso/metronome（MIT，Chris Wilson，"A Tale of Two Clocks"）。
 * 思路不变：worker 每 25 ms 叫醒一次，把未来 100 ms 内要响的拍子提前交给 Web Audio 在精确的时间点发声，
 * 画面再按 AudioContext 的时钟去对拍子。改动：拍号、每拍细分、重音、音量，以及中途改速度不跳拍。
 */

export type MetronomeSettings = {
  bpm: number;
  /** 每小节几拍。 */
  beats: number;
  /** 每拍分几下：1 只响拍子，2 八分音符，3 三连音，4 十六分音符。 */
  subdivision: number;
  /** 第一拍是否用高音。 */
  accent: boolean;
  /** 0–1 */
  volume: number;
};

export type Note = { beat: number; sub: number; time: number };

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;
const NOTE_LENGTH = 0.05;

export class Metronome {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private worker: Worker | null = null;
  private nextTime = 0;
  private beat = 0;
  private sub = 0;
  /** 已经交给声卡、还没在画面上显示的拍子。 */
  readonly queue: Note[] = [];
  running = false;

  constructor(public settings: MetronomeSettings) {}

  get now() { return this.context?.currentTime ?? 0; }

  async start() {
    if (this.running) return;
    if (!this.context) {
      // iPhone 静音键打开时，网页声音默认会被一起静音；声明成“播放”类的音频就不受影响（Safari 17+）。
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
    this.master!.gain.value = this.settings.volume;
    this.beat = 0; this.sub = 0; this.queue.length = 0;
    this.nextTime = this.context.currentTime + 0.06;
    if (!this.worker) {
      this.worker = new Worker(new URL('./timer.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => this.schedule();
      this.worker.postMessage({ interval: LOOKAHEAD_MS });
    }
    this.running = true;
    this.schedule();
    this.worker.postMessage('start');
  }

  stop() {
    this.running = false;
    this.worker?.postMessage('stop');
    this.queue.length = 0;
  }

  update(settings: MetronomeSettings) {
    this.settings = settings;
    if (this.master) this.master.gain.value = settings.volume;
    if (this.beat >= settings.beats) this.beat = 0;
    if (this.sub >= settings.subdivision) { this.sub = 0; this.beat = (this.beat + 1) % settings.beats; }
  }

  dispose() {
    this.stop();
    this.worker?.terminate(); this.worker = null;
    void this.context?.close(); this.context = null;
  }

  private schedule() {
    if (!this.running || !this.context) return;
    while (this.nextTime < this.context.currentTime + SCHEDULE_AHEAD) {
      this.click(this.beat, this.sub, this.nextTime);
      this.advance();
    }
  }

  private advance() {
    const { bpm, beats, subdivision } = this.settings;
    this.nextTime += 60 / bpm / subdivision;
    if (++this.sub >= subdivision) { this.sub = 0; this.beat = (this.beat + 1) % beats; }
  }

  private click(beat: number, sub: number, time: number) {
    this.queue.push({ beat, sub, time });
    const context = this.context!;
    // 和原版一样用短促的正弦波：重音 880 Hz，普通拍 440 Hz，细分 220 Hz（这里细分更轻一些）。
    const frequency = sub > 0 ? 220 : beat === 0 && this.settings.accent ? 880 : 440;
    const level = sub > 0 ? 0.45 : 1;
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.frequency.value = frequency;
    env.gain.setValueAtTime(level, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + NOTE_LENGTH);
    osc.connect(env).connect(this.master!);
    osc.start(time);
    osc.stop(time + NOTE_LENGTH);
  }
}

/** 敲击测速：取最近几次敲击的平均间隔。两次敲击隔了 2 秒以上就重新开始。 */
export function tapTempo(taps: number[], now: number): { taps: number[]; bpm?: number } {
  const recent = taps.length && now - taps[taps.length - 1] > 2000 ? [now] : [...taps, now].slice(-6);
  if (recent.length < 2) return { taps: recent };
  const gaps = recent.slice(1).map((time, i) => time - recent[i]);
  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  return { taps: recent, bpm: Math.round(60000 / average) };
}
