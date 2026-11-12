'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { PiArrowDown } from 'react-icons/pi';
import DropArea from '@/components/drop-area';
import { downloadZip } from '@/lib/download';
import { formatSize, uniqueFileName } from '@/lib/format';
import AudioConvertPreview from './preview';
import { bitrates, targets, type ConvertRequest, type ConvertResponse, type Converted, type Settings, type Target } from './types';

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_FILES = 50;
const ACCEPT = {
  'audio/*': ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.oga', '.aif', '.aiff'],
  'video/*': ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.ts'],
};

type Item = {
  id: string; name: string; size: number; file: File;
  status: 'working' | 'done' | 'error'; error?: string;
  /** 0–1，还没轮到时是 undefined。 */
  progress?: number;
  blob?: Blob; url?: string; target?: Target; info?: Converted;
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const describe = ({ duration, sampleRate, channels, copied, hadVideo }: Converted) => [
  clock(duration), `${+(sampleRate / 1000).toFixed(1)} kHz`,
  channels === 1 ? '单声道' : channels === 2 ? '立体声' : `${channels} 声道`,
  hadVideo && '取自视频', copied && '原样取出，音质不变',
].filter(Boolean).join(' · ');

export default function AudioConvert() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>({ target: 'mp3', bitrate: 320, depth: 16 });
  const [message, setMessage] = useState('');
  const [zipBusy, setZipBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const settingsRef = useRef(settings);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);

  const update = useCallback((next: Item[]) => { itemsRef.current = next; setItems(next); }, []);
  const patch = useCallback((id: string, change: Partial<Item>) => {
    update(itemsRef.current.map(item => item.id === id ? { ...item, ...change } : item));
  }, [update]);

  const pump = useCallback(() => {
    if (busy.current) return;
    const id = queue.current.shift();
    const item = id && itemsRef.current.find(entry => entry.id === id);
    if (!item) { if (queue.current.length) pump(); return; }
    busy.current = true;
    if (!worker.current) worker.current = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
    const current = worker.current, { target } = settingsRef.current;
    const finish = () => { current.onmessage = null; current.onerror = null; busy.current = false; pump(); };
    current.onmessage = ({ data }: MessageEvent<ConvertResponse>) => {
      if (data.id !== item.id) return;
      if (data.kind === 'progress') { patch(item.id, { progress: data.progress }); return; }
      if (data.kind === 'done') {
        const blob = new Blob([data.buffer], { type: data.mime });
        patch(item.id, { status: 'done', blob, url: URL.createObjectURL(blob), target, info: data.info, error: undefined });
      } else patch(item.id, { status: 'error', error: data.error });
      finish();
    };
    current.onerror = () => { patch(item.id, { status: 'error', error: '转换失败，请重试' }); current.terminate(); worker.current = null; finish(); };
    patch(item.id, { progress: 0 });
    const request: ConvertRequest = { id: item.id, file: item.file, settings: settingsRef.current };
    current.postMessage(request);
  }, [patch]);

  /** 把指定的文件（默认全部）按当前设置转一遍。全部重转时，正在转的那个直接中断。 */
  const enqueue = useCallback((ids?: string[]) => {
    if (!ids) {
      queue.current = [];
      worker.current?.terminate(); worker.current = null; busy.current = false;
    }
    const chosen = ids ?? itemsRef.current.map(item => item.id);
    update(itemsRef.current.map(item => {
      if (!chosen.includes(item.id)) return item;
      if (item.url) URL.revokeObjectURL(item.url);
      return { ...item, status: 'working' as const, progress: undefined, error: undefined, blob: undefined, url: undefined, info: undefined };
    }));
    queue.current.push(...chosen);
    pump();
  }, [pump, update]);

  // 换了格式或码率，已有的文件稍等一下重新转。
  useEffect(() => {
    if (settingsRef.current === settings) return;
    settingsRef.current = settings;
    if (!itemsRef.current.length) return;
    const timer = setTimeout(() => enqueue(), 250);
    return () => clearTimeout(timer);
  }, [settings, enqueue]);

  useEffect(() => () => {
    worker.current?.terminate();
    itemsRef.current.forEach(item => { if (item.url) URL.revokeObjectURL(item.url); });
  }, []);

  const add = useCallback((files: File[], rejected: FileRejection[] = []) => {
    const problems: string[] = [];
    if (rejected.length) problems.push(rejected.some(({ errors }) => errors.some(error => error.code === 'file-too-large')) ? '有文件超过 2 GB，已跳过。' : '有文件不是音频或视频，已跳过。');
    const room = MAX_FILES - itemsRef.current.length;
    if (files.length > room) { problems.push(`一次最多处理 ${MAX_FILES} 个文件，多出的已跳过。`); files = files.slice(0, Math.max(0, room)); }
    setMessage(problems.join(' '));
    if (!files.length) return;
    const added = files.map(file => ({ id: crypto.randomUUID(), name: file.name, size: file.size, file, status: 'working' as const }));
    update([...itemsRef.current, ...added]);
    enqueue(added.map(item => item.id));
  }, [enqueue, update]);

  function clear() {
    queue.current = [];
    worker.current?.terminate(); worker.current = null; busy.current = false;
    itemsRef.current.forEach(item => { if (item.url) URL.revokeObjectURL(item.url); });
    update([]); setMessage('');
  }

  // 输出文件名：原名换上新的扩展名，同一批里不重名。
  const used = new Set<string>();
  const named = items.map(item => ({ ...item, fileName: item.blob && item.target ? uniqueFileName(item.name.replace(/\.[^.]+$/, ''), item.target, used) : '' }));
  const done = named.filter(item => item.status === 'done' && item.blob);
  const pending = items.filter(item => item.status === 'working').length;
  const lossy = targets.find(option => option.value === settings.target)!.lossy;

  async function downloadAll() {
    if (!done.length || zipBusy) return;
    setZipBusy(true);
    try { await downloadZip(done.map(item => ({ name: item.fileName, blob: item.blob! })), 'sumerhub-audio.zip'); }
    catch { setMessage('打包失败，请重试或单独下载。'); }
    finally { setZipBusy(false); }
  }

  return (
    <div className="tool">
      <div className="panel">
        <DropArea accept={ACCEPT} maxSize={MAX_FILE_SIZE} compact={items.length > 0} onFiles={add}
          title="把音频或视频拖到这里" hint="支持 MP3、WAV、FLAC、M4A、OGG、MP4、MOV 等，可多选" compactTitle="继续拖入文件" compactButton="继续添加" preview={<AudioConvertPreview />} inputLabel="选择音频或视频" />

        <div className="controls">
          <div className="field">
            <span>转成</span>
            <div className="segmented" role="group" aria-label="输出格式">
              {targets.map(option => (
                <button key={option.value} aria-pressed={settings.target === option.value} onClick={() => setSettings({ ...settings, target: option.value })}>{option.label}</button>
              ))}
            </div>
          </div>
          {lossy && (
            <label className="field">
              <span>码率</span>
              <select className="select" value={settings.bitrate} onChange={event => setSettings({ ...settings, bitrate: Number(event.target.value) })}>
                {bitrates.map(bitrate => <option key={bitrate} value={bitrate}>{bitrate} kbps</option>)}
              </select>
            </label>
          )}
          {settings.target === 'wav' && (
            <div className="field">
              <span>位深</span>
              <div className="segmented" role="group" aria-label="位深">
                {([16, 24] as const).map(depth => (
                  <button key={depth} aria-pressed={settings.depth === depth} onClick={() => setSettings({ ...settings, depth })}>{depth} 位</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {message && <p className="message" role="status">{message}</p>}

        {items.length > 0 && (
          <section aria-label="转换结果">
            <div className="results-head">
              <span aria-live="polite">
                {pending ? `正在转换 ${items.length - pending} / ${items.length}`
                  : done.length ? `${done.length} 个文件，共 ${formatSize(done.reduce((sum, item) => sum + item.blob!.size, 0))}` : '没有可下载的文件'}
              </span>
              <div>
                <button className="link" onClick={clear} disabled={zipBusy}>清空</button>
                {done.length > 1 && <button className="button" onClick={downloadAll} disabled={zipBusy || pending > 0}>{zipBusy ? '打包中…' : '全部下载'}</button>}
              </div>
            </div>
            <ul className="rows">
              {named.map(item => (
                <li key={item.id} className="row">
                  <div className="row-text">
                    <strong title={item.name}>{item.fileName || item.name}</strong>
                    {item.status === 'error' ? <span className="row-error">{item.error}</span>
                      : item.status === 'working' ? <span>{item.progress === undefined ? '等待中' : `转换中 ${Math.round(item.progress * 100)}%`}</span>
                      : <span>{describe(item.info!)}</span>}
                  </div>
                  {item.status === 'done' && item.blob && (
                    <>
                      <span className="row-meta optional">{formatSize(item.size)} →</span>
                      <span className="row-meta"><b>{formatSize(item.blob.size)}</b></span>
                      <a className="icon" href={item.url} download={item.fileName} aria-label={'下载 ' + item.fileName}><PiArrowDown size={16} /></a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <dl className="notes">
        <div><dt>隐私</dt><dd>文件只在浏览器里转换，不会上传。关掉页面后结果会清除。</dd></div>
        <div><dt>视频</dt><dd>拖进视频会只取出里面的声音，画面不保留。</dd></div>
        <div><dt>音质</dt><dd>原文件已经是选的格式、码率也不更高时，会原样取出，不重新编码。把 MP3 转成 WAV 或 FLAC 不会让音质变好，只是换了格式。</dd></div>
      </dl>
      <p className="fine">
        读取、解码和封装使用 <a href="https://github.com/Vanilagy/mediabunny" target="_blank" rel="noopener noreferrer">Mediabunny</a>，
        MP3 编码使用 <a href="/licenses/lame-LGPL-2.0.txt" target="_blank">LAME</a>，
        AAC 编码使用 <a href="/licenses/ffmpeg-LGPL-2.1.txt" target="_blank">FFmpeg</a>，
        FLAC 编码使用 <a href="/licenses/libflac-BSD-3-Clause.txt" target="_blank">libFLAC</a>。
      </p>
    </div>
  );
}
