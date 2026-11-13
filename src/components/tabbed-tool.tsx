'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

export type Tab = { id: string; label: string; Panel: ComponentType; notes?: ReactNode };

/**
 * 几个小功能共用一个工具位：上面一排标签，下面是当前那个。
 * 地址栏带 #id 可以直接打开对应的标签；切换时也会写回地址栏，方便收藏。
 */
export default function TabbedTool({ tabs, label }: { tabs: readonly Tab[]; label: string }) {
  const [tab, setTab] = useState(tabs[0].id);

  useEffect(() => {
    const read = () => { const hash = location.hash.slice(1); setTab(tabs.some(item => item.id === hash) ? hash : tabs[0].id); };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [tabs]);

  function choose(id: string) {
    setTab(id);
    history.replaceState(null, '', id === tabs[0].id ? location.pathname : '#' + id);
  }

  const current = tabs.find(item => item.id === tab) ?? tabs[0];
  return (
    <div className="tool pocket">
      <div className="panel">
        <nav className="pocket-tabs" role="tablist" aria-label={label}>
          {tabs.map(item => (
            <button key={item.id} role="tab" aria-selected={current.id === item.id} onClick={() => choose(item.id)}>{item.label}</button>
          ))}
        </nav>
        <div role="tabpanel"><current.Panel key={current.id} /></div>
      </div>
      {current.notes}
    </div>
  );
}
