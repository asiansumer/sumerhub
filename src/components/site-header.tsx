'use client';

import { PiMoon, PiSun } from 'react-icons/pi';
import Logo from './logo';

export default function SiteHeader({ children }: { children?: React.ReactNode }) {
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('sumerhub-theme', next); } catch {}
  }
  return (
    <header className="site-header">
      <Logo />
      <div className="header-actions">
        {children}
        <button className="icon-button" onClick={toggleTheme} aria-label="切换深浅色">
          <PiSun className="when-dark" size={18} /><PiMoon className="when-light" size={18} />
        </button>
      </div>
    </header>
  );
}
