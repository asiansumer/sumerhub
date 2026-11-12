'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { median, NOTE_NAMES, readFrequency, type Reading } from './lib/notes';
import { useStored } from './lib/stored';

const FFT = 4096;
const MIN_CLARITY = 0.9;
const MIN_RMS = 0.006;
const TRAIL_SECONDS = 6;
const A4_OPTIONS = [432, 438, 440, 442, 444];

type Point = { t: number; midi: number | null };

/** 把一个音名画成「C♯」和小号的八度数字。 */
function NoteName({ reading }: { reading: Reading }) {
  const [letter, accidental] = [reading.name[0], reading.name.slice(1)];
  return <>{letter}{accidental && <span className="accidental">{accidental}</span>}<sub>{reading.octave}</sub></>;
}

export default function TunerPanel() {
  const [settings, setSettings] = useStored('sumerhub.tuner', { a4: 440 });
  const [state, setState] = useState<'idle' | 'starting' | 'listening' | 'error'>('idle');
  const [error, setError] = useState('');
  const [reading, setReading] = useState<Reading | null>(null);
  const [live, setLive] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const a4 = useRef(settings.a4);
  a4.current = settings.a4;

  const start = useCallback(async () => {
    setState('starting'); setError('');
    try {
      const [{ PitchDetector }, stream] = await Promise.all([
        import('pitchy'),
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }),
      ]);
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT;
      source.connect(analyser);
      const detector = PitchDetector.forFloat32Array(FFT);
      detector.minVolumeDecibels = -45;
      const buffer = new Float32Array(FFT);
      const recent: number[] = [];
      const trail: Point[] = [];
      let lastHeard = 0, frame = 0;

      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);
        const now = performance.now();
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
        rms = Math.sqrt(rms / buffer.length);
        const [pitch, clarity] = detector.findPitch(buffer, context.sampleRate);
        let midi: number | null = null;
        if (rms > MIN_RMS && clarity >= MIN_CLARITY && pitch > 40 && pitch < 2100) {
          recent.push(pitch); if (recent.length > 5) recent.shift();
          const steady = median(recent);
          const next = readFrequency(steady, a4.current);
          midi = 69 + 12 * Math.log2(steady / a4.current);
          lastHeard = now;
          setReading(next); setLive(true);
        } else if (now - lastHeard > 400) {
          recent.length = 0;
          setLive(false);
        }
        trail.push({ t: now, midi });
        while (trail.length && now - trail[0].t > TRAIL_SECONDS * 1000) trail.shift();
        drawTrail(canvas.current, trail, now);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
      stop.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach(track => track.stop());
        void context.close();
      };
      setState('listening');
    } catch (cause) {
      const name = (cause as DOMException)?.name;
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? '没有麦克风权限。请在浏览器的网站设置里允许使用麦克风，再点一次开始。'
        : name === 'NotFoundError' ? '没有找到麦克风。' : '麦克风打不开，请重试。');
      setState('error');
    }
  }, []);

  const end = useCallback(() => {
    stop.current?.(); stop.current = null;
    setState('idle'); setLive(false);
  }, []);

  useEffect(() => () => stop.current?.(), []);

  const cents = reading?.cents ?? 0;
  const inTune = live && Math.abs(cents) <= 5;
  const listening = state === 'listening';

  return (
    <div className="tuner">
      <div className={'stage' + (listening ? '' : ' resting')}>
        <div className={'tuner-note' + (live ? ' live' : '') + (inTune ? ' in-tune' : '')} aria-live="polite">
          {reading ? <NoteName reading={reading} /> : <span className="placeholder">A<sub>4</sub></span>}
        </div>
        <p className="tuner-detail">
          {!listening ? '对着麦克风唱或弹一个音'
            : !reading ? '在听…'
            : <>{reading.frequency.toFixed(1)} Hz<span>·</span>{cents === 0 ? '正好' : cents > 0 ? `高了 ${cents} 音分` : `低了 ${-cents} 音分`}</>}
        </p>

        <div className={'meter' + (live ? ' live' : '') + (inTune ? ' in-tune' : '')} aria-hidden="true">
          <div className="meter-scale">
            {Array.from({ length: 21 }, (_, i) => <i key={i} className={i % 5 === 0 ? 'major' : ''} />)}
          </div>
          <div className="meter-zone" />
          <div className="meter-needle" style={{ left: `${50 + (live ? cents : 0)}%` }} />
          <div className="meter-labels"><span>−50</span><span>0</span><span>+50</span></div>
        </div>

        {listening && <canvas ref={canvas} className="trail" aria-label="最近几秒的音高曲线" />}

        <div className="stage-actions">
          {listening ? <button className="button big ghost" onClick={end}>停止</button>
            : <button className="button big" onClick={() => void start()} disabled={state === 'starting'}>{state === 'starting' ? '正在打开麦克风…' : '开始'}</button>}
        </div>
        {error && <p className="stage-error" role="alert">{error}</p>}
      </div>

      <div className="controls">
        <label className="field">
          <span>标准音 A4</span>
          <select className="select" value={settings.a4} onChange={event => setSettings({ a4: Number(event.target.value) })}>
            {A4_OPTIONS.map(hz => <option key={hz} value={hz}>{hz} Hz</option>)}
          </select>
        </label>
        <span className="field hint">差 5 音分以内算准。曲线上每条横线是一个半音。</span>
      </div>
    </div>
  );
}

/** 画最近几秒的音高：纵轴按半音，跟着当前的音上下移动。 */
function drawTrail(canvas: HTMLCanvasElement | null, trail: Point[], now: number) {
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const g = canvas.getContext('2d')!;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);

  const heard = trail.filter(point => point.midi !== null).map(point => point.midi!);
  const center = heard.length ? Math.round(median(heard.slice(-30))) : 69;
  const span = 4; // 上下各 4 个半音
  const y = (midi: number) => height / 2 - (midi - center) / span * (height / 2 - 6);
  const style = getComputedStyle(canvas);
  const line = style.getPropertyValue('--line').trim() || '#242428';
  const faint = style.getPropertyValue('--faint').trim() || '#62626b';
  const fg = style.getPropertyValue('--fg').trim() || '#ededef';

  g.font = '10px ui-monospace, Menlo, monospace';
  g.textBaseline = 'middle';
  for (let midi = center - span; midi <= center + span; midi++) {
    const row = y(midi);
    g.strokeStyle = line; g.lineWidth = midi === center ? 1.5 : 1;
    g.beginPath(); g.moveTo(34, row); g.lineTo(width, row); g.stroke();
    const name = NOTE_NAMES[((midi % 12) + 12) % 12];
    g.fillStyle = midi === center ? fg : faint;
    g.fillText(name + (Math.floor(midi / 12) - 1), 0, row);
  }

  g.strokeStyle = fg; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  let drawing = false;
  for (const point of trail) {
    const x = 34 + (1 - (now - point.t) / (TRAIL_SECONDS * 1000)) * (width - 34);
    if (point.midi === null || Math.abs(point.midi - center) > span + 0.5) { drawing = false; continue; }
    if (drawing) g.lineTo(x, y(point.midi)); else g.moveTo(x, y(point.midi));
    drawing = true;
  }
  g.stroke();
}
