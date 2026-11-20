'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { PiArrowLeft, PiArrowsClockwise, PiFolderOpen, PiMusicNotes } from 'react-icons/pi';
import DropArea from '@/components/drop-area';
import ToolLoading from '@/components/tool-loading';
import { allowFolder, canConnect, chooseFolder, filterEntries, findSong, forgetFolder, listFiles, listFolder, listPaths, readTags, savedFolder, type Entry, type Folder } from './lib/library';
import { parseLink } from './lib/link';
import { buildLyrics, type Lyrics, type RawLyrics } from './lib/lyrics';
import { MAX_FILE_SIZE, MAX_SECONDS, decode, openSource, type Source } from './lib/source';
import { fingerprint, loadStems, saveStems, split, type SplitEvent } from './lib/stems';
import SingAlongPreview from './preview';
import type { StemBuffers } from './studio';

// 录音台和歌词用到的库比较大，选了歌才加载。
const Studio = dynamic(() => import('./studio'), { ssr: false, loading: ToolLoading });
const LyricStage = dynamic(() => import('./lyrics-stage'), { ssr: false });

const ACCEPT = { 'audio/*': ['.ncm', '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.aif', '.aiff'], 'application/octet-stream': ['.ncm'] };
// 文件名里写着这些词的，当作已经是伴奏，不再分离（进去以后可以改）。
const LOOKS_PLAIN = /伴奏|消音|instrumental|karaoke|off[ _-]?vocal|\binst\b/i;

type Brief = { id: string; title: string; artists: string[]; album: string; cover: string; duration: number };
type Song = Brief & { raw: RawLyrics };
type Audio = { key: string; source: Source; buffer: AudioBuffer; plain: boolean };
type Split =
  | { phase: 'download'; loaded: number; total: number }
  | { phase: 'loading' }
  | { phase: 'working'; gpu: boolean; done: number; total: number; since: number }
  | { phase: 'error'; error: string };
type Library = { state: 'none' | 'locked' | 'ready'; name: string; entries: Entry[]; reading: boolean };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const span = (seconds: number) => seconds < 90 ? `${Math.max(1, Math.round(seconds))} 秒` : `${Math.round(seconds / 60)} 分钟`;
const safeName = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 120) || '跟唱';

async function api<T>(query: string): Promise<T> {
  const response = await fetch('/api/netease?' + query);
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error ?? '暂时连不上网易云，稍后再试。');
  return data;
}

