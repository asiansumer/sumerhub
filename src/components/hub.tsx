'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { tools } from '@/tools/registry';
import SiteHeader from './site-header';

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
/** 工具少的时候不需要搜索框。 */
const SEARCH_FROM = 6;

export default function Hub() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const search = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const q = normalize(query);
    return tools.filter(tool => !q || normalize([tool.name, tool.tagline, tool.category, ...(tool.keywords ?? [])].join(' ')).includes(q));
  }, [query]);

  // 键盘：/ 搜索，↑↓ 选择，回车打开。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement;
      if (event.key === '/' && !typing) { event.preventDefault(); search.current?.focus(); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, visible.length - 1)); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
      else if (event.key === 'Enter' && (active >= 0 || typing) && visible[Math.max(active, 0)]) { event.preventDefault(); router.push('/tools/' + visible[Math.max(active, 0)].slug); }
      else if (event.key === 'Escape' && typing) { setQuery(''); search.current?.blur(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, active, router]);

  return (
    <div className="page">
      <SiteHeader />
      <main>
        {tools.length >= SEARCH_FROM && (
          <label className="search">
            <input ref={search} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="搜索" aria-label="搜索工具" />
            <kbd>/</kbd>
          </label>
        )}
        <ul className="tool-list">
          {visible.map((tool, index) => (
            <li key={tool.slug}>
              <Link href={`/tools/${tool.slug}`} className={index === active ? 'tool-row active' : 'tool-row'} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(-1)}>
                <span className="row-name">{tool.name}</span>
                <span className="row-desc">{tool.tagline}</span>
                <span className="row-meta">{tool.category}</span>
              </Link>
            </li>
          ))}
        </ul>
        {!visible.length && <p className="empty">没有找到「{query}」。</p>}
      </main>
      <footer className="site-footer">所有工具都在浏览器本地运行，文件不会上传。</footer>
    </div>
  );
}
