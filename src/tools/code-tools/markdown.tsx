'use client';

import { useEffect, useState } from 'react';
import CopyButton from '@/components/copy-button';
import { saveUrl } from '@/lib/download';
import { useStored } from '@/lib/stored';

const SAMPLE = `# 标题

一段文字，可以**加粗**、*斜体*、\`代码\`，也可以放[链接](https://www.ncmswift.xyz)。

- 列表第一项
- 列表第二项

> 引用一句话

| 工具 | 分类 |
| --- | --- |
| 音频分析 | 音频 |
`;

export default function MarkdownPanel() {
  const [saved, setSaved] = useStored('sumerhub.markdown', { text: '' });
  const [html, setHtml] = useState('');
  const text = saved.text;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
      const rendered = DOMPurify.sanitize(await marked.parse(text, { gfm: true, breaks: true }));
      if (!cancelled) setHtml(rendered);
    })();
    return () => { cancelled = true; };
  }, [text]);

  function download() {
    const page = `<!doctype html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${(text.match(/^#\s+(.+)$/m)?.[1] ?? '文档').replace(/[<>&]/g, '')}</title>\n<style>body{max-width:720px;margin:40px auto;padding:0 20px;font:16px/1.75 -apple-system,"PingFang SC",sans-serif;color:#222}pre,code{font-family:ui-monospace,Menlo,monospace;background:#f4f4f5;border-radius:4px}code{padding:.1em .3em}pre{padding:12px;overflow:auto}pre code{padding:0}blockquote{margin:0;padding-left:1em;border-left:3px solid #ddd;color:#666}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 12px}img{max-width:100%}</style>\n</head>\n<body>\n${html}</body>\n</html>\n`;
    const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }));
    saveUrl(url, 'markdown.html');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="kit">
      <div className="duo">
        <div className="pane">
          <div className="pane-head">
            <span>Markdown</span>
            {text ? <button className="link" onClick={() => setSaved({ text: '' })}>清空</button> : <button className="link" onClick={() => setSaved({ text: SAMPLE })}>放一段例子</button>}
          </div>
          <textarea className="code-in tall" value={text} onChange={event => setSaved({ text: event.target.value })} placeholder="在这里写 Markdown，右边看效果" spellCheck={false} aria-label="Markdown 输入" autoFocus />
        </div>
        <div className="pane">
          <div className="pane-head">
            <span>预览</span>
            <div className="pane-actions">
              <CopyButton text={html} label="复制 HTML" disabled={!text.trim()} />
              <button className="button ghost small" onClick={download} disabled={!text.trim()}>下载 HTML</button>
            </div>
          </div>
          {text.trim() ? <div className="md tall" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="md tall empty">排好版的样子会出现在这里</div>}
        </div>
      </div>
    </div>
  );
}
