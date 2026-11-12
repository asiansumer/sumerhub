'use client';

/* 缩略图是本地 blob URL，用原生 img 即可。 */
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PiArrowClockwise, PiArrowDown, PiCheck, PiFilePdf, PiX } from 'react-icons/pi';
import DropArea from '@/components/drop-area';
import { saveUrl, zipFiles } from '@/lib/download';
import { formatSize, uniqueFileName } from '@/lib/format';
import { jpegOrientation } from './lib/pdf';
import { openPdf, renderThumbnail } from './lib/render';
import PdfPagesPreview from './preview';
import type { PdfRequest, PdfResponse } from './types';

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const MAX_PAGES = 1000;
const ACCEPT = { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'] };

type Source = { id: string; name: string; blob: Blob; document: PDFDocumentProxy };
type Page = {
  id: string; source: string;
  /** 在原文件里是第几页，从 0 数。 */
  index: number;
  /** 顺时针转了多少度。一直累加，不取余数，这样缩略图总是顺着一个方向转。 */
  rotate: number;
  thumb?: string;
};
type Mode = 'single' | 'each';
type Result = { name: string; url: string; size: number; pages: number; files: number };

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const isHeic = (file: File) => /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type);
const stem = (name: string) => name.replace(/\.[^.]+$/, '');

type CardProps = {
  page: Page; position: number; label: string; selected: boolean;
  onToggle: (id: string) => void; onRotate: (id: string) => void; onRemove: (id: string) => void;
};

/** 一页的卡片。可以拖动排序，点一下选中。 */
const PageCard = memo(function PageCard({ page, position, label, selected, onToggle, onRotate, onRemove }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  return (
    <li ref={setNodeRef} {...attributes} {...listeners} title={label}
      className={'leaf' + (selected ? ' selected' : '') + (isDragging ? ' dragging' : '')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onToggle(page.id)}>
      <div className="leaf-sheet">
        {page.thumb ? <img src={page.thumb} alt="" draggable={false} style={{ transform: `rotate(${page.rotate}deg)` }} /> : <i className="leaf-blank" />}
        {selected && <span className="leaf-check"><PiCheck size={11} /></span>}
      </div>
      <div className="leaf-foot">
        <span>{position}</span>
        <span>
          <button className="icon" onClick={event => { event.stopPropagation(); onRotate(page.id); }} aria-label={`把第 ${position} 页顺时针转 90 度`}><PiArrowClockwise size={14} /></button>
          <button className="icon" onClick={event => { event.stopPropagation(); onRemove(page.id); }} aria-label={`删除第 ${position} 页`}><PiX size={14} /></button>
        </span>
      </div>
    </li>
  );
});

