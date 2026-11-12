'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PiArrowRight, PiMagnifyingGlass, PiPlus } from 'react-icons/pi';
import { categories, tools, type Category } from '@/tools/registry';
import SiteHeader from './site-header';
import SiteFooter from './site-footer';
import ToolIcon from './tool-icon';

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');

export default function Hub() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const search = useRef<HTMLInputElement>(null);

  // 按 / 或 ⌘K 直接开始搜索。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]');
      if ((event.key === '/' && !typing) || (event.key === 'k' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault(); search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const used = useMemo(() => (Object.keys(categories) as Category[]).filter(key => tools.some(tool => tool.category === key)), []);
  const visible = useMemo(() => {
    const q = normalize(query);
    return tools
      .map((tool, index) => ({ tool, index }))
      .filter(({ tool }) => category === 'all' || tool.category === category)
      .filter(({ tool }) => !q || normalize([tool.name, tool.tagline, categories[tool.category].label, ...tool.tags, ...(tool.keywords ?? [])].join(' ')).includes(q));
  }, [query, category]);

  return (
    <div className="page">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Sumer&apos;s toolbox<span>{String(tools.length).padStart(2, '0')} 个工具</span></p>
            <h1>顺手的小工具，<br />都放在<em>这里</em>。</h1>
            <p className="lede">打开就能用，文件留在你自己的电脑上。<br className="hide-mobile" />用到什么，就慢慢往里加什么。</p>
            <label className="search">
              <PiMagnifyingGlass size={18} aria-hidden="true" />
              <input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索工具，比如 mp3" aria-label="搜索工具" />
              <kbd>/</kbd>
            </label>
          </div>
          <div className="horizon" aria-hidden="true"><div className="sun" /><div className="ground" /></div>
        </section>

        <div className="toolbar">
          <nav className="chips" aria-label="按分类筛选">
            <button className={category === 'all' ? 'chip active' : 'chip'} onClick={() => setCategory('all')}>全部<span>{tools.length}</span></button>
            {used.map(key => (
              <button key={key} className={category === key ? 'chip active' : 'chip'} onClick={() => setCategory(key)}>
                {categories[key].label}<span>{tools.filter(tool => tool.category === key).length}</span>
              </button>
            ))}
          </nav>
        </div>

        <section className="grid" aria-label="工具列表">
          {visible.map(({ tool, index }) => (
            <Link key={tool.slug} href={`/tools/${tool.slug}`} className="tool-card">
              <div className="card-top">
                <span className={`tool-tile tile-${tool.category}`}><ToolIcon name={tool.icon} /></span>
                <span className="card-index">{String(index + 1).padStart(2, '0')} · {categories[tool.category].en}</span>
              </div>
              <h2>{tool.name}</h2>
              <p>{tool.tagline}</p>
              <div className="card-foot">
                <ul className="tags">{tool.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
                <span className="card-go"><PiArrowRight size={18} /></span>
              </div>
            </Link>
          ))}
          {!visible.length && <p className="empty">没有找到「{query}」相关的工具。</p>}
          {!query && category === 'all' && (
            <div className="tool-card card-next" aria-label="下一个工具">
              <span className="next-plus"><PiPlus size={20} /></span>
              <h2>下一个工具</h2>
              <p>正在路上。想到常用的，就加进来。</p>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
