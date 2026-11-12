/**
 * Sumerhub 工具清单 —— 加新工具时，先在这里登记一条。
 *
 * 1. 在 src/tools/<slug>/ 下写工具本身（默认导出一个 React 组件）。
 * 2. 在下面的 tools 数组里加一条。
 * 3. 在 src/tools/loaders.ts 里加一行懒加载。
 *
 * 首页列表、搜索、工具页标题和 SEO 都从这里自动生成。
 */

export type Tool = {
  slug: string;
  name: string;
  /** 一句话，出现在首页列表和工具页标题下。 */
  tagline: string;
  /** 首页列表右侧的小字分类，例如「音频」。 */
  category: string;
  /** 给搜索用的额外关键词。 */
  keywords?: string[];
};

export const tools: Tool[] = [
  {
    slug: 'ncm-to-mp3',
    name: 'NCM 转 MP3',
    tagline: '把网易云的 .ncm 转成 MP3，保留封面和标签。',
    category: '音频',
    keywords: ['ncm', 'mp3', '网易云', 'netease', 'flac', '音乐', '转换'],
  },
];

export function getTool(slug: string) {
  return tools.find(tool => tool.slug === slug);
}