export default function PdfPages() {
  const [pages, setPages] = useState<Page[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('single');
  const [problems, setProblems] = useState<{ name: string; text: string }[]>([]);
  const [reading, setReading] = useState(0);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const pagesRef = useRef<Page[]>([]);
  const sources = useRef(new Map<string, Source>());
  const worker = useRef<Worker | null>(null);
  const thumbQueue = useRef<string[]>([]);
  const drawing = useRef(false);
  const resultRef = useRef<Result | null>(null);

  const update = useCallback((next: Page[]) => { pagesRef.current = next; setPages(next); }, []);
  const showResult = useCallback((next: Result | null) => {
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    resultRef.current = next; setResult(next);
  }, []);

  /** 向后台线程发一个请求，等它回同一个 id 的结果。 */
  const ask = useCallback((request: PdfRequest, transfer: Transferable[], onProgress?: (done: number) => void) => new Promise<PdfResponse>((resolve, reject) => {
    if (!worker.current) worker.current = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    const current = worker.current;
    const done = () => { current.removeEventListener('message', onMessage); current.removeEventListener('error', onError); };
    const onMessage = ({ data }: MessageEvent<PdfResponse>) => {
      if (data.id !== request.id) return;
      if (data.kind === 'progress') { onProgress?.(data.done); return; }
      done(); resolve(data);
    };
    const onError = () => { done(); worker.current?.terminate(); worker.current = null; reject(new Error('处理失败，请重试')); };
    current.addEventListener('message', onMessage); current.addEventListener('error', onError);
    current.postMessage(request, transfer);
  }), []);

  /** 缩略图一张一张画，页数多的时候不会卡住页面。 */
  const drawThumbs = useCallback(async () => {
    if (drawing.current) return;
    drawing.current = true;
    for (let id = thumbQueue.current.shift(); id; id = thumbQueue.current.shift()) {
      const page = pagesRef.current.find(entry => entry.id === id), source = page && sources.current.get(page.source);
      if (!page || !source) continue;
      try {
        const thumb = await renderThumbnail(source.document, page.index);
        if (pagesRef.current.some(entry => entry.id === id)) update(pagesRef.current.map(entry => entry.id === id ? { ...entry, thumb } : entry));
        else URL.revokeObjectURL(thumb);
      } catch { /* 画不出来就留着占位的白纸，不影响导出。 */ }
    }
    drawing.current = false;
  }, [update]);

  /** 图片先做成单页 PDF，之后和普通 PDF 一样处理。 */
  const imageAsPdf = useCallback(async (file: File) => {
    let image: Blob = file, type: 'jpeg' | 'png' | '' = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpeg' : '';
    if (isHeic(file)) {
      const { default: heic2any } = await import('heic2any');
      const decoded = await heic2any({ blob: file, toType: 'image/png' });
      image = Array.isArray(decoded) ? decoded[0] : decoded; type = '';
    }
    let bytes = await image.arrayBuffer();
    // 手机拍的 JPG 常常靠 EXIF 记录方向；这种图和其他格式一样，先在画布上摆正再存成 JPG。
    if (!type || (type === 'jpeg' && jpegOrientation(new Uint8Array(bytes)) !== 1)) {
      const bitmap = await createImageBitmap(image);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const flattened = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!flattened) throw new Error('这张图片读不出来');
      bytes = await flattened.arrayBuffer(); type = 'jpeg';
    }
    const response = await ask({ id: crypto.randomUUID(), kind: 'image', bytes, type }, [bytes]);
    if (response.kind !== 'image') throw new Error(response.kind === 'error' ? response.error : '这张图片读不出来');
    return new Blob([response.bytes], { type: 'application/pdf' });
  }, [ask]);

  const add = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    const found: { name: string; text: string }[] = rejected.map(({ file, errors }) => ({ name: file.name, text: errors.some(error => error.code === 'file-too-large') ? '超过 200 MB，已跳过' : '不是 PDF 或图片，已跳过' }));
    setProblems(found); setReading(files.length);
    for (const file of files) {
      try {
        const blob = isPdf(file) ? file : await imageAsPdf(file).catch(error => { throw new Error(error instanceof Error && /[一-龥]/.test(error.message) ? error.message : '这张图片读不出来'); });
        const document = await openPdf(await blob.arrayBuffer());
        if (pagesRef.current.length + document.numPages > MAX_PAGES) { void document.destroy(); throw new Error(`加上它会超过 ${MAX_PAGES} 页，已跳过`); }
        const source: Source = { id: crypto.randomUUID(), name: file.name, blob, document };
        sources.current.set(source.id, source);
        const added = Array.from({ length: document.numPages }, (_, index) => ({ id: crypto.randomUUID(), source: source.id, index, rotate: 0 }));
        update([...pagesRef.current, ...added]);
        thumbQueue.current.push(...added.map(page => page.id));
        void drawThumbs();
      } catch (error) {
        found.push({ name: file.name, text: error instanceof Error ? error.message : '读不出来' });
        setProblems([...found]);
      }
      setReading(count => Math.max(0, count - 1));
    }
  }, [drawThumbs, imageAsPdf, update]);

  /** 一个文件的页都删光了，就把它占的内存放掉。 */
  const release = useCallback((remaining: Page[]) => {
    const used = new Set(remaining.map(page => page.source));
    for (const [id, source] of sources.current) if (!used.has(id)) { void source.document.destroy(); sources.current.delete(id); }
  }, []);

  const toggle = useCallback((id: string) => setSelected(current => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; }), []);
  const rotate = useCallback((id: string) => update(pagesRef.current.map(page => page.id === id ? { ...page, rotate: page.rotate + 90 } : page)), [update]);
  const remove = useCallback((id: string) => {
    const page = pagesRef.current.find(entry => entry.id === id);
    if (page?.thumb) URL.revokeObjectURL(page.thumb);
    const next = pagesRef.current.filter(entry => entry.id !== id);
    update(next); release(next);
    setSelected(current => { if (!current.has(id)) return current; const copy = new Set(current); copy.delete(id); return copy; });
  }, [release, update]);

  const clear = useCallback(() => {
    thumbQueue.current = [];
    pagesRef.current.forEach(page => { if (page.thumb) URL.revokeObjectURL(page.thumb); });
    update([]); release([]); setSelected(new Set()); setProblems([]); showResult(null);
  }, [release, showResult, update]);

  useEffect(() => () => {
    worker.current?.terminate();
    pagesRef.current.forEach(page => { if (page.thumb) URL.revokeObjectURL(page.thumb); });
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    sources.current.forEach(source => { void source.document.destroy(); });
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // 手指要按住一小会儿才开始拖，这样还能正常滚动页面。
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = pagesRef.current.findIndex(page => page.id === active.id), to = pagesRef.current.findIndex(page => page.id === over.id);
    if (from >= 0 && to >= 0) update(arrayMove(pagesRef.current, from, to));
  }, [update]);

  const chosen = selected.size ? pages.filter(page => selected.has(page.id)) : pages;

  async function exportPdf() {
    if (!chosen.length || exporting) return;
    setExporting({ done: 0, total: chosen.length }); setProblems([]);
    try {
      const ids = [...new Set(chosen.map(page => page.source))];
      const data = await Promise.all(ids.map(async id => ({ id, bytes: await sources.current.get(id)!.blob.arrayBuffer() })));
      const plan = chosen.map(({ source, index, rotate: turned }) => ({ source, index, rotate: turned % 360 }));
      const response = await ask({ id: crypto.randomUUID(), kind: 'build', mode, sources: data, pages: plan }, data.map(item => item.bytes),
        done => setExporting({ done, total: chosen.length }));
      if (response.kind === 'error') throw new Error(response.error);
      if (response.kind !== 'build') throw new Error('导出失败，请重试');
      const base = stem(sources.current.get(chosen[0].source)!.name);
      const whole = ids.length === 1 && chosen.length === pages.filter(page => page.source === ids[0]).length;
      let blob: Blob, name: string;
      if (mode === 'single') {
        blob = new Blob([response.files[0]], { type: 'application/pdf' });
        name = uniqueFileName(base + (ids.length > 1 ? '-合并' : whole ? '-整理' : '-节选'), 'pdf', new Set());
      } else {
        const used = new Set<string>(), digits = String(response.files.length).length;
        blob = await zipFiles(response.files.map((bytes, index) => ({ name: uniqueFileName(`${base}-${String(index + 1).padStart(digits, '0')}`, 'pdf', used), blob: new Blob([bytes], { type: 'application/pdf' }) })));
        name = uniqueFileName(base + '-单页', 'zip', new Set());
      }
      const next = { name, url: URL.createObjectURL(blob), size: blob.size, pages: chosen.length, files: response.files.length };
      showResult(next); saveUrl(next.url, next.name);
    } catch (error) {
      setProblems([{ name: '导出', text: error instanceof Error ? error.message : '导出失败，请重试' }]);
    } finally { setExporting(null); }
  }

  const fileCount = new Set(pages.map(page => page.source)).size;

  return (
    <div className="tool">
      <div className="panel">
        <DropArea accept={ACCEPT} maxSize={MAX_FILE_SIZE} compact={pages.length > 0} onFiles={add}
          title="把 PDF 或图片拖到这里" hint="可以多选，页面会按顺序接在一起" compactTitle="继续拖入 PDF 或图片" compactButton="继续添加" preview={<PdfPagesPreview />} inputLabel="选择 PDF 或图片" />

        {pages.length > 0 && (
          <div className="controls">
            <div className="field">
              <span>导出成</span>
              <div className="segmented" role="group" aria-label="导出方式">
                <button aria-pressed={mode === 'single'} onClick={() => setMode('single')}>一个 PDF</button>
                <button aria-pressed={mode === 'each'} onClick={() => setMode('each')}>每页一个</button>
              </div>
            </div>
            <button className="button controls-end" onClick={exportPdf} disabled={!!exporting}>
              {exporting ? (mode === 'each' ? `正在导出 ${exporting.done} / ${exporting.total}` : '正在导出…') : selected.size ? `导出选中的 ${selected.size} 页` : '导出 PDF'}
            </button>
          </div>
        )}

        {problems.length > 0 && <div className="errors" role="status">{problems.map((problem, index) => <p key={index}><span>{problem.name}</span>{problem.text}</p>)}</div>}

        {result && (
          <ul className="rows result-row">
            <li className="row">
              <span className="thumb"><PiFilePdf size={18} /></span>
              <div className="row-text"><strong title={result.name}>{result.name}</strong><span>{result.files > 1 ? `${result.files} 个 PDF` : `${result.pages} 页`} · {formatSize(result.size)}</span></div>
              <a className="icon" href={result.url} download={result.name} aria-label={'下载 ' + result.name}><PiArrowDown size={16} /></a>
            </li>
          </ul>
        )}

        {(pages.length > 0 || reading > 0) && (
          <section aria-label="页面">
            <div className="results-head">
              <span aria-live="polite">
                {pages.length ? `${pages.length} 页 · ${fileCount} 个文件` : ''}{reading > 0 ? `${pages.length ? ' · ' : ''}正在读取…` : ''}
                {selected.size > 0 && ` · 已选 ${selected.size} 页`}
              </span>
              <div>
                {selected.size > 0 && <button className="link" onClick={() => setSelected(new Set())}>取消选择</button>}
                {pages.length > 0 && <button className="link" onClick={clear}>清空</button>}
              </div>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={pages.map(page => page.id)} strategy={rectSortingStrategy}>
                <ul className="leaves">
                  {pages.map((page, index) => (
                    <PageCard key={page.id} page={page} position={index + 1} selected={selected.has(page.id)}
                      label={`${sources.current.get(page.source)?.name ?? ''} · 第 ${page.index + 1} 页`}
                      onToggle={toggle} onRotate={rotate} onRemove={remove} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </section>
        )}
      </div>

      <dl className="notes">
        <div><dt>隐私</dt><dd>文件只在浏览器里处理，不会上传。关掉页面后内容会清除。</dd></div>
        <div><dt>用法</dt><dd>拖动页面调整顺序，点一下选中。选了页面就只导出选中的，没选就导出全部。</dd></div>
        <div><dt>限制</dt><dd>带密码保护的 PDF 处理不了。图片会做成和 A4 一样宽的一页。</dd></div>
      </dl>
      <p className="fine">
        合并、拆分和旋转使用 <a href="https://github.com/Hopding/pdf-lib" target="_blank" rel="noopener noreferrer">pdf-lib</a>，
        缩略图使用 <a href="https://github.com/mozilla/pdf.js" target="_blank" rel="noopener noreferrer">PDF.js</a>，
        拖动排序使用 <a href="https://github.com/clauderic/dnd-kit" target="_blank" rel="noopener noreferrer">dnd kit</a>。
      </p>
    </div>
  );
}
