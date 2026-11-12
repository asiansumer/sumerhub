'use client';

/* 封面是本地 blob URL，用原生 img 即可。 */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { PiArrowDown, PiDownloadSimple, PiMusicNotes, PiPauseFill, PiPlayFill, PiUploadSimple, PiX, PiLockSimple, PiFileAudio, PiStack } from 'react-icons/pi';
import { convertFile, uniqueName, MAX_FILE_SIZE, type ConvertedFile } from './lib/convert';
import './ncm.css';

type Failure = { name: string; error: string };
const size = (bytes: number) => bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';

export default function NcmToMp3() {
  const [working, setWorking] = useState(false);
  const [results, setResults] = useState<ConvertedFile[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, percent: 0 });
  const [audioId, setAudioId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [zipBusy, setZipBusy] = useState(false);
  const controller = useRef<AbortController | null>(null), audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<string[]>([]), owned = useRef<ConvertedFile[]>([]);

  const stopAudio = useCallback(() => { audio.current?.pause(); audio.current = null; setAudioId(null); }, []);
  const clearResults = useCallback(() => {
    stopAudio(); urls.current.forEach(URL.revokeObjectURL); urls.current = []; owned.current = []; setResults([]); setSelected([]);
  }, [stopAudio]);

  useEffect(() => () => { controller.current?.abort(); audio.current?.pause(); urls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => {
    if (!working && !results.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [working, results.length]);

  const start = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    if (controller.current || zipBusy) return;
    const rejectedFiles = rejected.map(({ file, errors }) => ({ name: file.name, error: errors.some(e => e.code === 'file-too-large') ? '单个文件不能超过 100 MB' : '请选择 .ncm 文件' }));
    if (!files.length) { setFailures(rejectedFiles); return; }
    if (files.reduce((sum, file) => sum + file.size, 0) > 500 * 1024 * 1024 || files.length > 100) {
      setMessage('每批最多 100 个文件，总大小不超过 500 MB。'); return;
    }
    clearResults(); setFailures(rejectedFiles); setMessage(''); setWorking(true);
    const abort = new AbortController(); controller.current = abort;
    const completed: ConvertedFile[] = [], used = new Set<string>();
    setProgress({ done: 0, total: files.length, percent: 0 });
    for (let i = 0; i < files.length; i++) {
      if (abort.signal.aborted) break;
      try {
        const result = await convertFile(files[i], abort.signal, percent => setProgress({ done: i, total: files.length, percent: (i + percent / 100) / files.length * 100 }));
        if (abort.signal.aborted) break;
        const url = URL.createObjectURL(result.blob); urls.current.push(url);
        const coverUrl = result.cover ? URL.createObjectURL(result.cover) : undefined;
        if (coverUrl) urls.current.push(coverUrl);
        const item = { ...result, coverUrl, id: crypto.randomUUID(), name: uniqueName(files[i].name, used), url };
        completed.push(item); owned.current = [...completed];
        setResults([...completed]); setSelected(previous => [...previous, item.id]);
      } catch (error) {
        if (abort.signal.aborted) break;
        setFailures(previous => [...previous, { name: files[i].name, error: error instanceof Error ? error.message : '转换失败，请重试' }]);
      }
      setProgress({ done: i + 1, total: files.length, percent: (i + 1) / files.length * 100 });
    }
    if (abort.signal.aborted) return;
    controller.current = null; setWorking(false);
    const missingArtwork = completed.filter(item => item.artworkUnavailable).length;
    if (missingArtwork) setMessage(`${missingArtwork} 首封面暂时无法获取，音频可正常下载。联网后可重新转换。`);
  }, [clearResults, zipBusy]);

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop: start, accept: { 'application/octet-stream': ['.ncm'] }, maxSize: MAX_FILE_SIZE,
    noClick: true, noKeyboard: true, disabled: working || zipBusy,
  });

  function cancel() {
    controller.current?.abort(); controller.current = null; setWorking(false);
    setMessage(owned.current.length ? '已取消，完成的文件已保留。' : '已取消。');
  }
  function reset() { clearResults(); setFailures([]); setMessage(''); }
  function toggleAudio(item: ConvertedFile) {
    if (audioId === item.id) { stopAudio(); return; }
    stopAudio(); const player = new Audio(item.url); audio.current = player;
    player.addEventListener('ended', () => { if (audio.current === player) setAudioId(null); }, { once: true });
    player.play().then(() => { if (audio.current === player) setAudioId(item.id); }).catch(() => setMessage('无法试听，可下载后播放。'));
  }
  async function downloadZip() {
    const chosen = results.filter(item => selected.includes(item.id));
    if (!chosen.length || zipBusy) return;
    setZipBusy(true); setMessage('');
    try {
      const { default: JSZip } = await import('jszip'); const zip = new JSZip();
      for (const item of chosen) zip.file(item.name, await item.blob.arrayBuffer());
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(blob); urls.current.push(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sumerhub-mp3.zip';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } catch { setMessage('打包失败，请重试或单独下载。'); }
    finally { setZipBusy(false); }
  }

  const hasOutput = results.length > 0 || working;
  const allSelected = results.length > 0 && selected.length === results.length;

  return (
    <div className="ncm">
      <div {...getRootProps({ className: 'dropzone' + (isDragActive ? ' dragging' : '') + (hasOutput ? ' compact' : '') })}>
        <input {...getInputProps()} aria-label="选择 NCM 文件" />
        <span className="drop-icon"><PiUploadSimple size={hasOutput ? 18 : 24} /></span>
        <div className="drop-copy">
          <strong>{isDragActive ? '松开，开始转换' : hasOutput ? '继续拖入，或再选一批' : '把 .ncm 文件拖到这里'}</strong>
          <span>支持批量 · 单个不超过 100 MB · 每批最多 100 个</span>
        </div>
        <button className="button primary" onClick={open} disabled={working || zipBusy}>{results.length ? '再选一批' : '选择文件'}</button>
      </div>

      {working && (
        <div className="progress" aria-live="polite">
          <div className="progress-label">
            <span>正在转换 <b>{Math.min(progress.done + 1, progress.total)}</b> / {progress.total}</span>
            <button className="text-button" onClick={cancel}><PiX size={14} />取消</button>
          </div>
          <div className="bar" role="progressbar" aria-label="转换进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}>
            <span style={{ width: progress.percent + '%' }} />
          </div>
        </div>
      )}

      {!!failures.length && (
        <div className="notice error" role="alert">
          {failures.slice(0, 3).map((item, i) => <p key={i}><b title={item.name}>{item.name}</b>{item.error}</p>)}
          {failures.length > 3 && <p>另有 {failures.length - 3} 个文件未能处理</p>}
        </div>
      )}
      {message && <p className="notice" role="status">{message}<button className="text-button" onClick={() => setMessage('')} aria-label="关闭提示"><PiX /></button></p>}

      {results.length > 0 && (
        <section className="results" aria-label="转换结果">
          <div className="results-head">
            <label className="check">
              <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : results.map(item => item.id))} />
              全选<span className="count">{results.length} 首</span>
            </label>
            <div className="results-actions">
              {!working && <button className="text-button" onClick={reset} disabled={zipBusy}>清空</button>}
              <button className="button" onClick={downloadZip} disabled={!selected.length || zipBusy}>
                <PiDownloadSimple size={16} />{zipBusy ? '打包中…' : `打包下载${selected.length ? ' · ' + selected.length : ''}`}
              </button>
            </div>
          </div>
          <ul className="tracks">
            {results.map(item => (
              <li key={item.id} className={audioId === item.id ? 'track playing' : 'track'}>
                <input type="checkbox" aria-label={'选择 ' + item.name} checked={selected.includes(item.id)}
                  onChange={() => setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])} />
                <span className="cover">{item.coverUrl ? <img src={item.coverUrl} alt="" /> : <PiMusicNotes size={18} />}</span>
                <div className="track-text">
                  <strong title={item.name}>{item.title}</strong>
                  <span>{[item.artist, item.album].filter(Boolean).join(' · ') || 'MP3'}<i> · {size(item.blob.size)}</i></span>
                </div>
                <button className="round" onClick={() => toggleAudio(item)} aria-label={(audioId === item.id ? '暂停 ' : '试听 ') + item.name}>
                  {audioId === item.id ? <PiPauseFill size={14} /> : <PiPlayFill size={14} />}
                </button>
                <a className="round accent" href={item.url} download={item.name} aria-label={'下载 ' + item.name}><PiArrowDown size={16} /></a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="notes">
        <div><dt><PiLockSimple size={16} />不上传</dt><dd>音频只在浏览器里解码和转换。缺少内嵌封面时，只按文件自带的地址从网易云图片 CDN 补全。</dd></div>
        <div><dt><PiFileAudio size={16} />音质</dt><dd>内含 MP3 的直接取出原始音频；内含 FLAC 的转成 320 kbps MP3，是有损转换。</dd></div>
        <div><dt><PiStack size={16} />信息完整</dt><dd>保留封面、歌名、歌手、专辑、音轨号和歌词等标签。关掉页面后结果会清除。</dd></div>
      </dl>
      <p className="credits">
        MP3 编码基于 <a href="/licenses/lamejs-LICENSE.txt" target="_blank">lamejs / LAME（LGPL-3.0）</a>，
        标签读写基于 <a href="/licenses/taglib-LGPL-2.1.txt" target="_blank">TagLib（LGPL-2.1）</a>。
        源代码见 <a href="https://github.com/asiansumer/NCM-Swift" target="_blank" rel="noopener noreferrer">NCM-Swift</a>。
      </p>
    </div>
  );
}
