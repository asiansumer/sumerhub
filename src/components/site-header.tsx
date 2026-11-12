import Link from 'next/link';

export default function SiteHeader({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <header className="site-header">
      <nav className="crumbs" aria-label="位置">
        <Link href="/" className="wordmark">Sumerhub</Link>
        {title && <><span aria-hidden="true">/</span><span className="current">{title}</span></>}
      </nav>
      {children}
    </header>
  );
}
