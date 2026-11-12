'use client';

/* 预览图是本地 blob URL，用原生 img 即可。 */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { PiArrowDown } from 'react-icons/pi';
import DropArea from '@/components/drop-area';
import { downloadZip } from '@/lib/download';
import { formatSize, uniqueFileName } from '@/lib/format';
import { compose, thumbnail } from './lib/compose';
import RemoveBgPreview from './preview';
import { backgrounds, extensions, fill, models, outputFormat, type CutRequest, type CutResponse, type Settings } from './types';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 30;

type Item = {
  id: string; name: string;
  /** 交给模型的图：一般就是原文件；浏览器自己解不了的 HEIC 会先解码成 PNG。 */
  source: Blob;
  /** 原图的小图，卡片上显示用。 */
  originalUrl: string;
  status: 'working' | 'done' | 'error'; error?: string;
  /** 浏览器报的原话，出错时小字显示，方便排查。 */
  detail?: string;
  /** 抠好的透明 PNG。换背景、换格式都从它出发，不用重新抠。 */
  cutout?: Blob; width?: number; height?: number;
  /** 抠图结果的小图，卡片上显示用。 */
  previewUrl?: string;
  /** 按当前设置导出的文件。 */
  blob?: Blob; url?: string; format?: 'png' | 'jpeg';
};

const isHeic = (file: File) => /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type);
/** 放掉一张图占着的 blob URL。original 为 false 时留着原图的小图（重新抠的时候还要显示）。 */
function release(item: Item, original = true) {
  if (original && item.originalUrl) URL.revokeObjectURL(item.originalUrl);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.url) URL.revokeObjectURL(item.url);
}

