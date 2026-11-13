'use client';

import { useMemo, useState } from 'react';
import { jsonrepair } from 'jsonrepair';
import CopyButton from '@/components/copy-button';
import { formatSize } from '@/lib/format';
import Code from './highlight';

type Indent = '2' | '4' | 'tab' | 'min';
const INDENTS: { value: Indent; label: string }[] = [
  { value: '2', label: '2 格' }, { value: '4', label: '4 格' }, { value: 'tab', label: 'Tab' }, { value: 'min', label: '压成一行' },
];

/** 把 JSON.parse 报的位置换成第几行第几列。各浏览器的报错写法不一样，认不出来就只给原话。 */
function locate(text: string, message: string) {
  const position = message.match(/position (\d+)/);
  const lineColumn = message.match(/line (\d+) column (\d+)/);
  if (lineColumn) return `第 ${lineColumn[1]} 行第 ${lineColumn[2]} 列`;
  if (!position) return '';
  const before = text.slice(0, Number(position[1]));
  return `第 ${before.split('\n').length} 行第 ${before.length - before.lastIndexOf('\n')} 列`;
}

export default function JsonPanel() {
  const [text, setText] = useState('');
  const [indent, setIndent] = useState<Indent>('2');

  const result = useMemo(() => {
    if (!text.trim()) return { output: '' };
    try {
      const value = JSON.parse(text);
      return { output: JSON.stringify(value, null, indent === 'min' ? undefined : indent === 'tab' ? '\t' : Number(indent)) };
    } catch (error) {
      const message = (error as Error).message;
      let repaired: string | undefined;
      try { repaired = jsonrepair(text); JSON.parse(repaired); } catch { repaired = undefined; }
      return { output: '', error: `这段 JSON 有错${locate(text, message) ? '，在' + locate(text, message) : ''}。`, detail: message, repaired };
    }
  }, [text, indent]);

  return (
    <div className="kit">
      <div className="controls">
        <div className="field">
          <span>缩进</span>
          <div className="segmented" role="group" aria-label="缩进">
            {INDENTS.map(option => <button key={option.value} aria-pressed={indent === option.value} onClick={() => setIndent(option.value)}>{option.label}</button>)}
          </div>
        </div>
      </div>
      <div className="duo">
        <div className="pane">
          <div className="pane-head"><span>输入</span>{text && <button className="link" onClick={() => setText('')}>清空</button>}</div>
          <textarea className="code-in" value={text} onChange={event => setText(event.target.value)} placeholder={'把 JSON 粘贴到这里\n\n{"name":"Sumerhub","tools":7}'} spellCheck={false} aria-label="JSON 输入" autoFocus />
        </div>
        <div className="pane">
          <div className="pane-head">
            <span>{result.error ? '有错误' : result.output ? `结果 · ${formatSize(new Blob([result.output]).size)}` : '结果'}</span>
            <CopyButton text={result.output} label="复制" disabled={!result.output} />
          </div>
          {result.error ? (
            <div className="pane-problem">
              <p className="row-error">{result.error}</p>
              <p className="problem-detail">{result.detail}</p>
              {result.repaired
                ? <button className="button ghost" onClick={() => setText(result.repaired!)}>自动修复</button>
                : <p className="problem-detail">修不好，可能缺了一大段。</p>}
            </div>
          ) : <Code code={result.output} language="json" placeholder="整理好的 JSON 会出现在这里" />}
        </div>
      </div>
    </div>
  );
}
