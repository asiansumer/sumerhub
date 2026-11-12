import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/source-serif-4/wght.css';
import '@fontsource/noto-serif-sc/500.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Sumerhub', template: '%s · Sumerhub' },
  description: '常用的网页小工具，打开即用，文件在浏览器本地处理。',
};

export const viewport: Viewport = { themeColor: '#0f0f10', colorScheme: 'dark' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
