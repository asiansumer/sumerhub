'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { REPOSITORY, tools } from '@/tools/registry';
import { previews } from '@/tools/previews';
import SiteHeader from './site-header';

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
/** 工具少的时候不需要搜索框。 */
const SEARCH_FROM = 6;
/** 工具多到这个数、且不止一个分类时，首页按分类分组。 */
const GROUP_FROM = 6;

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

  // 工具多了以后按分类分组；搜索时不分组。
  const grouped = !query && tools.length >= GROUP_FROM && new Set(tools.map(tool => tool.category)).size > 1;
  const groups = grouped
    ? [...new Set(visible.map(tool => tool.category))].map(category => ({ category, items: visible.filter(tool => tool.category === category) }))
    : [{ category: '', items: visible }];
  // 一两个工具时用大卡片，三个以上是三列网格。
  const layout = visible.length === 1 ? 'cards one' : visible.length === 2 ? 'cards two' : 'cards';

  return (
    <div className="page">
      <SiteHeader>
        {tools.length >= SEARCH_FROM && (
          <label className="search">
            <input ref={search} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="搜索工具" aria-label="搜索工具" />
            <kbd>/</kbd>
          </label>
        )}
      </SiteHeader>
      <main>
        {groups.map(group => (
          <section key={group.category} className="group">
            {group.category && <h2 className="group-label">{group.category}<span>{group.items.length}</span></h2>}
            <div className={layout}>
              {group.items.map(tool => {
                const index = visible.indexOf(tool);
                const Preview = previews[tool.slug];
                return (
                  <Link key={tool.slug} href={`/tools/${tool.slug}`} className={index === active ? 'card active' : 'card'}
                    onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(-1)}>
                    <div className="card-preview">{Preview ? <Preview /> : <span className="initial">{tool.name.slice(0, 1)}</span>}</div>
                    <div className="card-body">
                      <h3>{tool.name}<span className="card-arrow" aria-hidden="true">↗</span></h3>
                      <p>{tool.tagline}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {!visible.length && <p className="empty">没有找到「{query}」。</p>}
      </main>
      <footer className="site-footer"><span><i className="dot" />所有工具都在浏览器本地运行，文件不会上传</span><a href={REPOSITORY} target="_blank" rel="noopener noreferrer">源代码</a></footer>
    </div>
  );
}
