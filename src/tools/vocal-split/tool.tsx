'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { PiArrowDown, PiPauseFill, PiPlayFill } from 'react-icons/pi';
import DropArea from '@/components/drop-area';
import { downloadZip } from '@/lib/download';
import { formatSize } from '@/lib/format';
import VocalSplitPreview from './preview';
import { STEMS, type Device, type SplitRequest, type SplitResponse, type Stem } from './types';

const MAX_FILE_SIZE = 300 * 1024 * 1024;
const MAX_SECONDS = 12 * 60;
const ACCEPT = { 'audio/*': ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.aif', '.aiff'] };
const LABELS: Record<Stem, { name: string; note: string }> = {
  vocals: { name: '人声', note: '干声，带一点残留' },
  instrumental: { name: '伴奏', note: '原曲去掉人声' },
  drums: { name: '鼓', note: '伴奏里的鼓' },
  bass: { name: '贝斯', note: '伴奏里的低音' },
  other: { name: '其他乐器', note: '吉他、键盘、合成器等' },
};

type Job = {
  id: string; name: string; duration: number;
  phase: 'decoding' | 'download' | 'loading' | 'working' | 'done' | 'error';
  loaded?: number; total?: number; done?: number; segments?: number;
  device?: Device; seconds?: number; error?: string;
  stems?: Record<Stem, { blob: Blob; url: string }>;
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const span = (seconds: number) => seconds < 90 ? `${Math.max(1, Math.round(seconds))} 秒` : `${Math.round(seconds / 60)} 分钟`;

export default function VocalSplit() {
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState('');
  const [playing, setPlaying] = useState<Stem | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const jobRef = useRef<Job | null>(null);
  const worker = useRef<Worker | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const startedAt = useRef(0);
  const [, tick] = useState(0);

  const update = useCallback((next: Job | null) => { jobRef.current = next; setJob(next); }, []);
  const patch = useCallback((id: string, change: Partial<Job>) => {
    if (jobRef.current?.id === id) update({ ...jobRef.current, ...change });
  }, [update]);
  const release = (target: Job | null) => { if (target?.stems) Object.values(target.stems).forEach(stem => URL.revokeObjectURL(stem.url)); };
  const stopAudio = useCallback(() => { audio.current?.pause(); audio.current = null; setPlaying(null); }, []);

  const start = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    const file = files[0];
    if (!file) { setMessage(rejected.length ? '这个文件不是音频，或者超过了 300 MB。' : ''); return; }
    const busy = jobRef.current && !['done', 'error'].includes(jobRef.current.phase);
    if (busy) { setMessage('正在分离上一首，等它完成或者点「取消」再换。'); return; }
    setMessage(files.length > 1 ? '一次分离一首，先处理第一首。' : '');
    stopAudio(); release(jobRef.current);
    const id = crypto.randomUUID();
    update({ id, name: file.name, duration: 0, phase: 'decoding' });
    let decoded: AudioBuffer;
    try { decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await file.arrayBuffer()); }
    catch { patch(id, { phase: 'error', error: '读不出这个文件，可能不是音频或者已损坏。' }); return; }
    if (jobRef.current?.id !== id) return;
    if (decoded.duration > MAX_SECONDS) { patch(id, { phase: 'error', error: `这首有 ${clock(decoded.duration)}，最长支持 ${MAX_SECONDS / 60} 分钟。` }); return; }
    const left = decoded.getChannelData(0).slice();
    const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1).slice() : left.slice();
    patch(id, { duration: decoded.duration, phase: 'loading' });

    if (!worker.current) worker.current = new Worker(new URL('./split.worker.ts', import.meta.url), { type: 'module' });
    const current = worker.current;
    current.onmessage = ({ data }: MessageEvent<SplitResponse>) => {
      if (data.id !== id) return;
      if (data.kind === 'download') patch(id, { phase: 'download', loaded: data.loaded, total: data.total });
      else if (data.kind === 'ready') { startedAt.current = performance.now(); patch(id, { phase: 'working', device: data.device, done: 0, segments: undefined }); }
      else if (data.kind === 'progress') patch(id, { done: data.done, segments: data.total });
      else if (data.kind === 'done') {
        const stems = Object.fromEntries(STEMS.map(stem => [stem, { blob: data.stems[stem], url: URL.createObjectURL(data.stems[stem]) }])) as Job['stems'];
        patch(id, { phase: 'done', device: data.device, seconds: data.seconds, stems });
      } else patch(id, { phase: 'error', error: data.error });
    };
    current.onerror = () => { patch(id, { phase: 'error', error: '分离失败，可能是内存不够。刷新页面后换一首短一点的试试。' }); current.terminate(); worker.current = null; };
    const request: SplitRequest = { id, left, right };
    current.postMessage(request, [left.buffer, right.buffer]);
  }, [patch, stopAudio, update]);

  function cancel() {
    worker.current?.terminate(); worker.current = null;
    stopAudio(); release(jobRef.current); update(null); setMessage('');
  }

  useEffect(() => () => { worker.current?.terminate(); audio.current?.pause(); release(jobRef.current); }, []);

  // 分离时每秒刷新一次「还要多久」。
  const working = job?.phase === 'working';
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, [working]);

  function toggle(stem: Stem) {
    if (playing === stem) { stopAudio(); return; }
    const position = audio.current?.currentTime ?? 0;
    audio.current?.pause();
    // 换一条听的时候接着刚才的位置放，方便对比。
    const next = new Audio(job!.stems![stem].url);
    next.currentTime = position;
    next.onended = () => { if (audio.current === next) { audio.current = null; setPlaying(null); } };
    audio.current = next; setPlaying(stem);
    void next.play().catch(() => setPlaying(null));
  }

  const base = job?.name.replace(/\.[^.]+$/, '') ?? '';
  const fileName = (stem: Stem) => `${base} - ${LABELS[stem].name}.wav`;
  async function downloadAll() {
    if (!job?.stems || zipBusy) return;
    setZipBusy(true);
    try { await downloadZip(STEMS.map(stem => ({ name: fileName(stem), blob: job.stems![stem].blob })), `${base} - 分离.zip`); }
    catch { setMessage('打包失败，请单独下载。'); }
    finally { setZipBusy(false); }
  }

  const fraction = job?.phase === 'download' && job.total ? job.loaded! / job.total
    : job?.phase === 'working' && job.segments ? job.done! / job.segments : 0;
  const elapsed = (performance.now() - startedAt.current) / 1000;
  const remaining = job?.phase === 'working' && job.done && job.segments ? elapsed / job.done * (job.segments - job.done) : null;
  const active = job && !['done', 'error'].includes(job.phase);

  return (
    <div className="tool">
      <div className="panel">
        <DropArea accept={ACCEPT} maxSize={MAX_FILE_SIZE} multiple={false} compact={Boolean(job)} disabled={Boolean(active)} onFiles={start}
          title="把一首歌拖到这里" hint="支持 MP3、FLAC、WAV、M4A 等，一次一首" compactTitle={active ? '正在分离…' : '换一首'} compactButton="选择文件" preview={<VocalSplitPreview />} inputLabel="选择一首歌" />

        {message && <p className="message" role="status">{message}</p>}

        {job && active && (
          <div className="progress" role="status">
            <div className="progress-label">
              <span>
                {job.phase === 'decoding' ? '正在读取…'
                  : job.phase === 'download' ? `第一次使用，正在下载模型 ${formatSize(job.loaded ?? 0)} / ${formatSize(job.total ?? 0)}`
                  : job.phase === 'loading' ? '正在准备模型…'
                  : `正在分离（${job.device === 'webgpu' ? '显卡加速' : '没有显卡加速，会很慢'}）${remaining !== null ? `，大约还要 ${span(remaining)}` : ''}`}
              </span>
              <span>{fraction ? `${Math.round(fraction * 100)}%` : ''}</span>
            </div>
            <div className="bar"><span style={{ width: `${fraction * 100}%` }} /></div>
          </div>
        )}

        {job && (
          <section aria-label="分离结果">
            <div className="results-head">
              <span title={job.name} className="split-name">
                {job.name}{job.duration ? ` · ${clock(job.duration)}` : ''}
                {job.phase === 'done' && ` · 用时 ${span(job.seconds!)}${job.device === 'webgpu' ? '（显卡加速）' : ''}`}
              </span>
              <div>
                <button className="link" onClick={cancel} disabled={zipBusy}>{active ? '取消' : '清空'}</button>
                {job.phase === 'done' && <button className="button" onClick={downloadAll} disabled={zipBusy}>{zipBusy ? '打包中…' : '全部下载'}</button>}
              </div>
            </div>
            {job.phase === 'error' && <p className="message"><span className="row-error">{job.error}</span></p>}
            {job.phase === 'done' && job.stems && (
              <ul className="rows">
                {STEMS.map(stem => (
                  <li key={stem} className={'row' + (playing === stem ? ' playing' : '') + (stem === 'drums' ? ' split-minor' : '')}>
                    <button className="icon" onClick={() => toggle(stem)} aria-label={(playing === stem ? '暂停 ' : '试听 ') + LABELS[stem].name}>
                      {playing === stem ? <PiPauseFill size={15} /> : <PiPlayFill size={15} />}
                    </button>
                    <div className="row-text"><strong>{LABELS[stem].name}</strong><span>{LABELS[stem].note}</span></div>
                    <span className="row-meta optional">{formatSize(job.stems![stem].blob.size)}</span>
                    <a className="icon" href={job.stems![stem].url} download={fileName(stem)} aria-label={'下载 ' + LABELS[stem].name}><PiArrowDown size={16} /></a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <dl className="notes">
        <div><dt>隐私</dt><dd>歌只在浏览器里处理，不会上传。第一次用要下载 180 MB 的模型，之后存在浏览器里不用再下。</dd></div>
        <div><dt>速度</dt><dd>建议在电脑上用 Chrome 或 Safari。有显卡加速（WebGPU）会快很多；没有的话一首三分半的歌大约要二三十分钟，进度条会显示还要多久。手机不建议用。</dd></div>
        <div><dt>效果</dt><dd>伴奏一般比较干净，人声会带一点残留。人声很轻、混响或效果很重的歌会差一些。导出的是 WAV，要 MP3 可以再用「音频转换」。</dd></div>
      </dl>
      <p className="fine">
        模型是 Meta 的 <a href="https://github.com/facebookresearch/demucs" target="_blank" rel="noopener noreferrer">Demucs v4</a>（MIT），
        浏览器版本来自 <a href="https://github.com/timcsy/demucs-web" target="_blank" rel="noopener noreferrer">timcsy/demucs-web</a>（MIT），
        用 <a href="https://github.com/microsoft/onnxruntime" target="_blank" rel="noopener noreferrer">ONNX Runtime Web</a>（MIT）运行。模型文件从 Hugging Face 下载。
      </p>
    </div>
  );
}
