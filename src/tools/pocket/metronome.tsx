'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PiMinus, PiPlus } from 'react-icons/pi';
import { Metronome, tapTempo, type MetronomeSettings } from './lib/metronome';
import { useStored } from './lib/stored';

const MIN = 30, MAX = 300;
const clamp = (bpm: number) => Math.min(MAX, Math.max(MIN, Math.round(bpm)));
const DEFAULTS: MetronomeSettings = { bpm: 90, beats: 4, subdivision: 1, accent: true, volume: 0.8 };
const SUBDIVISIONS = [
  { value: 1, label: '♩', title: '只响拍子' },
  { value: 2, label: '♫', title: '八分音符' },
  { value: 3, label: '三连', title: '三连音' },
  { value: 4, label: '十六分', title: '十六分音符' },
];

/** 速度常用的意大利文术语，给 BPM 一个直观的感觉。 */
function tempoName(bpm: number) {
  if (bpm < 60) return 'Largo · 很慢';
  if (bpm < 76) return 'Adagio · 慢';
  if (bpm < 108) return 'Andante · 行板';
  if (bpm < 120) return 'Moderato · 中速';
  if (bpm < 168) return 'Allegro · 快';
  return 'Presto · 很快';
}

export default function MetronomePanel() {
  const [settings, setSettings] = useStored('sumerhub.metronome', DEFAULTS);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<{ beat: number; sub: number; n: number } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const engine = useRef<Metronome | null>(null);
  const taps = useRef<number[]>([]);
  const [tapped, setTapped] = useState(false);

  const set = useCallback((change: Partial<MetronomeSettings>) => {
    setSettings(previous => {
      const next = { ...previous, ...change };
      next.bpm = clamp(next.bpm);
      engine.current?.update(next);
      return next;
    });
  }, [setSettings]);

  const toggle = useCallback(async () => {
    if (!engine.current) engine.current = new Metronome(settings);
    const metronome = engine.current;
    if (metronome.running) { metronome.stop(); setRunning(false); setCurrent(null); return; }
    metronome.update(settings);
    await metronome.start();
    setRunning(true);
  }, [settings]);

  const tap = useCallback(() => {
    const result = tapTempo(taps.current, performance.now());
    taps.current = result.taps;
    if (result.bpm) set({ bpm: result.bpm });
    setTapped(true); setTimeout(() => setTapped(false), 120);
  }, [set]);

  // 画面按声卡的时钟对拍：到点的拍子才亮。
  useEffect(() => {
    if (!running) return;
    let frame = 0, count = 0;
    const draw = () => {
      const metronome = engine.current;
      if (metronome) {
        let latest;
        while (metronome.queue.length && metronome.queue[0].time <= metronome.now) latest = metronome.queue.shift();
        if (latest) setCurrent({ beat: latest.beat, sub: latest.sub, n: ++count });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  useEffect(() => () => engine.current?.dispose(), []);

  // 键盘：空格开始/停止，T 敲击测速，←→ 调速度（按住 Shift 一次 5）。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === ' ' && !target.closest('button')) { event.preventDefault(); void toggle(); }
      else if (event.key === 't' || event.key === 'T') tap();
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); set({ bpm: settings.bpm + (event.shiftKey ? 5 : 1) }); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); set({ bpm: settings.bpm - (event.shiftKey ? 5 : 1) }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, tap, set, settings.bpm]);

  const commitDraft = () => {
    if (draft !== null && draft.trim() && !Number.isNaN(Number(draft))) set({ bpm: Number(draft) });
    setDraft(null);
  };

  return (
    <div className="metronome">
      <div className="stage">
        <div className="beats" aria-hidden="true" data-count={settings.beats}>
          {Array.from({ length: settings.beats }, (_, beat) => (
            <i key={beat} className={[
              beat === 0 && settings.accent ? 'accent' : '',
              current?.beat === beat ? (current.sub === 0 ? 'on' : 'sub') : '',
            ].join(' ')} data-n={current?.beat === beat ? current.n : undefined} />
          ))}
        </div>

        <div className="tempo">
          <button className="step" onClick={() => set({ bpm: settings.bpm - 1 })} aria-label="慢一点" disabled={settings.bpm <= MIN}><PiMinus size={18} /></button>
          <label className="tempo-value">
            <input inputMode="numeric" aria-label="速度（BPM）" value={draft ?? String(settings.bpm)}
              onFocus={event => { setDraft(String(settings.bpm)); event.target.select(); }}
              onChange={event => setDraft(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
              onBlur={commitDraft} onKeyDown={event => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }} />
            <span>BPM</span>
          </label>
          <button className="step" onClick={() => set({ bpm: settings.bpm + 1 })} aria-label="快一点" disabled={settings.bpm >= MAX}><PiPlus size={18} /></button>
        </div>
        <p className="tempo-name">{tempoName(settings.bpm)}</p>

        <input type="range" className="tempo-range" min={MIN} max={MAX} value={settings.bpm} aria-label="速度"
          onChange={event => set({ bpm: Number(event.target.value) })} />

        <div className="stage-actions">
          <button className={'button big' + (running ? ' ghost' : '')} onClick={() => void toggle()}>{running ? '停止' : '开始'}</button>
          <button className={'button big ghost' + (tapped ? ' pressed' : '')} onClick={tap} title="跟着节奏连续点几下，自动算出速度">敲击测速</button>
        </div>
      </div>

      <div className="controls">
        <div className="field">
          <span>每小节</span>
          <div className="segmented" role="group" aria-label="每小节几拍">
            {[2, 3, 4, 5, 6, 7].map(beats => (
              <button key={beats} aria-pressed={settings.beats === beats} onClick={() => set({ beats })}>{beats}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>细分</span>
          <div className="segmented" role="group" aria-label="每拍细分">
            {SUBDIVISIONS.map(option => (
              <button key={option.value} title={option.title} aria-pressed={settings.subdivision === option.value} onClick={() => set({ subdivision: option.value })}>{option.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>重音</span>
          <div className="segmented" role="group" aria-label="第一拍重音">
            <button aria-pressed={settings.accent} onClick={() => set({ accent: true })}>开</button>
            <button aria-pressed={!settings.accent} onClick={() => set({ accent: false })}>关</button>
          </div>
        </div>
        <label className="field">
          <span>音量</span>
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={event => set({ volume: Number(event.target.value) })} />
        </label>
      </div>
    </div>
  );
}
