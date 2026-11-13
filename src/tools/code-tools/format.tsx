'use client';

import { useEffect, useState } from 'react';
import CopyButton from '@/components/copy-button';
import Code, { type Language } from './highlight';

type Kind = 'html' | 'css' | 'js' | 'sql';
const KINDS: { value: Kind; label: string; language: Language; sample: string }[] = [
  { value: 'html', label: 'HTML', language: 'xml', sample: '<div><p>你好</p><a href="#">链接</a></div>' },
  { value: 'css', label: 'CSS', language: 'css', sample: '.card{display:flex;gap:8px}.card:hover{opacity:.8}' },
  { value: 'js', label: 'JS', language: 'javascript', sample: 'function add(a,b){return a+b}const x=[1,2,3].map(n=>n*2)' },
  { value: 'sql', label: 'SQL', language: 'sql', sample: 'select id,name from users where age>18 order by name' },
];

export default function FormatPanel() {
  const [kind, setKind] = useState<Kind>('html');
  const [size, setSize] = useState(2);
  const [text, setText] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const current = KINDS.find(option => option.value === kind)!;

  useEffect(() => {
    let cancelled = false;
    if (!text.trim()) { setOutput(''); setError(''); return; }
    (async () => {
      try {
        let result: string;
        if (kind === 'sql') result = (await import('sql-formatter')).format(text, { tabWidth: size, keywordCase: 'upper' });
        else {
          const beautify = (await import('js-beautify')).default;
          const options = { indent_size: size, end_with_newline: false, max_preserve_newlines: 2 };
          result = kind === 'html' ? beautify.html(text, { ...options, wrap_line_length: 0 }) : kind === 'css' ? beautify.css(text, options) : beautify.js(text, options);
        }
        if (!cancelled) { setOutput(result); setError(''); }
      } catch (cause) {
        if (!cancelled) { setOutput(''); setError((cause as Error).message.split('\n')[0]); }
      }
    })();
    return () => { cancelled = true; };
  }, [text, kind, size]);

  return (
    <div className="kit">
      <div className="controls">
        <div className="field">
          <span>语言</span>
          <div className="segmented" role="group" aria-label="语言">
            {KINDS.map(option => <button key={option.value} aria-pressed={kind === option.value} onClick={() => setKind(option.value)}>{option.label}</button>)}
          </div>
        </div>
        <div className="field">
          <span>缩进</span>
          <div className="segmented" role="group" aria-label="缩进">
            {[2, 4].map(value => <button key={value} aria-pressed={size === value} onClick={() => setSize(value)}>{value} 格</button>)}
          </div>
        </div>
      </div>
      <div className="duo">
        <div className="pane">
          <div className="pane-head"><span>输入</span>{text && <button className="link" onClick={() => setText('')}>清空</button>}</div>
          <textarea className="code-in" value={text} onChange={event => setText(event.target.value)} placeholder={`把 ${current.label} 粘贴到这里\n\n${current.sample}`} spellCheck={false} aria-label="代码输入" autoFocus />
        </div>
        <div className="pane">
          <div className="pane-head"><span>{error ? '有错误' : '结果'}</span><CopyButton text={output} label="复制" disabled={!output} /></div>
          {error
            ? <div className="pane-problem"><p className="row-error">这段 {current.label} 整理不了。</p><p className="problem-detail">{error}</p></div>
            : <Code code={output} language={current.language} placeholder="整理好的代码会出现在这里" />}
        </div>
      </div>
    </div>
  );
}
