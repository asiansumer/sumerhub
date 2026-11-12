/**
 * Sumerhub 工具清单 —— 加新工具时，先在这里登记一条。
 *
 * 1. 在 src/tools/<slug>/ 下写工具本身（默认导出一个 React 组件）。
 * 2. 在下面的 tools 数组里加一条元数据。
 * 3. 在 src/tools/loaders.ts 里加一行懒加载。
 *
 * 首页卡片、搜索、分类、工具页标题和 SEO 都从这里自动生成。
 */

export const categories = {
  audio: { label: '音频', en: 'Audio' },
  image: { label: '图片', en: 'Image' },
  text: { label: '文本', en: 'Text' },
  dev: { label: '开发', en: 'Dev' },
  life: { label: '生活', en: 'Life' },
} as const;

export type Category = keyof typeof categories;

/** 工具卡片上的图标，名字对应 src/components/tool-icon.tsx 里的映射。 */
export type IconName = 'waveform' | 'image' | 'text' | 'code' | 'sparkle';

export type Tool = {
  slug: string;
  name: string;
  /** 一句话，出现在卡片上。 */
  tagline: string;
  /** 工具页标题下的简介，也用于 SEO description。 */
  description: string;
  category: Category;
  icon: IconName;
  /** 卡片上的小标签，2–3 个就够。 */
  tags: string[];
  /** 给搜索用的额外关键词。 */
  keywords?: string[];
  /** 加入 Sumerhub 的日期，YYYY-MM-DD。 */
  added: string;
};

export const tools: Tool[] = [
  {
    slug: 'ncm-to-mp3',
    name: 'NCM 转 MP3',
    tagline: '网易云 .ncm 一键转成 MP3，保留封面和歌词标签。',
    description: '把网易云音乐下载的 .ncm 文件转换成通用的 MP3。支持批量、试听和打包下载，音频只在你的浏览器里处理，不会上传。',
    category: 'audio',
    icon: 'waveform',
    tags: ['本地处理', '批量', '保留封面'],
    keywords: ['ncm', 'mp3', '网易云', 'netease', 'flac', '音乐', '转换', 'ncmswift'],
    added: '2026-11-12',
  },
];

export function getTool(slug: string) {
  return tools.find(tool => tool.slug === slug);
}
