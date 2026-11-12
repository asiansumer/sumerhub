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
    slug: 'remove-bg',
    name: '抠图',
    tagline: '去掉照片的背景，导出透明 PNG，也可以换成纯色背景。',
    category: '图片',
    added: '2026.11',
    source: { name: 'ZhengPeng7/BiRefNet', url: 'https://github.com/ZhengPeng7/BiRefNet' },
    keywords: ['remove', 'background', 'bg', 'cutout', 'matting', 'transparent', 'png', '抠图', '去背景', '透明', '证件照', '换背景', '白底', '封面', '图片'],
  },
  {
    slug: 'audio-analyze',
    name: '音频分析',
    tagline: '看一首歌或伴奏的 BPM、调性、音阶和响度。',
    category: '音频',
    added: '2026.11',
    source: { name: 'Tunebat', url: 'https://tunebat.com/Analyzer', inspired: true },
    keywords: ['bpm', 'key', 'tempo', 'camelot', 'lufs', 'tunebat', 'dj', 'autotune', '速度', '节拍', '调性', '音阶', '伴奏', '修音', '响度', '音乐', '分析'],
  },
  {
    slug: 'audio-convert',
    name: '音频转换',
    tagline: 'MP3、WAV、FLAC、M4A、OGG 互转，也能从视频里取出声音。',
    category: '音频',
    added: '2026.11',
    source: { name: 'Vanilagy/mediabunny', url: 'https://github.com/Vanilagy/mediabunny' },
    keywords: ['audio', 'convert', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'mp4', 'video', 'extract', 'ffmpeg', '转换', '格式', '提取', '音频', '视频', '伴奏', '转码'],
  },
  {
    slug: 'pdf-pages',
    name: 'PDF 合并拆分',
    tagline: '合并、拆分 PDF，调整页面顺序，旋转或删掉某几页。',
    category: '文档',
    added: '2026.11',
    source: { name: 'Hopding/pdf-lib', url: 'https://github.com/Hopding/pdf-lib' },
    keywords: ['pdf', 'merge', 'split', 'rotate', 'pdf-lib', '合并', '拆分', '旋转', '删除页面', '排序', '提取', '图片转 pdf', '文档'],
  },
  {
    slug: 'pocket',
    name: '小工具',
    tagline: '节拍器、调音器和二维码，几个随手要用的小东西放在一起。',
    category: '小工具',
    added: '2026.11',
    keywords: ['metronome', 'tuner', 'pitch', 'qr', 'qrcode', 'wifi', 'bpm', 'tap', '节拍器', '节拍', '敲击', '调音器', '调音', '音准', '音高', '唱歌', '二维码', '条形码', '扫码', '识别', '生成'],
  },
];

export function getTool(slug: string) {
  return tools.find(tool => tool.slug === slug);
}
