'use client';

import { useMemo, useState } from 'react';
import CopyButton from '@/components/copy-button';

const FLAGS = [
  { flag: 'g', title: '找出全部，而不是只找第一个' },
  { flag: 'i', title: '不分大小写' },
  { flag: 'm', title: '^ 和 $ 匹配每一行的开头结尾' },
  { flag: 's', title: '. 也能匹配换行' },
  { flag: 'u', title: '按 Unicode 处理（中文、表情）' },
];
const MAX_MATCHES = 2000;
const SAMPLE = '联系我：sumer@example.com 或 hello@ncmswift.xyz\n电话 138-0000-1234';

type Match = { index: number; text: string; groups: (string | undefined)[]; named?: Record<string, string> };

export default function RegexPanel() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const [replacing, setReplacing] = useState(false);

  const result = useMemo(() => {
    if (!pattern) return { matches: [] as Match[] };
    let regex: RegExp;
    try { regex = new RegExp(pattern, flags); }
    catch (error) { return { matches: [] as Match[], error: (error as Error).message.replace(/^Invalid regular expression: (\/.*\/[a-z]*: )?/, '') }; }
    const matches: Match[] = [];
    if (flags.includes('g')) {
      for (const match of text.matchAll(regex)) {
        matches.push({ index: match.index, text: match[0], groups: match.slice(1), named: match.groups });
        if (matches.length >= MAX_MATCHES) break;
      }
    } else {
      const match = regex.exec(text);
      if (match) matches.push({ index: match.index, text: match[0], groups: match.slice(1), named: match.groups });
    }
    let replaced = '';
    try { replaced = text.replace(regex, replacement); } catch { /* 忽略 */ }
    return { matches, replaced };
  }, [pattern, flags, text, replacement]);

  // 把原文切成「匹配到的」和「没匹配到的」交替的片段。
  const pieces = useMemo(() => {
    const parts: { text: string; hit: boolean }[] = [];
    let cursor = 0;
    for (const match of result.matches) {
      if (!match.text) continue;
      if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index), hit: false });
      parts.push({ text: match.text, hit: true });
      cursor = match.index + match.text.length;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
    return parts;
  }, [result.matches, text]);

  const toggle = (flag: string) => setFlags(flags.includes(flag) ? flags.replace(flag, '') : flags + flag);

  return (
    <div className="kit">
      <div className="regex-bar">
        <label className={'regex-input' + (result.error ? ' bad' : '')}>
          <span>/</span>
          <input value={pattern} onChange={event => setPattern(event.target.value)} placeholder="[\w.]+@[\w.]+" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="正则表达式" autoFocus />
          <span>/{flags}</span>
        </label>
        <div className="segmented" role="group" aria-label="选项">
          {FLAGS.map(({ flag, title }) => <button key={flag} title={title} aria-pressed={flags.includes(flag)} onClick={() => toggle(flag)}>{flag}</button>)}
        </div>
      </div>
      {result.error && <p className="message"><span className="row-error">正则写得不对：{result.error}</span></p>}
      <div className="duo">
        <div className="pane">
          <div className="pane-head"><span>要测试的文字</span>{!text && <button className="link" onClick={() => { setText(SAMPLE); if (!pattern) setPattern('[\\w.]+@[\\w.]+'); }}>放一段例子</button>}</div>
          <textarea className="code-in" value={text} onChange={event => setText(event.target.value)} placeholder="把文字粘贴到这里" spellCheck={false} aria-label="要测试的文字" />
        </div>
        <div className="pane">
          <div className="pane-head">
            <span>{pattern && !result.error ? `匹配到 ${result.matches.length}${result.matches.length >= MAX_MATCHES ? '+' : ''} 处` : '匹配结果'}</span>
            <div className="segmented" role="group" aria-label="查看">
              <button aria-pressed={!replacing} onClick={() => setReplacing(false)}>匹配</button>
              <button aria-pressed={replacing} onClick={() => setReplacing(true)}>替换</button>
            </div>
          </div>
          {replacing ? (
            <>
              <div className="regex-replace">
                <input className="input" value={replacement} onChange={event => setReplacement(event.target.value)} placeholder="替换成…（可以用 $1、$2 引用分组）" spellCheck={false} aria-label="替换成" />
                <CopyButton text={result.replaced ?? ''} label="复制" disabled={!result.replaced} />
              </div>
              <pre className="code-out">{result.replaced ?? ''}</pre>
            </>
          ) : (
            <>
              <pre className="code-out regex-marked">{pieces.length ? pieces.map((piece, index) => piece.hit ? <mark key={index}>{piece.text}</mark> : piece.text) : <span className="placeholder">匹配到的部分会在这里标出来</span>}</pre>
              {result.matches.some(match => match.groups.length > 0) && (
                <ol className="regex-groups">
                  {result.matches.slice(0, 50).map((match, index) => (
                    <li key={index}><b>{match.text}</b>{match.groups.map((group, n) => <span key={n}><i>${n + 1}</i>{group ?? '（空）'}</span>)}</li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
