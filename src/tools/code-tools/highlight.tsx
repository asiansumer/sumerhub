'use client';

import hljs from 'highlight.js/lib/core';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('json', json);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('sql', sql);

export type Language = 'json' | 'javascript' | 'css' | 'xml' | 'sql';
/** 太长的内容不上色，免得卡。 */
const LIMIT = 300_000;

/** 带语法颜色的只读代码块（highlight.js 输出的是转义过的 HTML）。 */
export default function Code({ code, language, placeholder }: { code: string; language: Language; placeholder?: string }) {
  if (!code) return <pre className="code-out empty">{placeholder}</pre>;
  if (code.length > LIMIT) return <pre className="code-out">{code}</pre>;
  return <pre className="code-out" dangerouslySetInnerHTML={{ __html: hljs.highlight(code, { language }).value }} />;
}
