'use client';

import { useEffect, useRef, useState } from 'react';
import type { IHasher } from 'hash-wasm';
import CopyButton from '@/components/copy-button';
import DropArea from '@/components/drop-area';
import { formatSize } from '@/lib/format';

const ALGORITHMS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] as const;
type Algorithm = (typeof ALGORITHMS)[number];
type Hashes = Record<Algorithm, string>;
const CHUNK = 8 * 1024 * 1024;

async function hashers(): Promise<Record<Algorithm, IHasher>> {
  const { createMD5, createSHA1, createSHA256, createSHA512 } = await import('hash-wasm');
  const [md5, sha1, sha256, sha512] = await Promise.all([createMD5(), createSHA1(), createSHA256(), createSHA512()]);
  return { 'MD5': md5, 'SHA-1': sha1, 'SHA-256': sha256, 'SHA-512': sha512 };
}
const digest = (set: Record<Algorithm, IHasher>) => Object.fromEntries(ALGORITHMS.map(name => [name, set[name].digest('hex')])) as Hashes;

export default function HashPanel() {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [hashes, setHashes] = useState<Hashes | null>(null);
  const [expected, setExpected] = useState('');
  const [upper, setUpper] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    const id = ++run.current;
    setHashes(null); setProgress(null);
    if (mode === 'text' ? !text : !file) return;
    (async () => {
      const set = await hashers();
      ALGORITHMS.forEach(name => set[name].init());
      if (mode === 'text') ALGORITHMS.forEach(name => set[name].update(text));
      else {
        // 大文件一块一块读，不把整个文件放进内存。
        for (let offset = 0; offset < file!.size; offset += CHUNK) {
          const chunk = new Uint8Array(await file!.slice(offset, offset + CHUNK).arrayBuffer());
          if (run.current !== id) return;
          ALGORITHMS.forEach(name => set[name].update(chunk));
          setProgress(Math.min(1, (offset + CHUNK) / file!.size));
        }
      }
      if (run.current === id) { setHashes(digest(set)); setProgress(null); }
    })();
  }, [mode, text, file]);

  const wanted = expected.trim().toLowerCase().replace(/\s+/g, '');
  const matched = hashes && wanted ? ALGORITHMS.find(name => hashes[name] === wanted) : undefined;
  const show = (value: string) => upper ? value.toUpperCase() : value;

  return (
    <div className="kit">
      <div className="controls">
        <div className="field">
          <div className="segmented" role="group" aria-label="算什么">
            <button aria-pressed={mode === 'text'} onClick={() => setMode('text')}>文字</button>
            <button aria-pressed={mode === 'file'} onClick={() => setMode('file')}>文件</button>
          </div>
        </div>
        <div className="field">
          <span>字母</span>
          <div className="segmented" role="group" aria-label="大小写">
            <button aria-pressed={!upper} onClick={() => setUpper(false)}>小写</button>
            <button aria-pressed={upper} onClick={() => setUpper(true)}>大写</button>
          </div>
        </div>
      </div>

      {mode === 'text'
        ? <textarea className="code-in short" value={text} onChange={event => setText(event.target.value)} placeholder="输入或粘贴文字" spellCheck={false} aria-label="要计算的文字" autoFocus />
        : <DropArea accept={{}} multiple={false} compact={Boolean(file)} onFiles={files => setFile(files[0] ?? null)} inputLabel="选择文件"
            title="把文件拖到这里" hint="任何文件都可以，多大都行" compactTitle={file ? `${file.name} · ${formatSize(file.size)}` : ''} compactButton="换一个" />}

      {progress !== null && (
        <div className="progress"><div className="progress-label"><span>正在计算…</span><span>{Math.round(progress * 100)}%</span></div><div className="bar"><span style={{ width: `${progress * 100}%` }} /></div></div>
      )}

      {hashes && (
        <>
          <ul className="rows values hashes">
            {ALGORITHMS.map(name => (
              <li key={name} className={'row' + (matched === name ? ' matched' : '')}>
                <span className="value-label">{name}</span><code>{show(hashes[name])}</code><CopyButton text={show(hashes[name])} />
              </li>
            ))}
          </ul>
          <div className="hash-check">
            <input className="input" value={expected} onChange={event => setExpected(event.target.value)} placeholder="要核对的话，把网站给的校验值粘贴到这里" spellCheck={false} aria-label="要核对的校验值" />
            {wanted && <span className={matched ? 'good' : 'bad'} role="status">{matched ? `和 ${matched} 一致` : '都对不上'}</span>}
          </div>
        </>
      )}
    </div>
  );
}
