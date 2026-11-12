'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { tools } from '@/tools/registry';
import { previews } from '@/tools/previews';
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

  // 工具数是奇数时，第一张卡片横跨整行。
  const wideFirst = !query && visible.length % 2 === 1;

  return (
    <div className="page">
      <SiteHeader />
      <main>
        <section className="intro">
          <h1>Sumer 的工具箱</h1>
          <p>常用的小工具放在一起。打开就能用，文件不离开浏览器。</p>
        </section>
        <div className="list-head">
          <span>工具</span>
          {tools.length >= SEARCH_FROM ? (
            <label className="search">
              <input ref={search} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="搜索" aria-label="搜索工具" />
              <kbd>/</kbd>
            </label>
          ) : <span className="count">{String(tools.length).padStart(2, '0')}</span>}
        </div>
        <div className="cards">
          {visible.map((tool, index) => {
            const Preview = previews[tool.slug];
            return (
              <Link key={tool.slug} href={`/tools/${tool.slug}`} className={'card' + (wideFirst && index === 0 ? ' wide' : '') + (index === active ? ' active' : '')}
                onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(-1)}>
                <div className="card-preview">{Preview ? <Preview /> : <span className="initial">{tool.name.slice(0, 1)}</span>}</div>
                <div className="card-body">
                  <h2>{tool.name}<span className="card-arrow" aria-hidden="true">↗</span></h2>
                  <p>{tool.tagline}</p>
                  <div className="card-meta"><span>{tool.category}</span><span>{tool.added}</span></div>
                </div>
              </Link>
            );
          })}
        </div>
        {!visible.length && <p className="empty">没有找到「{query}」。</p>}
      </main>
      <footer className="site-footer"><span><i className="dot" />所有工具都在浏览器本地运行</span><span>sumerhub</span></footer>
    </div>
  );
}
