import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTool, tools } from '@/tools/registry';
import SiteHeader from '@/components/site-header';
import ToolMount from '@/components/tool-mount';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return tools.map(tool => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getTool((await params).slug);
  return tool ? { title: tool.name, description: tool.tagline } : {};
}

/** 所有工具共用的外框：页头、标题、一句话简介。工具本身只管下面那块。 */
export default async function ToolPage({ params }: Props) {
  const tool = getTool((await params).slug);
  if (!tool) notFound();
  return (
    <div className="page narrow">
      <SiteHeader title={tool.name} />
      <main>
        <header className="tool-head">
          <h1>{tool.name}</h1>
          <p>{tool.tagline}</p>
        </header>
        <ToolMount slug={tool.slug} />
      </main>
      <footer className="site-footer">
        <span><i className="dot" />在浏览器本地运行，文件不会上传</span>
        {tool.source && <span>{tool.source.inspired ? '灵感来自' : '源自'} <a href={tool.source.url} target="_blank" rel="noopener noreferrer">{tool.source.name}</a></span>}
      </footer>
    </div>
  );
}
