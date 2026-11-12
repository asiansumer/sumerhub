'use client';

/* 缩略图是本地 blob URL，用原生 img 即可。 */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { PiArrowDown } from 'react-icons/pi';
import DropArea from '@/components/drop-area';
import { downloadZip } from '@/lib/download';
import { formatSize, uniqueFileName } from '@/lib/format';
import ImageCompressPreview from './preview';
import { extensions, type CompressRequest, type CompressResponse, type OutputFormat, type Settings } from './types';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 100;
const formats: { value: OutputFormat; label: string }[] = [
  { value: 'keep', label: '原格式' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WebP' }, { value: 'png', label: 'PNG' },
];
const sides = [0, 3840, 2560, 1920, 1280, 800];

type Item = {
  id: string; name: string; originalSize: number; thumbUrl: string;
  /** 交给压缩器的图：一般就是原文件，HEIC 会先解码成 PNG。 */
  source: Blob; sourceType: string;
  status: 'working' | 'done' | 'error'; error?: string;
  blob?: Blob; url?: string; outName?: string; width?: number; height?: number; kept?: boolean;
};

const isHeic = (file: File) => /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type);

export default function ImageCompress() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>({ format: 'keep', quality: 75, maxSide: 0 });
  const [message, setMessage] = useState('');
  const [zipBusy, setZipBusy] = useState(false);
  const worker = useRef<Worker | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const settingsRef = useRef(settings);
  /** 每次重新压缩都换一个批次号，旧批次的结果直接丢掉。 */
  const run = useRef(0);
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
    if (!worker.current) worker.current = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
    const batch = run.current, current = worker.current;
    const finish = () => { current.onmessage = null; current.onerror = null; busy.current = false; pump(); };
    current.onmessage = ({ data }: MessageEvent<CompressResponse>) => {
      if (batch === run.current && data.id === item.id) {
        const existing = itemsRef.current.find(entry => entry.id === item.id);
        if (existing?.url) URL.revokeObjectURL(existing.url);
        if (data.ok) patch(item.id, { status: 'done', blob: data.blob, url: URL.createObjectURL(data.blob), width: data.width, height: data.height, kept: data.kept, outName: data.format, error: undefined });
        else patch(item.id, { status: 'error', error: data.error, blob: undefined, url: undefined });
      }
      finish();
    };
    current.onerror = () => { if (batch === run.current) patch(item.id, { status: 'error', error: '压缩失败，请重试' }); worker.current?.terminate(); worker.current = null; finish(); };
    const request: CompressRequest = { id: item.id, blob: item.source, sourceType: item.sourceType, settings: settingsRef.current };
    current.postMessage(request);
  }, [patch]);

  /** 把指定的图片（默认全部）按当前设置重新压一遍。 */
  const enqueue = useCallback((ids?: string[]) => {
    if (!ids) { run.current++; queue.current = []; }
    const targets = ids ?? itemsRef.current.map(item => item.id);
    update(itemsRef.current.map(item => targets.includes(item.id) ? { ...item, status: 'working' as const, error: undefined } : item));
    queue.current.push(...targets);
    pump();
  }, [pump, update]);

  // 调整设置后稍等一下再重压，拖动滑块时不会反复计算。
  useEffect(() => {
    if (settingsRef.current === settings) return;
    settingsRef.current = settings;
    if (!itemsRef.current.length) return;
    const timer = setTimeout(() => enqueue(), 250);
    return () => clearTimeout(timer);
  }, [settings, enqueue]);

  useEffect(() => () => {
    worker.current?.terminate();
    itemsRef.current.forEach(item => { URL.revokeObjectURL(item.thumbUrl); if (item.url) URL.revokeObjectURL(item.url); });
  }, []);

  const add = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    const problems: string[] = [];
    if (rejected.length) problems.push(rejected.some(({ errors }) => errors.some(error => error.code === 'file-too-large')) ? '有图片超过 50 MB，已跳过。' : '有文件不是图片，已跳过。');
    const room = MAX_FILES - itemsRef.current.length;
    if (files.length > room) { problems.push(`一次最多处理 ${MAX_FILES} 张，多出的已跳过。`); files = files.slice(0, Math.max(0, room)); }
    setMessage(problems.join(' '));
    for (const file of files) {
      const id = crypto.randomUUID();
      if (!isHeic(file)) {
        update([...itemsRef.current, { id, name: file.name, originalSize: file.size, thumbUrl: URL.createObjectURL(file), source: file, sourceType: file.type, status: 'working' }]);
        enqueue([id]);
        continue;
      }
      // HEIC 浏览器不认识，先用 libheif 解码，再走和其他图片一样的流程。
      update([...itemsRef.current, { id, name: file.name, originalSize: file.size, thumbUrl: '', source: file, sourceType: 'image/heic', status: 'working' }]);
      try {
        const { default: heic2any } = await import('heic2any');
        const decoded = await heic2any({ blob: file, toType: 'image/png' });
        const source = Array.isArray(decoded) ? decoded[0] : decoded;
        if (!itemsRef.current.some(item => item.id === id)) continue;
        patch(id, { source, thumbUrl: URL.createObjectURL(source) });
        enqueue([id]);
      } catch { patch(id, { status: 'error', error: '无法读取这张 HEIC 图片' }); }
    }
  }, [enqueue, patch, update]);

  function clear() {
    run.current++; queue.current = [];
    itemsRef.current.forEach(item => { URL.revokeObjectURL(item.thumbUrl); if (item.url) URL.revokeObjectURL(item.url); });
    update([]); setMessage('');
  }

  // 输出文件名：原名换上新的扩展名，同一批里不重名。
  const used = new Set<string>();
  const named = items.map(item => ({ ...item, fileName: item.blob && item.outName ? uniqueFileName(item.name.replace(/\.[^.]+$/, ''), extensions[item.outName as keyof typeof extensions], used) : '' }));
  const done = named.filter(item => item.status === 'done' && item.blob);
  const working = items.some(item => item.status === 'working');
  const before = done.reduce((sum, item) => sum + item.originalSize, 0), after = done.reduce((sum, item) => sum + item.blob!.size, 0);

  async function downloadAll() {
    if (!done.length || zipBusy) return;
    setZipBusy(true);
    try { await downloadZip(done.map(item => ({ name: item.fileName, blob: item.blob! })), 'sumerhub-images.zip'); }
    catch { setMessage('打包失败，请重试或单独下载。'); }
    finally { setZipBusy(false); }
  }

  return (
    <div className="tool">
      <div className="panel">
        <DropArea accept={{ 'image/*': ['.heic', '.heif'] }} maxSize={MAX_FILE_SIZE} compact={items.length > 0} onFiles={add}
          title="把图片拖到这里" hint="支持 JPG、PNG、WebP、HEIC 等，可多选" compactTitle="继续拖入图片" compactButton="继续添加" preview={<ImageCompressPreview />} inputLabel="选择图片" />

        <div className="controls">
          <div className="field">
            <span>格式</span>
            <div className="segmented" role="group" aria-label="输出格式">
              {formats.map(option => (
                <button key={option.value} aria-pressed={settings.format === option.value} onClick={() => setSettings({ ...settings, format: option.value })}>{option.label}</button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>质量</span>
            <input type="range" min={10} max={100} step={1} value={settings.quality} onChange={event => setSettings({ ...settings, quality: Number(event.target.value) })} />
            <output>{settings.quality}</output>
          </label>
          <label className="field">
            <span>最长边</span>
            <select className="select" value={settings.maxSide} onChange={event => setSettings({ ...settings, maxSide: Number(event.target.value) })}>
              {sides.map(side => <option key={side} value={side}>{side ? `${side} px` : '原尺寸'}</option>)}
            </select>
          </label>
        </div>

        {message && <p className="message" role="status">{message}</p>}

        {items.length > 0 && (
          <section aria-label="压缩结果">
            <div className="results-head">
              <span aria-live="polite">
                {working ? `正在压缩 ${items.length - items.filter(item => item.status === 'working').length} / ${items.length}`
                  : done.length ? `${done.length} 张，${formatSize(before)} → ${formatSize(after)}，${after <= before ? '省了' : '大了'} ${Math.abs(Math.round((1 - after / before) * 100))}%` : '没有可下载的图片'}
              </span>
              <div>
                <button className="link" onClick={clear} disabled={zipBusy}>清空</button>
                {done.length > 1 && <button className="button" onClick={downloadAll} disabled={zipBusy || working}>{zipBusy ? '打包中…' : '全部下载'}</button>}
              </div>
            </div>
            <ul className="rows">
              {named.map(item => (
                <li key={item.id} className="row">
                  <span className="thumb">{item.thumbUrl && <img src={item.thumbUrl} alt="" />}</span>
                  <div className="row-text">
                    <strong title={item.name}>{item.fileName || item.name}</strong>
                    {item.status === 'error' ? <span className="row-error">{item.error}</span>
                      : item.status === 'working' ? <span>处理中…</span>
                      : <span>{item.width} × {item.height}{item.kept ? '，原图已经很小，保持不变' : ''}</span>}
                  </div>
                  {item.status === 'done' && item.blob && (
                    <>
                      <span className="row-meta optional">{formatSize(item.originalSize)} →</span>
                      <span className="row-meta"><b>{formatSize(item.blob.size)}</b></span>
                      <span className={item.blob.size < item.originalSize ? 'row-meta saving' : 'row-meta saving none'}>{item.kept ? '0%' : `${item.blob.size <= item.originalSize ? '−' : '+'}${Math.abs(Math.round((1 - item.blob.size / item.originalSize) * 100))}%`}</span>
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
        <div><dt>隐私</dt><dd>图片只在浏览器里处理，不会上传。关掉页面后结果会清除。</dd></div>
        <div><dt>格式</dt><dd>「原格式」会保持 JPG、PNG、WebP 不变，HEIC 等其他格式转成 JPG。</dd></div>
        <div><dt>质量</dt><dd>数值越低文件越小。PNG 靠减少颜色数来压缩，90 以上为无损。</dd></div>
      </dl>
      <p className="fine">
        JPG 和 WebP 编码使用 Squoosh 的 MozJPEG、libwebp（<a href="https://github.com/jamsinclair/jSquash" target="_blank" rel="noopener noreferrer">jSquash</a>），
        PNG 使用 <a href="https://github.com/photopea/UPNG.js" target="_blank" rel="noopener noreferrer">UPNG.js</a>，
        HEIC 解码使用 <a href="https://github.com/alexcorvi/heic2any" target="_blank" rel="noopener noreferrer">heic2any</a>。
      </p>
    </div>
  );
}
