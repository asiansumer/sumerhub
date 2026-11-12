'use client';

import { loaders } from '@/tools/loaders';

export default function ToolMount({ slug }: { slug: string }) {
  const Tool = loaders[slug];
  return <section className="tool-body">{Tool ? <Tool /> : <p className="empty">这个工具还没接上。</p>}</section>;
}
