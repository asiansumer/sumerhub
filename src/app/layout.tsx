import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Sumerhub · 常用小工具', template: '%s · Sumerhub' },
  description: 'Sumer 的个人工具箱：常用的网页小工具聚合在一起，打开即用，文件在浏览器本地处理。',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ec' },
    { media: '(prefers-color-scheme: dark)', color: '#141310' },
  ],
};

// 在首帧前恢复用户选择的深浅色，避免闪烁。
const themeScript = `try{var t=localStorage.getItem('sumerhub-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
