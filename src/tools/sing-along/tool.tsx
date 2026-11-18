'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import type { FileRejection } from 'react-dropzone';
import DropArea from '@/components/drop-area';
import ToolLoading from '@/components/tool-loading';
import { formatSize } from '@/lib/format';
import { parseSongLink } from './lib/link';
import { buildLyrics, type Lyrics, type RawLyrics } from './lib/lyrics';
import { MAX_FILE_SIZE, MAX_SECONDS, decode, openSource, type Source } from './lib/source';
import { fingerprint, loadStems, saveStems, split, type SplitEvent } from './lib/stems';
import SingAlongPreview from './preview';
import type { StemBuffers } from './studio';

// 录音台用到的库比较大，放了歌才加载。
const Studio = dynamic(() => import('./studio'), { ssr: false, loading: ToolLoading });

const ACCEPT = { 'audio/*': ['.ncm', '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.aif', '.aiff'], 'application/octet-stream': ['.ncm'] };

type Brief = { id: string; title: string; artists: string[]; album: string; cover: string; duration: number };
type Song = Brief & { raw: RawLyrics };
type Audio = { key: string; source: Source; buffer: AudioBuffer; plain: boolean };
type Split =
  | { phase: 'download'; loaded: number; total: number }
  | { phase: 'loading' }
  | { phase: 'working'; gpu: boolean; done: number; total: number; since: number }
  | { phase: 'error'; error: string };

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
  const [results, setResults] = useState<Brief[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [songMessage, setSongMessage] = useState('');
  const [plain, setPlain] = useState(false);
  const [audio, setAudio] = useState<Audio | null>(null);
  const [opening, setOpening] = useState('');
  const [fileMessage, setFileMessage] = useState('');
  const [stems, setStems] = useState<StemBuffers | null>(null);
  const [instrumental, setInstrumental] = useState<Blob | null>(null);
  const [splitting, setSplitting] = useState<Split | null>(null);
  const [, tick] = useState(0);
  const songRef = useRef<Song | null>(null);
  const run = useRef<{ cancel: () => void } | null>(null);
  const token = useRef(0);
  songRef.current = song;

  const pick = useCallback(async (link: string) => {
    setFinding(true); setSongMessage('');
    try {
      const found = await api<Brief & { lyrics: RawLyrics }>('link=' + encodeURIComponent(link));
      const { lyrics, ...brief } = found;
      setSong({ ...brief, raw: lyrics }); setResults(null);
      if (!lyrics.lrc.trim() && !lyrics.yrc.trim()) setSongMessage('找到了这首歌，但网易云没有它的歌词（可能是纯音乐）。');
    } catch (error) { setSongMessage(error instanceof Error ? error.message : '匹配失败，请重试。'); }
    finally { setFinding(false); }
  }, []);

  const search = useCallback(async (text: string) => {
    setFinding(true); setSongMessage('');
    try {
      const { songs } = await api<{ songs: Brief[] }>('q=' + encodeURIComponent(text));
      setResults(songs);
      if (!songs.length) setSongMessage('没有搜到。换个写法，或者直接粘贴歌曲链接。');
    } catch (error) { setSongMessage(error instanceof Error ? error.message : '搜索失败，请重试。'); }
    finally { setFinding(false); }
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text || finding) return;
    // 贴的是链接（或 App 里分享出来的那段话）就直接匹配，否则当成歌名去搜。
    if (parseSongLink(text)) void pick(text); else void search(text);
  }

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

  const open = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    const file = files[0];
    if (!file) { setFileMessage(rejected.length ? '这个文件不是音频，或者超过了 300 MB。' : ''); return; }
    const mine = ++token.current;
    run.current?.cancel(); run.current = null;
    setAudio(null); setStems(null); setInstrumental(null); setSplitting(null); setFileMessage(''); setOpening('正在读取…');
    try {
      const source = await openSource(file);
      if (token.current !== mine) return;
      // .ncm 里自带歌曲 id：没贴链接的话直接用它找歌词。
      if (source.musicId && !songRef.current) void pick(source.musicId);
      else if (!source.musicId && !songRef.current) setQuery(previous => previous || [source.title, source.artist].filter(Boolean).join(' '));
      const [buffer, key] = await Promise.all([decode(source.blob), fingerprint(source.blob)]);
      if (token.current !== mine) return;
      if (buffer.duration > MAX_SECONDS) throw new Error(`这首有 ${clock(buffer.duration)}，最长支持 ${MAX_SECONDS / 60} 分钟。`);
      const next: Audio = { key, source, buffer, plain };
      if (!plain) {
        setOpening('正在找上次分离好的伴奏…');
        const saved = await loadStems(key);
        if (token.current !== mine) return;
        if (saved) {
          const [instrumental, vocals] = await Promise.all([decode(saved.instrumental), decode(saved.vocals)]);
          if (token.current !== mine) return;
          setStems({ instrumental, vocals }); setInstrumental(saved.instrumental);
        } else startSplit(next, mine);
      }
      setAudio(next);
    } catch (error) {
      if (token.current !== mine) return;
      const text = error instanceof Error ? error.message : '';
      setFileMessage(/[一-鿿]/.test(text) ? text : '读不出这个文件，可能不是音频或者已损坏。');
    } finally { if (token.current === mine) setOpening(''); }
  }, [pick, plain, startSplit]);

  function reset() {
    token.current++;
    run.current?.cancel(); run.current = null;
    setAudio(null); setStems(null); setInstrumental(null); setSplitting(null); setFileMessage(''); setOpening('');
  }

  useEffect(() => () => { token.current++; run.current?.cancel(); }, []);

  // 分离时每秒刷新一次「还要多久」。
  const working = splitting?.phase === 'working';
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, [working]);

  const lyrics: Lyrics | null = useMemo(
    () => song ? buildLyrics(song.raw, audio ? audio.buffer.duration * 1000 : song.duration) : null,
    [song, audio],
  );
  const name = safeName(song ? [song.title, song.artists.join('、')].filter(Boolean).join(' - ') : audio?.source.title ?? '');

  const fraction = splitting?.phase === 'download' && splitting.total ? splitting.loaded / splitting.total
    : splitting?.phase === 'working' && splitting.total ? splitting.done / splitting.total : 0;
  const remaining = splitting?.phase === 'working' && splitting.done
    ? (performance.now() - splitting.since) / 1000 / splitting.done * (splitting.total - splitting.done) : null;

  return (
    <div className="tool sing">
      <div className="panel">
        <form className="sing-find" onSubmit={submit}>
          <input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="粘贴网易云的歌曲链接，或者输入歌名" aria-label="网易云歌曲链接或歌名" spellCheck={false} autoComplete="off" />
          <button className="button" disabled={finding || !query.trim()}>{finding ? '正在找…' : '匹配歌词'}</button>
        </form>
        {songMessage && <p className="message" role="status">{songMessage}</p>}

        {results && results.length > 0 && (
          <ul className="rows sing-results" aria-label="搜索结果">
            {results.map(item => (
              <li key={item.id} className="row">
                <button onClick={() => void pick(item.id)} disabled={finding}>
                  <div className="row-text"><strong>{item.title}</strong><span>{[item.artists.join('、'), item.album].filter(Boolean).join(' · ')}</span></div>
                  <span className="row-meta">{clock(item.duration / 1000)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {song && (
          <div className="sing-song">
            {/* 封面直接来自网易云的图片服务器。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {song.cover && <img src={song.cover + '?param=96y96'} alt="" width={44} height={44} referrerPolicy="no-referrer" />}
            <div className="row-text">
              <strong>{song.title}</strong>
              <span>{[song.artists.join('、'), lyrics?.lines.length ? `歌词 ${lyrics.lines.length} 行${lyrics.wordLevel ? '，逐字' : ''}` : '没有歌词'].filter(Boolean).join(' · ')}</span>
            </div>
            <button className="link" onClick={() => { setSong(null); setSongMessage(''); }}>换一首</button>
          </div>
        )}

        <DropArea accept={ACCEPT} maxSize={MAX_FILE_SIZE} multiple={false} compact={Boolean(audio)} disabled={Boolean(opening)} onFiles={open}
          title="把这首歌的文件拖到这里" hint="网易云下载的 .ncm 可以直接用（会自动匹配歌词），也支持 MP3、FLAC、WAV、M4A"
          compactTitle={audio ? `${audio.source.fileName} · ${clock(audio.buffer.duration)}` : ''} compactButton="换一个文件" preview={<SingAlongPreview />} inputLabel="选择歌曲文件" />
        {!audio && (
          <label className="check sing-plain">
            <input type="checkbox" checked={plain} onChange={event => setPlain(event.target.checked)} />这个文件已经是伴奏，不用分离
          </label>
        )}
        {opening && <p className="message" role="status">{opening}</p>}
        {fileMessage && <p className="message"><span className="row-error">{fileMessage}</span></p>}

        {audio && splitting && splitting.phase !== 'error' && (
          <div className="progress" role="status">
            <div className="progress-label">
              <span>
                {splitting.phase === 'download' && splitting.loaded < splitting.total ? `第一次使用，正在下载分离模型 ${formatSize(splitting.loaded)} / ${formatSize(splitting.total)}`
                  : splitting.phase === 'download' || splitting.phase === 'loading' ? '正在准备分离模型，要十几秒。可以先跟着原曲练'
                  : `正在分离伴奏（${splitting.gpu ? '显卡加速' : '没有显卡加速，会很慢'}）${remaining !== null ? `，大约还要 ${span(remaining)}` : ''}。可以先跟着原曲练`}
              </span>
              <span>{fraction ? `${Math.round(fraction * 100)}%` : ''}</span>
            </div>
            <div className="bar"><span style={{ width: `${fraction * 100}%` }} /></div>
          </div>
        )}
        {audio && splitting?.phase === 'error' && (
          <p className="message">
            <span className="row-error">伴奏没有分离出来：{splitting.error}</span>{' '}
            <button className="link" onClick={() => startSplit(audio, token.current)}>重试</button>。现在可以先用原曲录。
          </p>
        )}

        {audio && <Studio key={audio.key + (audio.plain ? ':plain' : '')} name={name} lyrics={lyrics} original={audio.buffer} stems={stems} plain={audio.plain} instrumental={instrumental} />}
        {audio && <p className="sing-reset"><button className="link" onClick={reset}>清空，换一首歌</button></p>}
      </div>

      <dl className="notes">
        <div><dt>怎么用</dt><dd>在网易云里点「分享」→「复制链接」贴到上面，歌词就对上了。音频要用你自己下载好的文件：把 .ncm 直接拖进来就行，里面带着歌曲信息，连链接都不用贴。</dd></div>
        <div><dt>录音</dt><dd>请戴耳机，不然伴奏会被麦克风录进去。有线耳机最准；用蓝牙耳机时，麦克风选电脑自带的，录出来和伴奏对不齐就在「延迟补偿」里填毫秒数。把播放头放到想开始的地方，点「录音」（或按 R），伴奏和歌词会一起走；重录某一句，就把播放头放回那一句再录，新的会盖掉旧的。空格是播放和暂停。</dd></div>
        <div><dt>导出</dt><dd>「干声」只有你的声音，没有任何处理，从歌曲开头算起，放进宿主软件能和伴奏直接对齐，方便修音。「混音」是伴奏加你的声音。分离出来的「伴奏」也可以单独下载。</dd></div>
        <div><dt>隐私</dt><dd>歌和录音都只在浏览器里处理，不会上传。只有找歌词时，会把链接或歌名发给本站，再由本站去问网易云。分离好的伴奏会存在浏览器里（最近 5 首），同一首歌下次打开不用再等。</dd></div>
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