export default function SingAlong() {
  const [query, setQuery] = useState('');
  const [song, setSong] = useState<Song | null>(null);
  const [results, setResults] = useState<{ title: string; songs: Brief[] } | null>(null);
  const [finding, setFinding] = useState(false);
  const [songMessage, setSongMessage] = useState('');
  const [audio, setAudio] = useState<Audio | null>(null);
  const [opening, setOpening] = useState('');
  const [fileMessage, setFileMessage] = useState('');
  const [stems, setStems] = useState<StemBuffers | null>(null);
  const [instrumental, setInstrumental] = useState<Blob | null>(null);
  const [splitting, setSplitting] = useState<Split | null>(null);
  const [library, setLibrary] = useState<Library>({ state: 'none', name: '', entries: [], reading: false });
  // 贴了链接、歌词有了，还在等这首歌的声音：looking 是正在下载的歌里找，missing 是没找到。
  const [waiting, setWaiting] = useState<'looking' | 'missing' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // 这个浏览器能不能读文件夹：handle 是连一次一直有效（Chrome、Edge），input 是每次打开页面选一次（Safari、Firefox），none 是不能（手机）。
  const [folderMode, setFolderMode] = useState<'handle' | 'input' | 'none'>('none');
  const [, tick] = useState(0);
  const songRef = useRef<Song | null>(null);
  const audioRef = useRef<Audio | null>(null);
  const busyRef = useRef(false);
  const run = useRef<{ cancel: () => void } | null>(null);
  const token = useRef(0);
  const folder = useRef<Folder | null>(null);
  const entries = useRef<Entry[]>([]);
  const tagsReady = useRef<Promise<void>>(Promise.resolve());
  const scanning = useRef(false);
  const again = useRef(false);
  /** 上一轮看到有文件刚写了一半（正在下载）。 */
  const settling = useRef(false);
  const lookForRef = useRef<((target: Song, rescan: boolean) => Promise<void>) | null>(null);
  /** 正在等声音的那首歌的 id。 */
  const wanted = useRef('');
  const folderInput = useRef<HTMLInputElement>(null);
  songRef.current = song;
  audioRef.current = audio;
  busyRef.current = Boolean(opening);

  /* ---------- 我的下载 ---------- */

  const loadFolder = useCallback(async (target: Folder) => {
    folder.current = target;
    setLibrary(previous => ({ ...previous, state: 'ready', name: target.name, reading: true }));
    const found = await listFolder(target);
    entries.current = found;
    setLibrary({ state: 'ready', name: target.name, entries: found, reading: true });
    tagsReady.current = readTags(found);
    await tagsReady.current;
    setLibrary(previous => previous.entries === found ? { ...previous, entries: [...found], reading: false } : previous);
  }, []);

  useEffect(() => {
    setFolderMode(canConnect() ? 'handle' : 'webkitdirectory' in HTMLInputElement.prototype && !window.matchMedia('(pointer: coarse)').matches ? 'input' : 'none');
    let alive = true;
    void savedFolder().then(saved => {
      if (!alive || !saved) return;
      folder.current = saved.folder;
      if (saved.granted) void loadFolder(saved.folder).catch(() => setLibrary({ state: 'locked', name: saved.folder.name, entries: [], reading: false }));
      else setLibrary({ state: 'locked', name: saved.folder.name, entries: [], reading: false });
    });
    return () => { alive = false; };
  }, [loadFolder]);

  /* ---------- 打开音频 ---------- */

  const startSplit = useCallback((target: Audio, mine: number) => {
    setSplitting({ phase: 'loading' });
    const job = split(target.buffer, (event: SplitEvent) => {
      if (token.current !== mine) return;
      if (event.kind === 'download') setSplitting({ phase: 'download', loaded: event.loaded, total: event.total });
      else if (event.kind === 'ready') setSplitting({ phase: 'working', gpu: event.device === 'webgpu', done: 0, total: 0, since: performance.now() });
      else setSplitting(previous => previous?.phase === 'working' ? { ...previous, done: event.done, total: event.total } : previous);
    });
    run.current = job;
    job.result.then(async blobs => {
      if (token.current !== mine) return;
      void saveStems(target.key, blobs);
      const [instrumental, vocals] = await Promise.all([decode(blobs.instrumental), decode(blobs.vocals)]);
      if (token.current !== mine) return;
      setStems({ instrumental, vocals }); setInstrumental(blobs.instrumental); setSplitting(null);
    }).catch(error => {
      if (token.current === mine) setSplitting({ phase: 'error', error: error instanceof Error ? error.message : '分离失败。' });
    });
  }, []);

  /** 找上次分离好的伴奏，没有就开始分离。 */
  const prepareStems = useCallback(async (target: Audio, mine: number) => {
    const saved = await loadStems(target.key);
    if (token.current !== mine) return;
    if (!saved) { startSplit(target, mine); return; }
    const [instrumental, vocals] = await Promise.all([decode(saved.instrumental), decode(saved.vocals)]);
    if (token.current !== mine) return;
    setStems({ instrumental, vocals }); setInstrumental(saved.instrumental);
  }, [startSplit]);

  const pick = useCallback(async (link: string): Promise<Song | null> => {
    setFinding(true); setSongMessage('');
    try {
      const found = await api<(Brief & { lyrics: RawLyrics }) | { list: string; songs: Brief[] }>('link=' + encodeURIComponent(link));
      // 贴的是歌单或专辑：列出里面的歌来挑。
      if ('songs' in found) {
        setResults({ title: found.list, songs: found.songs });
        if (!found.songs.length) setSongMessage('这个歌单是空的，或者不公开。');
        return null;
      }
      const { lyrics, ...brief } = found;
      const next = { ...brief, raw: lyrics };
      songRef.current = next;
      setSong(next); setResults(null);
      return next;
    } catch (error) { setSongMessage(error instanceof Error ? error.message : '匹配失败，请重试。'); return null; }
    finally { setFinding(false); }
  }, []);

  const open = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    const file = files[0];
    if (!file) { setFileMessage(rejected.length ? '这个文件不是音频，或者超过了 300 MB。' : ''); return; }
    const mine = ++token.current;
    run.current?.cancel(); run.current = null;
    wanted.current = '';
    setAudio(null); setStems(null); setInstrumental(null); setSplitting(null); setFileMessage(''); setWaiting(null); setDirty(false);
    setOpening(`正在读取 ${file.name}…`);
    try {
      const source = await openSource(file);
      if (token.current !== mine) return;
      // 网易云下载的文件里自带歌曲 id：没贴链接的话直接用它找歌词。
      if (source.musicId && !songRef.current) void pick(source.musicId);
      else if (!source.musicId && !songRef.current) setQuery(previous => previous || [source.title, source.artist].filter(Boolean).join(' '));
      const [buffer, key] = await Promise.all([decode(source.blob), fingerprint(source.blob)]);
      if (token.current !== mine) return;
      if (buffer.duration > MAX_SECONDS) throw new Error(`这首有 ${clock(buffer.duration)}，最长支持 ${MAX_SECONDS / 60} 分钟。`);
      const next: Audio = { key, source, buffer, plain: LOOKS_PLAIN.test(file.name) };
      if (!next.plain) await prepareStems(next, mine);
      if (token.current !== mine) return;
      setAudio(next);
    } catch (error) {
      if (token.current !== mine) return;
      const text = error instanceof Error ? error.message : '';
      setFileMessage(/[一-鿿]/.test(text) ? text : `读不出 ${file.name}，可能不是音频或者已损坏。`);
    } finally { if (token.current === mine) setOpening(''); }
  }, [pick, prepareStems]);

  const openEntry = useCallback(async (item: Entry) => {
    try { await open([await item.open()]); }
    catch { setFileMessage(`读不到 ${item.stem}，文件可能被移走了。点「刷新」再试。`); }
  }, [open]);

  /* ---------- 贴了链接以后，自动去下载的歌里找这一首 ---------- */

  const lookFor = useCallback(async (target: Song, rescan: boolean) => {
    // 上一轮还没看完：记下来，看完以后按最新要找的那首再看一轮。
    if (scanning.current) { again.current = true; return; }
    scanning.current = true;
    try {
      if (rescan && folder.current) {
        // 先只看文件名（便宜）。有新文件、或者上一轮有刚写了一半的文件，才把整个文件夹重读一遍。
        const names = await listPaths(folder.current);
        const known = new Set(entries.current.map(item => item.path));
        if (settling.current || names.length !== known.size || names.some(name => !known.has(name))) {
          const found = await listFolder(folder.current);
          entries.current = found;
          tagsReady.current = readTags(found);
          await tagsReady.current;
          setLibrary(previous => ({ ...previous, entries: found, reading: false }));
        }
      } else await tagsReady.current;
      if (wanted.current !== target.id) return;
      // 刚写了一半的文件（正在下载）先不碰，下一轮再看。
      const steady = entries.current.filter(item => Date.now() - item.modified > 2500);
      settling.current = steady.length !== entries.current.length;
      const hit = findSong(steady, target);
      if (hit) await openEntry(hit); else setWaiting('missing');
    } catch { if (wanted.current === target.id) setWaiting('missing'); }
    finally {
      scanning.current = false;
      if (again.current) {
        again.current = false;
        const next = songRef.current;
        if (next && next.id === wanted.current) void lookForRef.current?.(next, rescan);
      }
    }
  }, [openEntry]);
  lookForRef.current = lookFor;

  /** 选定了一首歌（链接、搜索结果）：有声音就只换歌词，没有就去下载的歌里找。 */
  const choose = useCallback(async (link: string) => {
    const target = await pick(link);
    if (!target || audioRef.current || busyRef.current) return;
    wanted.current = target.id;
    if (entries.current.length || folder.current) { setWaiting('looking'); void lookFor(target, false); }
    else setWaiting('missing');
  }, [lookFor, pick]);

  // 没找到的时候：回到这个页面、或者每隔几秒，再看一眼文件夹。在网易云里点了下载，这里就自动接上。
  const watching = waiting === 'missing' && library.state === 'ready' && Boolean(folder.current) && Boolean(song) && !audio && !opening;
  useEffect(() => {
    if (!watching) return;
    const check = () => { if (document.visibilityState === 'visible' && songRef.current?.id === wanted.current) void lookFor(songRef.current, true); };
    const timer = setInterval(check, 4000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [lookFor, watching]);

  const afterConnect = useCallback(() => {
    if (songRef.current && !audioRef.current) { wanted.current = songRef.current.id; setWaiting('looking'); void lookFor(songRef.current, false); }
  }, [lookFor]);

  const connect = useCallback(async () => {
    setFileMessage('');
    if (!canConnect()) { folderInput.current?.click(); return; }
    try {
      const chosen = await chooseFolder();
      if (!chosen) return;
      await loadFolder(chosen);
      afterConnect();
    } catch { setFileMessage('这个文件夹读不了。换一个文件夹，或者直接选择文件。'); }
  }, [afterConnect, loadFolder]);

  const allow = useCallback(async () => {
    if (!folder.current) return;
    if (!await allowFolder(folder.current)) { setFileMessage('没有拿到读取权限。可以重新连接文件夹，或者直接选择文件。'); return; }
    try { await loadFolder(folder.current); afterConnect(); }
    catch { setFileMessage('这个文件夹读不了了，可能被移走了。请重新连接。'); setLibrary({ state: 'none', name: '', entries: [], reading: false }); }
  }, [afterConnect, loadFolder]);

  const refresh = useCallback(async () => {
    if (folder.current) await loadFolder(folder.current).catch(() => setFileMessage('这个文件夹读不了了，可能被移走了。请重新连接。'));
  }, [loadFolder]);

  const disconnect = useCallback(() => {
    folder.current = null; entries.current = [];
    setLibrary({ state: 'none', name: '', entries: [], reading: false });
    void forgetFolder();
  }, []);

  // Safari 等没有文件夹接口的浏览器：用「选择文件夹」拿到一份文件清单，这次打开页面期间有效。
  const pickedFolder = useCallback(async (files: FileList | null) => {
    const all = Array.from(files ?? []);
    if (!all.length) return;
    const found = listFiles(all);
    entries.current = found; folder.current = null;
    const name = all[0].webkitRelativePath.split('/')[0] || '选中的文件夹';
    setLibrary({ state: 'ready', name, entries: found, reading: true });
    tagsReady.current = readTags(found);
    await tagsReady.current;
    setLibrary({ state: 'ready', name, entries: [...found], reading: false });
    afterConnect();
  }, [afterConnect]);

  /* ---------- 找歌 ---------- */

  const search = useCallback(async (text: string) => {
    setFinding(true); setSongMessage('');
    try {
      const { songs } = await api<{ songs: Brief[] }>('q=' + encodeURIComponent(text));
      setResults({ title: '', songs });
      if (!songs.length) setSongMessage('没有搜到。换个写法，或者直接粘贴歌曲链接。');
    } catch (error) { setSongMessage(error instanceof Error ? error.message : '搜索失败，请重试。'); }
    finally { setFinding(false); }
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text || finding) return;
    // 贴的是链接（或 App 里分享出来的那段话）就直接匹配，否则当成歌名去搜。
    if (parseLink(text)) void choose(text);
    else if (/music\.163\.com|163cn\.(tv|link)/i.test(text)) { setResults(null); setSongMessage('这个链接不是歌曲、歌单或专辑。在网易云里打开一首歌，点「分享」→「复制链接」再贴过来，或者直接输入歌名。'); }
    else void search(text);
  }

  // 粘贴进来的如果是链接，不用再点按钮。
  function pasted(text: string) {
    if (!finding && parseLink(text)) { setQuery(text.trim()); void choose(text); return true; }
    return false;
  }

  /* ---------- 伴奏 ---------- */

  const treatAsBacking = () => {
    if (!audio) return;
    run.current?.cancel(); run.current = null;
    setSplitting(null); setStems(null); setInstrumental(null);
    setAudio({ ...audio, plain: true });
  };
  const splitNow = () => {
    if (!audio) return;
    const next = { ...audio, plain: false };
    setAudio(next);
    void prepareStems(next, token.current);
  };

  function reset() {
    token.current++;
    run.current?.cancel(); run.current = null;
    setAudio(null); setStems(null); setInstrumental(null); setSplitting(null); setFileMessage(''); setOpening('');
    wanted.current = '';
    setSong(null); setSongMessage(''); setResults(null); setWaiting(null); setQuery(''); setDirty(false); setLeaving(false);
  }
  function leave() {
    if (dirty && !leaving) { setLeaving(true); setTimeout(() => setLeaving(false), 5000); return; }
    reset();
  }

  useEffect(() => () => { token.current++; run.current?.cancel(); }, []);

  // 有没导出的录音时，关页面前提醒一下。
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // 分离时每秒刷新一次「还要多久」。
  const working = splitting?.phase === 'working';
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, [working]);

  // 封面由本站代取：歌词背景要读它的颜色，直接用网易云的地址读不了。
  const cover = song?.cover ? '/api/netease?cover=' + encodeURIComponent(song.cover) : null;
  const lyrics: Lyrics | null = useMemo(
    () => song ? buildLyrics(song.raw, audio ? audio.buffer.duration * 1000 : song.duration) : null,
    [song, audio],
  );
  const name = safeName(song ? [song.title, song.artists.join('、')].filter(Boolean).join(' - ') : audio?.source.title ?? '');

  const fraction = splitting?.phase === 'download' && splitting.total ? splitting.loaded / splitting.total
    : splitting?.phase === 'working' && splitting.total ? splitting.done / splitting.total : 0;
  const remaining = splitting?.phase === 'working' && splitting.done
    ? (performance.now() - splitting.since) / 1000 / splitting.done * (splitting.total - splitting.done) : null;

  // 选了歌或者放了文件，就进整屏的工作台。
  const inside = Boolean(song || audio || opening);
  useEffect(() => {
    if (!inside) return;
    document.documentElement.classList.add('sing-locked');
    return () => document.documentElement.classList.remove('sing-locked');
  }, [inside]);

  const drop = useDropzone({ onDrop: open, accept: ACCEPT, maxSize: MAX_FILE_SIZE, multiple: false, noClick: true, noKeyboard: true, disabled: !inside || Boolean(opening) || dirty });
  const shown = useMemo(() => parseLink(query) ? library.entries : filterEntries(library.entries, query), [library.entries, query]);

  const find = (compact: boolean) => (
    <div className={'sing-finder' + (compact ? ' compact' : '')}>
      <form className="sing-find" onSubmit={submit}>
        <input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="粘贴网易云的歌曲链接，或者输入歌名" aria-label="网易云歌曲链接或歌名" spellCheck={false} autoComplete="off"
          onPaste={event => { if (pasted(event.clipboardData.getData('text'))) event.preventDefault(); }} />
        <button className="button" disabled={finding || !query.trim()}>{finding ? '正在找…' : compact ? '找歌词' : '开始'}</button>
      </form>
      {songMessage && <p className="message" role="status">{songMessage}</p>}
      {results && results.songs.length > 0 && (
        <ul className="rows sing-results" aria-label={results.title || '搜索结果'}>
          {results.title && <li className="sing-results-title">{results.title}</li>}
          {results.songs.map(item => (
            <li key={item.id} className="row">
              <button onClick={() => void choose(item.id)} disabled={finding}>
                <div className="row-text"><strong>{item.title}</strong><span>{[item.artists.join('、'), item.album].filter(Boolean).join(' · ')}</span></div>
                <span className="row-meta">{clock(item.duration / 1000)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const folderPicker = <input ref={folderInput} type="file" hidden multiple onChange={event => { void pickedFolder(event.target.files); event.target.value = ''; }}
    {...({ webkitdirectory: '', directory: '' } as object)} aria-label="选择下载文件夹" />;

  if (inside) {
    const title = song?.title ?? audio?.source.title ?? '';
    const sub = song
      ? [song.artists.join('、'), lyrics?.lines.length ? `歌词 ${lyrics.lines.length} 行${lyrics.wordLevel ? '，逐字' : ''}` : '没有歌词'].filter(Boolean).join(' · ')
      : [audio?.source.artist, '还没匹配歌词'].filter(Boolean).join(' · ');
    return (
      <div {...drop.getRootProps({ className: 'sing-work' })}>
        <input {...drop.getInputProps()} aria-label="选择歌曲文件" />
        {folderPicker}
        <header className="sing-top">
          <button className={'sing-back' + (leaving ? ' sure' : '')} onClick={leave}><PiArrowLeft size={15} />{leaving ? '录音还没导出，再点一次就离开' : '换一首'}</button>
          {/* 封面由本站代取。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover ? <img className="sing-cover" src={cover} alt="" width={36} height={36} /> : <span className="sing-cover"><PiMusicNotes size={16} /></span>}
          <div className="sing-title"><strong>{title || '跟唱录音'}</strong><span>{sub}</span></div>

          {audio && (
            <div className="sing-chip" role="status">
              {splitting && splitting.phase !== 'error' ? (
                <>
                  <span className="sing-chip-text">
                    {splitting.phase === 'download' && splitting.loaded < splitting.total ? `第一次用，正在下载分离模型 ${Math.round(fraction * 100)}%`
                      : splitting.phase !== 'working' ? '正在准备分离伴奏…'
                      : `正在分离伴奏 ${Math.round(fraction * 100)}%${remaining !== null ? `，还要约 ${span(remaining)}` : ''}${splitting.gpu ? '' : '（没有显卡加速，会很慢）'}`}
                    <small>可以先跟着原曲唱</small>
                  </span>
                  <i className="sing-chip-bar"><b style={{ width: `${fraction * 100}%` }} /></i>
                  <button className="link" onClick={treatAsBacking}>这已经是伴奏</button>
                </>
              ) : splitting?.phase === 'error' ? (
                <><span className="sing-chip-text"><span className="row-error">伴奏没有分出来：{splitting.error}</span><small>现在可以先用原曲录</small></span><button className="link" onClick={() => startSplit(audio, token.current)}>重试</button></>
              ) : audio.plain ? (
                <><span className="sing-chip-text">当作伴奏直接用</span><button className="link" onClick={splitNow}>里面有人声，分离一下</button></>
              ) : stems ? <span className="sing-chip-text done">伴奏已分好</span> : null}
            </div>
          )}
        </header>

        {audio ? (
          <Studio key={audio.key} name={name} lyrics={lyrics} original={audio.buffer} stems={stems} plain={audio.plain} instrumental={instrumental} cover={cover}
            empty={<div className="sing-match"><p>还没有歌词。粘贴这首歌的网易云链接，或者搜歌名。</p>{find(true)}</div>} onTake={setDirty} />
        ) : (
          <>
            <LyricStage lines={lyrics?.lines ?? []} cover={cover} playing={false} still>
              {song && !lyrics?.lines.length && <div className="sing-stage-empty"><p>这首歌在网易云没有歌词（可能是纯音乐），可以照常录。</p></div>}
            </LyricStage>
            <div className="sing-dock sing-need" role="status">
              {opening ? <p className="sing-need-busy"><i className="sing-spin" />{opening}</p>
                : waiting === 'looking' ? <p className="sing-need-busy"><i className="sing-spin" />正在你下载的歌里找这一首…</p>
                : (
                  <>
                    <div className="sing-need-text">
                      <strong>歌词对上了，还差这首歌的声音</strong>
                      <span>
                        {library.state === 'ready' && folder.current ? `「${library.name}」里还没有这首歌。在网易云里把它下载下来，这里会自动接上，不用再回来点。`
                          : library.state === 'ready' ? `「${library.name}」里没有找到这首歌。下载以后重新选一次文件夹，或者直接选择文件。`
                          : library.state === 'locked' ? `上次连接过「${library.name}」。点一下允许，就自动在里面找这首歌。`
                          : folderMode === 'handle' ? '网易云不让网站直接取歌曲的声音，所以用你下载到电脑里的那一份。连接一次下载文件夹，以后贴链接就自动找到。'
                          : folderMode === 'input' ? '网易云不让网站直接取歌曲的声音，所以用你下载到电脑里的那一份。选一下网易云的下载文件夹，会自动在里面找到这首歌。'
                          : '网易云不让网站直接取歌曲的声音，所以用你自己的文件。选这首歌的文件就可以开始。'}
                      </span>
                      {fileMessage && <span className="row-error">{fileMessage}</span>}
                    </div>
                    <div className="sing-need-actions">
                      {library.state === 'locked' && <button className="button" onClick={() => void allow()}><PiFolderOpen size={15} />允许读取「{library.name}」</button>}
                      {library.state === 'none' && folderMode !== 'none' && <button className="button" onClick={() => void connect()}><PiFolderOpen size={15} />{folderMode === 'handle' ? '连接网易云下载文件夹' : '选择下载文件夹'}</button>}
                      {library.state === 'ready' && !folder.current && <button className="button ghost" onClick={() => void connect()}><PiFolderOpen size={15} />重新选文件夹</button>}
                      <button className={'button' + ((library.state === 'ready' && folder.current) || folderMode === 'none' ? '' : ' ghost')} onClick={drop.open}>选择文件</button>
                      <small>{folderMode === 'none' ? '.ncm、MP3、FLAC 都行' : '也可以把文件拖进这个窗口。.ncm、MP3、FLAC 都行'}</small>
                    </div>
                  </>
                )}
            </div>
          </>
        )}
        {drop.isDragActive && <div className="sing-dropping">松开，用这个文件</div>}
      </div>
    );
  }

  return (
    <div className="tool sing">
      <div className="panel">
        {find(false)}
        {folderPicker}

        <div className={'sing-sources' + (folderMode === 'none' && library.state === 'none' ? ' single' : '')}>
          {(folderMode !== 'none' || library.state !== 'none') && <section className="sing-lib" aria-label="我的下载">
            {library.state === 'ready' ? (
              <>
                <header>
                  <strong><PiFolderOpen size={15} />{library.name}</strong>
                  <span>{library.reading && !library.entries.length ? '正在读取…' : `${library.entries.length} 首`}</span>
                  {folder.current && <button className="link" onClick={() => void refresh()} title="重新读一遍文件夹"><PiArrowsClockwise size={13} />刷新</button>}
                  <button className="link" onClick={disconnect}>断开</button>
                </header>
                {shown.length > 0 ? (
                  <ul className="rows sing-files">
                    {shown.slice(0, 200).map(item => (
                      <li key={item.path} className="row">
                        <button onClick={() => void openEntry(item)}>
                          <div className="row-text"><strong>{item.stem}</strong></div>
                          <span className="row-meta">{item.ext.toUpperCase()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sing-lib-empty">{library.entries.length ? '下载的歌里没有名字带这几个字的。按回车去网易云搜。' : library.reading ? '' : '这个文件夹里没有找到歌。'}</p>
                )}
              </>
            ) : (
              <div className="sing-connect">
                <strong>{library.state === 'locked' ? `上次连接过「${library.name}」` : '连接网易云的下载文件夹'}</strong>
                <p>{library.state === 'locked' ? '浏览器重开以后要再允许一次。' : `${folderMode === 'handle' ? '连一次就行。之后' : '选好以后'}贴链接，会自动在你下载的歌里找到这一首；也可以直接从列表里点歌。文件只在这台电脑上读，不会上传。`}</p>
                {library.state === 'locked'
                  ? <div><button className="button" onClick={() => void allow()}><PiFolderOpen size={15} />允许读取</button> <button className="link" onClick={disconnect}>不用了</button></div>
                  : <button className="button ghost" onClick={() => void connect()}><PiFolderOpen size={15} />选择文件夹</button>}
                {library.state === 'none' && <small>Mac 上一般在「音乐 › 网易云音乐」。{folderMode === 'input' ? '这个浏览器每次打开页面要选一次；用 Chrome 或 Edge 连一次就一直有效。' : ''}</small>}
              </div>
            )}
          </section>}

          <DropArea accept={ACCEPT} maxSize={MAX_FILE_SIZE} multiple={false} onFiles={open}
            title={folderMode === 'none' && library.state === 'none' ? '选一首歌的文件' : '或者把歌拖到这里'} hint=".ncm 和网易云下载的 MP3、FLAC 会自动对上歌词；自己的伴奏也可以" preview={<SingAlongPreview />} inputLabel="选择歌曲文件" />
        </div>
        {fileMessage && <p className="message"><span className="row-error">{fileMessage}</span></p>}
      </div>

      <dl className="notes">
        <div><dt>怎么用</dt><dd>在网易云里点「分享」→「复制链接」，贴到上面，歌词马上出来。声音用你下载到电脑里的那一份：连接过下载文件夹的话会自动找到，没连就把文件拖进来。然后戴上耳机，点红色的录音键。</dd></div>
        <div><dt>为什么要下载的文件</dt><dd>网易云只把歌词、歌名和封面给网站，歌曲的声音要登录以后在它自己的 App 里才拿得到。这里不碰你的账号，所以声音用你自己下载好的文件。</dd></div>
        <div><dt>录音</dt><dd>请戴耳机，不然伴奏会被麦克风录进去。有线耳机最准；蓝牙耳机录出来对不齐时，在设置里填「延迟补偿」。重录某一句，就把播放头放回那一句再录，新的会盖掉旧的；录坏了可以撤销。</dd></div>
        <div><dt>隐私</dt><dd>歌和录音都只在浏览器里处理，不会上传。只有找歌词和封面时，会把链接或歌名发给本站，再由本站去问网易云。分离好的伴奏存在浏览器里（最近 5 首），同一首歌下次不用再等。</dd></div>
      </dl>
      <p className="fine">
        滚动歌词用的是 <a href="https://github.com/amll-dev/applemusic-like-lyrics" target="_blank" rel="noopener noreferrer">AMLL</a>（AGPL-3.0），
        录音、多轨和导出用的是 <a href="https://github.com/naomiaro/waveform-playlist" target="_blank" rel="noopener noreferrer">waveform-playlist</a>（MIT），
        伴奏分离同「人声伴奏分离」（<a href="https://github.com/timcsy/demucs-web" target="_blank" rel="noopener noreferrer">demucs-web</a>，MIT）。歌词来自网易云音乐。
        本站按 AGPL-3.0 开源，<a href="https://github.com/asiansumer/sumerhub" target="_blank" rel="noopener noreferrer">源代码在 GitHub</a>。
      </p>
    </div>
  );
}
