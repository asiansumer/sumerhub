import type { ComponentType } from 'react';
import AudioAnalyzePreview from './audio-analyze/preview';
import AudioConvertPreview from './audio-convert/preview';
import ImageCompressPreview from './image-compress/preview';
import NcmPreview from './ncm-to-mp3/preview';
import MetronomeTunerPreview from './metronome-tuner/preview';
import PdfPagesPreview from './pdf-pages/preview';
import VocalSplitPreview from './vocal-split/preview';
import RemoveBgPreview from './remove-bg/preview';

/** 首页卡片上的预览图。新工具可以在这里加一张；不加的话会显示名字的首字。 */
export const previews: Record<string, ComponentType> = {
  'ncm-to-mp3': NcmPreview,
  'image-compress': ImageCompressPreview,
  'remove-bg': RemoveBgPreview,
  'audio-analyze': AudioAnalyzePreview,
  'audio-convert': AudioConvertPreview,
  'vocal-split': VocalSplitPreview,
  'pdf-pages': PdfPagesPreview,
  'metronome-tuner': MetronomeTunerPreview,
};
