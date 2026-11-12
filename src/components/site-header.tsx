'use client';

import Link from 'next/link';

export default function SiteHeader({ title }: { title?: string }) {
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('sumerhub-theme', next); } catch {}
  }
  return (
    <header className="site-header">
      <nav className="crumbs" aria-label="位置">
        <Link href="/" className={title ? 'crumb-home' : 'crumb-home current'}>sumerhub</Link>
        {title && <><span aria-hidden="true">/</span><span className="current">{title}</span></>}
      </nav>
      <button className="theme-toggle" onClick={toggleTheme} aria-label="切换深浅色"><span /></button>
    </header>
  );
}