export default function RemoveBg() {
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>({ model: 'general', background: 'transparent', color: '#3b82f6', format: 'png' });
  const [message, setMessage] = useState('');
  const [model, setModel] = useState<{ loaded: number; total: number } | null>(null);
  /** 上一张是用显卡还是 CPU 算的；CPU 慢得多，要告诉用户。 */
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  /** 正在看原图的那一张。 */
  const [peek, setPeek] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const settingsRef = useRef(settings);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  /** 导出一张一张来：几千万像素的图同时导出好几张，手机内存不够。 */
  const exporting = useRef<Promise<void>>(Promise.resolve());

  const update = useCallback((next: Item[]) => { itemsRef.current = next; setItems(next); }, []);
  const patch = useCallback((id: string, change: Partial<Item>) => {
    update(itemsRef.current.map(item => item.id === id ? { ...item, ...change } : item));
  }, [update]);

  /** 按当前设置把抠好的图导出一遍。设置中途又变了的话，这次结果作废。 */
  const render = useCallback((id: string) => {
    exporting.current = exporting.current.then(async () => {
      const item = itemsRef.current.find(entry => entry.id === id), used = settingsRef.current;
      if (!item?.cutout) return;
      try {
        const blob = await compose(item.cutout, used);
        const latest = itemsRef.current.find(entry => entry.id === id);
        if (!latest || latest.cutout !== item.cutout || settingsRef.current !== used) return;
        if (latest.url) URL.revokeObjectURL(latest.url);
        patch(id, { status: 'done', blob, url: URL.createObjectURL(blob), format: outputFormat(used), error: undefined, detail: undefined });
      } catch (error) { patch(id, { status: 'error', error: error instanceof Error ? error.message : '导出失败' }); }
    });
  }, [patch]);

  const pump = useCallback(() => {
    if (busy.current) return;
    const id = queue.current.shift();
    const item = id && itemsRef.current.find(entry => entry.id === id);
    if (!item) { if (queue.current.length) pump(); return; }
    busy.current = true;
    if (!worker.current) worker.current = new Worker(new URL('./remove.worker.ts', import.meta.url), { type: 'module' });
    const current = worker.current;
    const finish = () => { current.onmessage = null; current.onerror = null; busy.current = false; pump(); };
    current.onmessage = ({ data }: MessageEvent<CutResponse>) => {
      if (data.kind === 'model') { setModel(data.loaded < data.total ? { loaded: data.loaded, total: data.total } : null); return; }
      if (data.id !== item.id) return;
      setModel(null);
      if (data.kind === 'done') { setDevice(data.device); patch(item.id, { cutout: data.cutout, previewUrl: URL.createObjectURL(data.preview), width: data.width, height: data.height }); render(item.id); }
      else patch(item.id, { status: 'error', error: data.error, detail: data.detail });
      finish();
    };
    current.onerror = () => { setModel(null); patch(item.id, { status: 'error', error: '抠图失败，请重试' }); current.terminate(); worker.current = null; finish(); };
    const request: CutRequest = { id: item.id, image: item.source, model: settingsRef.current.model };
    current.postMessage(request);
  }, [patch, render]);

  // 换背景或格式：已经抠好的图重新导出，不用再跑模型。换模型：全部重新抠一遍。
  useEffect(() => {
    const previous = settingsRef.current;
    if (previous === settings) return;
    settingsRef.current = settings;
    if (previous.model !== settings.model) {
      if (!itemsRef.current.length) return;
      // 正在抠的那张直接中断，换上新模型从头来。
      worker.current?.terminate(); worker.current = null; busy.current = false;
      setModel(null); setPeek(null);
      const ids = itemsRef.current.filter(item => item.originalUrl).map(item => item.id);
      update(itemsRef.current.map(item => {
        if (!ids.includes(item.id)) return item;
        release(item, false);
        return { ...item, status: 'working' as const, error: undefined, detail: undefined, cutout: undefined, previewUrl: undefined, blob: undefined, url: undefined };
      }));
      queue.current = ids;
      pump();
      return;
    }
    const timer = setTimeout(() => { itemsRef.current.forEach(item => { if (item.cutout) render(item.id); }); }, 120);
    return () => clearTimeout(timer);
  }, [settings, render, pump, update]);

  useEffect(() => () => {
    worker.current?.terminate();
    itemsRef.current.forEach(item => release(item));
  }, []);

  const add = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    const problems: string[] = [];
    if (rejected.length) problems.push(rejected.some(({ errors }) => errors.some(error => error.code === 'file-too-large')) ? '有图片超过 50 MB，已跳过。' : '有文件不是图片，已跳过。');
    const room = MAX_FILES - itemsRef.current.length;
    if (files.length > room) { problems.push(`一次最多处理 ${MAX_FILES} 张，多出的已跳过。`); files = files.slice(0, Math.max(0, room)); }
    setMessage(problems.join(' '));
    for (const file of files) {
      const id = crypto.randomUUID();
      update([...itemsRef.current, { id, name: file.name, source: file, originalUrl: '', status: 'working' }]);
      let source: Blob = file;
      // 先做一张小图。做得出来说明浏览器能解这张图（Safari 连 HEIC 也能解），原文件直接交给模型。
      let small = await thumbnail(file).catch(() => null);
      if (!small && isHeic(file)) {
        // 这个浏览器不认识 HEIC：用 libheif 解码成 PNG，再走和其他图片一样的流程。
        try {
          const { default: heic2any } = await import('heic2any');
          const decoded = await heic2any({ blob: file, toType: 'image/png' });
          source = Array.isArray(decoded) ? decoded[0] : decoded;
          small = await thumbnail(source);
        } catch { small = null; }
      }
      if (!itemsRef.current.some(item => item.id === id)) continue;
      if (!small) { patch(id, { status: 'error', error: isHeic(file) ? '无法读取这张 HEIC 图片' : '无法读取这张图片' }); continue; }
      patch(id, { source, originalUrl: URL.createObjectURL(small) });
      queue.current.push(id); pump();
    }
  }, [patch, pump, update]);

  function clear() {
    queue.current = [];
    // 正在抠的那张直接中断；模型已经在浏览器缓存里，下次不用重新下载。
    if (busy.current) { worker.current?.terminate(); worker.current = null; busy.current = false; }
    itemsRef.current.forEach(item => release(item));
    update([]); setMessage(''); setModel(null); setPeek(null);
  }

  // 输出文件名：原名换上新的扩展名，同一批里不重名。
  const used = new Set<string>();
  const named = items.map(item => ({ ...item, fileName: item.blob && item.format ? uniqueFileName(item.name.replace(/\.[^.]+$/, ''), extensions[item.format], used) : '' }));
  const done = named.filter(item => item.status === 'done' && item.blob);
  const pending = items.filter(item => item.status === 'working').length;
  const color = fill(settings);

  async function downloadAll() {
    if (!done.length || zipBusy) return;
    setZipBusy(true);
    try { await downloadZip(done.map(item => ({ name: item.fileName, blob: item.blob! })), 'sumerhub-cutouts.zip'); }
    catch { setMessage('打包失败，请重试或单独下载。'); }
    finally { setZipBusy(false); }
  }

  return (
    <div className="tool">
      <div className="panel">
        <DropArea accept={{ 'image/*': ['.heic', '.heif'] }} maxSize={MAX_FILE_SIZE} compact={items.length > 0} onFiles={add}
          title="把照片拖到这里" hint="支持 JPG、PNG、WebP、HEIC 等，可多选" compactTitle="继续拖入照片" compactButton="继续添加" preview={<RemoveBgPreview />} inputLabel="选择照片" />

        <div className="controls">
          <div className="field">
            <span>模型</span>
            <div className="segmented" role="group" aria-label="模型">
              {models.map(option => (
                <button key={option.value} aria-pressed={settings.model === option.value} onClick={() => setSettings({ ...settings, model: option.value })}>{option.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>背景</span>
            <div className="segmented" role="group" aria-label="背景">
              {backgrounds.map(option => (
                <button key={option.value} aria-pressed={settings.background === option.value} onClick={() => setSettings({ ...settings, background: option.value })}>{option.label}</button>
              ))}
            </div>
            {settings.background === 'custom' && (
              <input className="swatch" type="color" aria-label="背景颜色" value={settings.color} onChange={event => setSettings({ ...settings, color: event.target.value })} />
            )}
          </div>
          {settings.background !== 'transparent' && (
            <div className="field">
              <span>格式</span>
              <div className="segmented" role="group" aria-label="输出格式">
                {(['png', 'jpeg'] as const).map(format => (
                  <button key={format} aria-pressed={settings.format === format} onClick={() => setSettings({ ...settings, format })}>{extensions[format].toUpperCase()}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {message && <p className="message" role="status">{message}</p>}
        {model && (
          <div className="progress" role="status">
            <div className="progress-label"><span>正在下载抠图模型，只需要一次</span><span>{formatSize(model.loaded)} / {formatSize(model.total)}</span></div>
            <div className="bar"><span style={{ width: `${Math.round(model.loaded / model.total * 100)}%` }} /></div>
          </div>
        )}

        {items.length > 0 && (
          <section aria-label="抠图结果" data-device={device ?? undefined}>
            <div className="results-head">
              <span aria-live="polite">
                {pending ? `正在抠图 ${items.length - pending} / ${items.length}${device === 'wasm' ? '，这个浏览器用不了显卡加速，每张要十几秒' : ''}`
                  : done.length ? `${done.length} 张，共 ${formatSize(done.reduce((sum, item) => sum + item.blob!.size, 0))}` : '没有可下载的图片'}
              </span>
              <div>
                <button className="link" onClick={clear} disabled={zipBusy}>清空</button>
                {done.length > 1 && <button className="button" onClick={downloadAll} disabled={zipBusy || pending > 0}>{zipBusy ? '打包中…' : '全部下载'}</button>}
              </div>
            </div>
            <ul className="cutouts">
              {named.map(item => {
                const original = peek === item.id || !item.url || !item.previewUrl;
                return (
                  <li key={item.id} className={'cutout' + (item.status === 'working' ? ' working' : '')}>
                    <div className={'cutout-view' + (original ? '' : ' checker')} style={!original && color ? { background: color } : undefined}>
                      {(original ? item.originalUrl : item.previewUrl) && <img src={original ? item.originalUrl : item.previewUrl} alt={original ? '原图' : '抠图结果'} decoding="async" />}
                      {item.status === 'working' && <i className="cutout-scan" />}
                    </div>
                    <div className="cutout-foot">
                      <div className="row-text">
                        <strong title={item.name}>{item.fileName || item.name}</strong>
                        {item.status === 'error' ? <span className="row-error" title={item.detail}>{item.error}{item.detail && <small> · {item.detail}</small>}</span>
                          : item.status === 'working' ? <span>{model ? '等模型下载完' : '抠图中…'}</span>
                          : <span>{item.width} × {item.height} · {formatSize(item.blob!.size)}</span>}
                      </div>
                      {item.status === 'done' && item.url && (
                        <>
                          <button className="cutout-peek" aria-pressed={peek === item.id} onClick={() => setPeek(peek === item.id ? null : item.id)}>原图</button>
                          <a className="icon" href={item.url} download={item.fileName} aria-label={'下载 ' + item.fileName}><PiArrowDown size={16} /></a>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <dl className="notes">
        <div><dt>隐私</dt><dd>照片只在浏览器里处理，不会上传。关掉页面后结果会清除。</dd></div>
        <div><dt>第一次用</dt><dd>要先下载抠图模型（约 95 MB），之后浏览器会记住，不用再下。</dd></div>
        <div><dt>模型</dt><dd>「通用」适合人、动物和物品。自行车、栏杆、网兜这类镂空的东西抠不干净时，换「镂空细节」试试。</dd></div>
      </dl>
      <p className="fine">
        「通用」模型是 <a href="https://github.com/ZhengPeng7/BiRefNet" target="_blank" rel="noopener noreferrer">BiRefNet</a> 的轻量版（<a href="/licenses/birefnet-MIT.txt" target="_blank">MIT</a>），
        「镂空细节」是 <a href="https://github.com/xuebinqin/DIS" target="_blank" rel="noopener noreferrer">IS-Net</a>（<a href="/licenses/isnet-Apache-2.0.txt" target="_blank">Apache-2.0</a>），
        用 <a href="https://github.com/huggingface/transformers.js" target="_blank" rel="noopener noreferrer">Transformers.js</a> 和 ONNX Runtime 在浏览器里运行。
      </p>
    </div>
  );
}
