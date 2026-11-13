'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import ToolLoading from '@/components/tool-loading';

/**
 * 每个工具按需加载：打开首页时不会下载任何工具的代码。
 * 新工具在这里加一行，key 要和 registry.ts 里的 slug 一致。
 */
export const loaders: Record<string, ComponentType> = {
  'ncm-to-mp3': dynamic(() => import('./ncm-to-mp3/tool'), { ssr: false, loading: ToolLoading }),
  'audio-analyze': dynamic(() => import('./audio-analyze/tool'), { ssr: false, loading: ToolLoading }),
  'audio-convert': dynamic(() => import('./audio-convert/tool'), { ssr: false, loading: ToolLoading }),
  'pdf-pages': dynamic(() => import('./pdf-pages/tool'), { ssr: false, loading: ToolLoading }),
  'image-compress': dynamic(() => import('./image-compress/tool'), { ssr: false, loading: ToolLoading }),
  'metronome-tuner': dynamic(() => import('./metronome-tuner/tool'), { ssr: false, loading: ToolLoading }),
  'vocal-split': dynamic(() => import('./vocal-split/tool'), { ssr: false, loading: ToolLoading }),
  'remove-bg': dynamic(() => import('./remove-bg/tool'), { ssr: false, loading: ToolLoading }),
};
