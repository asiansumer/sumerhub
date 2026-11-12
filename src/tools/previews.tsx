import type { ComponentType } from 'react';
import AudioAnalyzePreview from './audio-analyze/preview';
import ImageCompressPreview from './image-compress/preview';
import NcmPreview from './ncm-to-mp3/preview';

/** 首页卡片上的预览图。新工具可以在这里加一张；不加的话会显示名字的首字。 */
export const previews: Record<string, ComponentType> = {
  'ncm-to-mp3': NcmPreview,
  'image-compress': ImageCompressPreview,
  'audio-analyze': AudioAnalyzePreview,
};
