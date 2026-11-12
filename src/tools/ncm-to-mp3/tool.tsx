'use client';

/* 封面是本地 blob URL，用原生 img 即可。 */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import DropArea from '@/components/drop-area';
import { downloadZip as zipDownload } from '@/lib/download';
import { formatSize as size } from '@/lib/format';
import { PiArrowDown, PiMusicNoteSimple, PiPauseFill, PiPlayFill } from 'react-icons/pi';
import NcmPreview from './preview';
import { convertFile, uniqueName, MAX_FILE_SIZE, type ConvertedFile } from './lib/convert';

type Failure = { name: string; error: string };

export default function NcmToMp3() {
  const [working, setWorking] = useState(false);
  const [results, setResults] = useState<ConvertedFile[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, percent: 0 });
  const [audioId, setAudioId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [zipBusy, setZipBusy] = useState(false);
  const controller = useRef<AbortController | null>(null), audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<string[]>([]), owned = useRef<ConvertedFile[]>([]);

  const stopAudio = useCallback(() => { audio.current?.pause(); audio.current = null; setAudioId(null); }, []);
  const clearResults = useCallback(() => {
    stopAudio(); urls.current.forEach(URL.revokeObjectURL); urls.current = []; owned.current = []; setResults([]);
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
        setResults([...completed]);
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
    const chosen = results;
    if (!chosen.length || zipBusy) return;
    setZipBusy(true); setMessage('');
    try {
      await zipDownload(chosen, 'sumerhub-mp3.zip');
    } catch { setMessage('打包失败，请重试或单独下载。'); }
    finally { setZipBusy(false); }
  }

  const hasOutput = results.length > 0 || working;

  return (
    <div className="tool">
      <div className="panel">
        <DropArea accept={{ 'application/octet-stream': ['.ncm'] }} maxSize={MAX_FILE_SIZE} disabled={working || zipBusy} compact={hasOutput} onFiles={start}
          title="把 .ncm 文件拖到这里" hint="可多选，单个不超过 100 MB" preview={<NcmPreview />} inputLabel="选择 NCM 文件" />

        {working && (
          <div className="progress" aria-live="polite">
            <div className="progress-label">
              <span>正在转换 {Math.min(progress.done + 1, progress.total)} / {progress.total}</span>
              <button className="link" onClick={cancel}>取消</button>
            </div>
            <div className="bar" role="progressbar" aria-label="转换进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}>
              <span style={{ width: progress.percent + '%' }} />
            </div>
          </div>
        )}

        {!!failures.length && (
          <div className="errors" role="alert">
            {failures.slice(0, 3).map((item, i) => <p key={i}><span title={item.name}>{item.name}</span>{item.error}</p>)}
            {failures.length > 3 && <p>另有 {failures.length - 3} 个文件未能处理</p>}
          </div>
        )}
        {message && <p className="message" role="status">{message}</p>}

        {results.length > 0 && (
          <section className="results" aria-label="转换结果">
            <div className="results-head">
              <span>已完成 {results.length} 首</span>
              <div>
                {!working && <button className="link" onClick={reset} disabled={zipBusy}>清空</button>}
                {results.length > 1 && <button className="button" onClick={downloadZip} disabled={zipBusy}>{zipBusy ? '打包中…' : '全部下载'}</button>}
              </div>
            </div>
            <ul className="rows">
              {results.map(item => (
                <li key={item.id} className={audioId === item.id ? 'row playing' : 'row'}>
                  <span className="thumb">{item.coverUrl ? <img src={item.coverUrl} alt="" /> : <PiMusicNoteSimple size={16} />}</span>
                  <div className="row-text">
                    <strong title={item.name}>{item.title}</strong>
                    <span>{[item.artist, item.album].filter(Boolean).join(' · ') || 'MP3'}</span>
                  </div>
                  <span className="row-meta optional">{size(item.blob.size)}</span>
                  <button className="icon" onClick={() => toggleAudio(item)} aria-label={(audioId === item.id ? '暂停 ' : '试听 ') + item.name}>
                    {audioId === item.id ? <PiPauseFill size={14} /> : <PiPlayFill size={14} />}
                  </button>
                  <a className="icon" href={item.url} download={item.name} aria-label={'下载 ' + item.name}><PiArrowDown size={16} /></a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <dl className="notes">
        <div><dt>隐私</dt><dd>音频只在浏览器里处理，不会上传。关掉页面后结果会清除。</dd></div>
        <div><dt>音质</dt><dd>内含 MP3 的直接取出原始音频，内含 FLAC 的转成 320 kbps MP3。</dd></div>
        <div><dt>标签</dt><dd>保留封面、歌名、歌手、专辑和歌词。缺封面时按文件自带地址补全。</dd></div>
      </dl>
      <p className="fine">
        MP3 编码使用 <a href="/licenses/lamejs-LICENSE.txt" target="_blank">lamejs</a>，标签读写使用 <a href="/licenses/taglib-LGPL-2.1.txt" target="_blank">TagLib</a>。
      </p>
    </div>
  );
}
