'use client';

/* 封面是本地 blob URL，用原生 img 即可。 */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { PiMusicNoteSimple, PiPauseFill, PiPlayFill } from 'react-icons/pi';
import DropArea from '@/components/drop-area';
import type { Analysis } from './lib/analyze';
import AudioAnalyzePreview from './preview';
import type { AnalyzeRequest, AnalyzeResponse, FileInfo } from './types';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const MAX_FILES = 50;
const ACCEPT = { 'audio/*': ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.aif', '.aiff'] };

type Item = {
  id: string; name: string; file: File; url: string; coverUrl?: string;
  status: 'working' | 'done' | 'error'; error?: string;
  info?: FileInfo; analysis?: Analysis;
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const signed = (value: number) => (value < 0 ? '−' : value > 0 ? '+' : '') + Math.abs(value).toFixed(1);
const codecName = (info: FileInfo, name: string) => info.codec && info.codec !== 'Unknown' ? info.codec.toUpperCase() : (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toUpperCase();

/** 升降号在衬线字体里会回退成很宽的字形，单独换成无衬线。 */
const note = (text: string) => text.split(/([♭♯])/).map((part, index) => index % 2 ? <span key={index} className="accidental">{part}</span> : part);

/** 第二行小字：时长、编码、码率、采样率、声道。 */
function details(item: Item) {
  const { info = {}, analysis } = item;
  return [
    analysis && clock(analysis.duration),
    codecName(info, item.name),
    info.bitrate ? `${info.bitrate} kbps` : '',
    info.sampleRate ? `${+(info.sampleRate / 1000).toFixed(1)} kHz` : '',
    info.lossless && info.bitsPerSample ? `${info.bitsPerSample} bit` : '',
    info.channels === 1 ? '单声道' : info.channels === 2 ? '立体声' : info.channels ? `${info.channels} 声道` : '',
  ].filter(Boolean).join(' · ');
}

export default function AudioAnalyze() {
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  const worker = useRef<Worker | null>(null);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const waves = useRef(new Map<string, HTMLDivElement>());

  const update = useCallback((next: Item[]) => { itemsRef.current = next; setItems(next); }, []);
  const patch = useCallback((id: string, change: Partial<Item>) => {
    update(itemsRef.current.map(item => item.id === id ? { ...item, ...change } : item));
  }, [update]);

  /** 向后台线程发一个请求，等它回同一个 id 的结果。 */
  const ask = useCallback((request: AnalyzeRequest, transfer: Transferable[] = []) => new Promise<AnalyzeResponse>((resolve, reject) => {
    if (!worker.current) worker.current = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
    const current = worker.current;
    const done = () => { current.removeEventListener('message', onMessage); current.removeEventListener('error', onError); };
    const onMessage = ({ data }: MessageEvent<AnalyzeResponse>) => { if (data.id === request.id && (data.kind === request.kind || data.kind === 'error')) { done(); resolve(data); } };
    const onError = () => { done(); worker.current?.terminate(); worker.current = null; reject(new Error('分析失败，请重试')); };
    current.addEventListener('message', onMessage); current.addEventListener('error', onError);
    current.postMessage(request, transfer);
  }), []);

  const analyzeOne = useCallback(async (item: Item) => {
    const alive = () => itemsRef.current.some(entry => entry.id === item.id);
    // 标签先出来，列表里马上能看到歌名和封面。
    void ask({ id: item.id, kind: 'info', file: item.file }).then(response => {
      if (response.kind !== 'info' || !alive()) return;
      patch(item.id, { info: response.info, coverUrl: response.info.cover ? URL.createObjectURL(response.info.cover) : undefined });
    }).catch(() => {});
    let decoded: AudioBuffer;
    try {
      // 统一解码成 44.1 kHz，不同采样率的文件用同一套参数分析。
      decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await item.file.arrayBuffer());
    } catch { throw new Error('浏览器无法解码这个音频'); }
    if (!alive()) return;
    if (decoded.duration < 1) throw new Error('音频太短，无法分析');
    const channels = Array.from({ length: Math.min(2, decoded.numberOfChannels) }, (_, index) => decoded.getChannelData(index).slice());
    const response = await ask({ id: item.id, kind: 'analyze', channels, sampleRate: decoded.sampleRate }, channels.map(channel => channel.buffer));
    if (response.kind === 'error') throw new Error(response.error);
    if (response.kind === 'analyze' && alive()) patch(item.id, { status: 'done', analysis: response.analysis });
  }, [ask, patch]);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    // 一首一首来：解码后的音频很占内存。
    for (let id = queue.current.shift(); id; id = queue.current.shift()) {
      const item = itemsRef.current.find(entry => entry.id === id);
      if (!item) continue;
      try { await analyzeOne(item); }
      catch (error) { patch(id, { status: 'error', error: error instanceof Error ? error.message : '分析失败，请重试' }); }
    }
    busy.current = false;
  }, [analyzeOne, patch]);

  const add = useCallback((files: File[], rejected: FileRejection[] = []) => {
    const problems: string[] = [];
    if (rejected.length) problems.push(rejected.some(({ errors }) => errors.some(error => error.code === 'file-too-large')) ? '有文件超过 200 MB，已跳过。' : '有文件不是音频，已跳过。');
    const room = MAX_FILES - itemsRef.current.length;
    if (files.length > room) { problems.push(`一次最多分析 ${MAX_FILES} 首，多出的已跳过。`); files = files.slice(0, Math.max(0, room)); }
    setMessage(problems.join(' '));
    const added = files.map(file => ({ id: crypto.randomUUID(), name: file.name, file, url: URL.createObjectURL(file), status: 'working' as const }));
    update([...itemsRef.current, ...added]);
    queue.current.push(...added.map(item => item.id));
    void pump();
  }, [pump, update]);

  const stop = useCallback(() => { audio.current?.pause(); audio.current = null; setPlaying(null); }, []);

  /** 播放或暂停；给了 position（0–1）就跳到那里开始放。 */
  const play = useCallback((item: Item, position?: number) => {
    if (playing === item.id && position === undefined) { stop(); return; }
    let player = audio.current;
    if (playing !== item.id || !player) {
      stop();
      player = new Audio(item.url); audio.current = player;
      const current = player;
      current.addEventListener('ended', () => { if (audio.current === current) { audio.current = null; setPlaying(null); } }, { once: true });
      setPlaying(item.id);
      current.play().catch(() => { if (audio.current === current) { stop(); setMessage('浏览器无法播放这个文件。'); } });
    }
    if (position !== undefined && item.analysis) player.currentTime = position * item.analysis.duration;
  }, [playing, stop]);

  // 播放时把进度写到波形上，直接改样式，不触发重绘整个列表。
  useEffect(() => {
    if (!playing) return;
    const wave = waves.current.get(playing), duration = itemsRef.current.find(item => item.id === playing)?.analysis?.duration;
    let frame = 0;
    const tick = () => {
      if (wave && duration && audio.current) wave.style.setProperty('--played', `${Math.min(100, audio.current.currentTime / duration * 100)}%`);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(frame); wave?.style.setProperty('--played', '0%'); };
  }, [playing]);

  useEffect(() => () => {
    worker.current?.terminate(); audio.current?.pause();
    itemsRef.current.forEach(item => { URL.revokeObjectURL(item.url); if (item.coverUrl) URL.revokeObjectURL(item.coverUrl); });
  }, []);

  function clear() {
    stop(); queue.current = [];
    itemsRef.current.forEach(item => { URL.revokeObjectURL(item.url); if (item.coverUrl) URL.revokeObjectURL(item.coverUrl); });
    update([]); setMessage('');
  }

  const done = items.filter(item => item.status === 'done' && item.analysis);
  const working = items.filter(item => item.status === 'working').length;

  async function copy() {
    const rows = done.map(({ name, info, analysis }) => [info?.title || name, info?.artist ?? '', analysis!.tempo?.bpm ?? '', analysis!.key?.name ?? '', analysis!.key?.camelot ?? '', analysis!.lufs ?? '', clock(analysis!.duration)].join('\t'));
    try {
      await navigator.clipboard.writeText(['歌名\t歌手\tBPM\t调性\tCamelot\t响度 (LUFS)\t时长', ...rows].join('\n'));
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch { setMessage('复制失败，请手动选择文字复制。'); }
  }

  return (
    <div className="tool">
      <div className="panel">
        <DropArea accept={ACCEPT} maxSize={MAX_FILE_SIZE} compact={items.length > 0} onFiles={add}
          title="把音频拖到这里" hint="支持 MP3、FLAC、WAV、M4A、OGG 等，可多选" compactTitle="继续拖入音频" compactButton="继续添加" preview={<AudioAnalyzePreview />} inputLabel="选择音频文件" />

        {message && <p className="message" role="status">{message}</p>}

        {items.length > 0 && (
          <section aria-label="分析结果">
            <div className="results-head">
              <span aria-live="polite">{working ? `正在分析 ${items.length - working + 1} / ${items.length}` : `${done.length} 首`}</span>
              <div>
                {done.length > 0 && <button className="link" onClick={copy}>{copied ? '已复制' : '复制表格'}</button>}
                <button className="link" onClick={clear}>清空</button>
              </div>
            </div>
            <ul className="analyses">
              {items.map(item => {
                const { analysis, info } = item;
                return (
                  <li key={item.id} className={playing === item.id ? 'analysis playing' : 'analysis'}>
                    <div className="row">
                      <span className="thumb">{item.coverUrl ? <img src={item.coverUrl} alt="" /> : <PiMusicNoteSimple size={16} />}</span>
                      <div className="row-text">
                        <strong title={item.name}>{info?.title || item.name}</strong>
                        {item.status === 'error' ? <span className="row-error">{item.error}</span>
                          : <span>{[info?.artist, info?.album].filter(Boolean).join(' · ') || (item.status === 'working' ? '分析中…' : item.name)}</span>}
                      </div>
                      {analysis && (
                        <button className="icon" onClick={() => play(item)} aria-label={(playing === item.id ? '暂停 ' : '试听 ') + item.name}>
                          {playing === item.id ? <PiPauseFill size={14} /> : <PiPlayFill size={14} />}
                        </button>
                      )}
                    </div>
                    {item.status === 'working' && <div className="analysis-wait"><i /></div>}
                    {analysis && (
                      <>
                        <div className="waveform" role="slider" tabIndex={0} aria-label="播放位置" aria-valuemin={0} aria-valuemax={Math.round(analysis.duration)} aria-valuenow={0}
                          ref={node => { if (node) waves.current.set(item.id, node); else waves.current.delete(item.id); }}
                          onClick={event => { const box = event.currentTarget.getBoundingClientRect(); play(item, Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))); }}
                          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); play(item); } }}>
                          {[0, 1].map(layer => (
                            <div key={layer} className={layer ? 'bars played' : 'bars'}>
                              {analysis.waveform.map((value, index) => <i key={index} style={{ height: Math.max(4, value * 100) + '%' }} />)}
                            </div>
                          ))}
                        </div>
                        <dl className="stats">
                          <div>
                            <dt>BPM</dt>
                            <dd>{analysis.tempo ? analysis.tempo.bpm : '—'}</dd>
                            <small>{analysis.tempo ? `也可能是 ${analysis.tempo.alternatives.join(' 或 ')}` + (analysis.tempo.confidence < 0.12 ? ' · 把握不大' : '') : '没有稳定的节拍'}</small>
                          </div>
                          <div>
                            <dt>调性</dt>
                            <dd>{analysis.key ? note(analysis.key.name) : '—'}</dd>
                            <small>{analysis.key ? analysis.key.short + (analysis.key.confidence < 0.15 ? ' · 把握不大' : '') : '听不出明确的调'}</small>
                          </div>
                          <div>
                            <dt>Camelot</dt>
                            <dd>{analysis.key ? analysis.key.camelot : '—'}</dd>
                            <small>{analysis.key ? `好接 ${analysis.key.compatible.join('、')}` : ' '}</small>
                          </div>
                          <div>
                            <dt>响度</dt>
                            <dd>{analysis.lufs === null ? '—' : <>{signed(analysis.lufs)}<em>LUFS</em></>}</dd>
                            <small>{analysis.peak === null ? '静音' : `真峰值 ${signed(analysis.peak)} dBTP`}</small>
                          </div>
                        </dl>
                        <p className="analysis-meta">{details(item)}</p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <dl className="notes">
        <div><dt>隐私</dt><dd>音频只在浏览器里分析，不会上传。关掉页面后结果会清除。</dd></div>
        <div><dt>BPM</dt><dd>结果取 90–180 之间的整数。慢歌可能显示成两倍，另一个可能的数写在下面。</dd></div>
        <div><dt>调性</dt><dd>按整首歌的和声估算，转调多的歌可能不准。Camelot 编号相邻的歌混在一起更顺。</dd></div>
      </dl>
      <p className="fine">
        BPM 检测使用 <a href="https://github.com/dlepaux/realtime-bpm-analyzer" target="_blank" rel="noopener noreferrer">realtime-bpm-analyzer</a>，
        响度按 EBU R128 测量，使用 <a href="https://github.com/streamonkey/ebur128_wasm" target="_blank" rel="noopener noreferrer">ebur128-wasm</a>，
        标签读取使用 <a href="/licenses/taglib-LGPL-2.1.txt" target="_blank">TagLib</a>。
      </p>
    </div>
  );
}
