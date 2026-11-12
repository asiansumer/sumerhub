import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PiArrowLeft } from 'react-icons/pi';
import { categories, getTool, tools } from '@/tools/registry';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';
import ToolIcon from '@/components/tool-icon';
import ToolMount from '@/components/tool-mount';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return tools.map(tool => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getTool((await params).slug);
  return tool ? { title: tool.name, description: tool.description } : {};
}

/** 所有工具共用的外框：返回、标题、简介、标签。工具本身只管中间那块。 */
export default async function ToolPage({ params }: Props) {
  const tool = getTool((await params).slug);
  if (!tool) notFound();
  return (
    <div className="page">
      <SiteHeader />
      <main className="tool-page">
        <nav className="crumbs" aria-label="位置">
          <Link href="/"><PiArrowLeft size={14} />所有工具</Link>
          <span>/</span><span>{categories[tool.category].label}</span>
        </nav>
        <header className="tool-head">
          <span className={`tool-tile large tile-${tool.category}`}><ToolIcon name={tool.icon} size={28} /></span>
          <div>
            <h1>{tool.name}</h1>
            <p>{tool.description}</p>
          </div>
          <ul className="tags">{tool.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
        </header>
        <ToolMount slug={tool.slug} />
      </main>
      <SiteFooter />
    </div>
  );
}
