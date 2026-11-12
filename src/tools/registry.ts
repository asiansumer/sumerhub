/**
 * Sumerhub 工具清单 —— 加新工具时，先在这里登记一条。
 *
 * 1. 在 src/tools/<slug>/ 下写工具本身（默认导出一个 React 组件）。
 * 2. 在下面的 tools 数组里加一条。
 * 3. 在 src/tools/loaders.ts 里加一行懒加载。
 * 4. （可选）在 src/tools/previews.tsx 里给首页卡片加一张预览图。
 *
 * 首页列表、搜索、工具页标题和 SEO 都从这里自动生成。
 */

/** 网站按 AGPL-3.0 开源，页脚要给出源代码的地址。 */
export const REPOSITORY = 'https://github.com/asiansumer/sumerhub';

export type Tool = {
  slug: string;
  name: string;
  /** 一句话，出现在首页卡片和工具页标题下。 */
  tagline: string;
  /** 分类，例如「音频」。工具多了以后首页按它分组。 */
  category: string;
  /** 加入的年月，例如 2026.11。 */
  added: string;
  /** 代码或灵感来自哪个项目，会显示在工具页底部。只是借鉴想法时加 inspired，显示成「灵感来自」。 */
  source?: { name: string; url: string; inspired?: boolean };
  /** 给搜索用的额外关键词。 */
  keywords?: string[];
};

export const tools: Tool[] = [
  {
    slug: 'ncm-to-mp3',
    name: 'NCM 转 MP3',
    tagline: '把网易云的 .ncm 转成 MP3，保留封面和标签。',
    category: '音频',
    added: '2026.11',
    source: { name: 'asiansumer/NCM-Swift', url: 'https://github.com/asiansumer/NCM-Swift' },
    keywords: ['ncm', 'mp3', '网易云', 'netease', 'flac', '音乐', '转换'],
  },
  {
    slug: 'image-compress',
    name: '图片压缩',
    tagline: '压小 JPG、PNG、WebP、HEIC，顺便转格式、改尺寸。',
    category: '图片',
    added: '2026.11',
    source: { name: 'GoogleChromeLabs/squoosh', url: 'https://github.com/GoogleChromeLabs/squoosh' },
    keywords: ['image', 'compress', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'squoosh', '压缩', '图片', '转换', '缩小'],
  },
  {
    slug: 'audio-analyze',
    name: '音频分析',
    tagline: '看一首歌的 BPM、调性、Camelot 编号和响度。',
    category: '音频',
    added: '2026.11',
    source: { name: 'Tunebat', url: 'https://tunebat.com/Analyzer', inspired: true },
    keywords: ['bpm', 'key', 'tempo', 'camelot', 'lufs', 'tunebat', 'dj', '速度', '节拍', '调性', '响度', '音乐', '分析'],
  },
];

export function getTool(slug: string) {
  return tools.find(tool => tool.slug === slug);
}
