import { PiWaveform, PiImageSquare, PiTextAa, PiCodeSimple, PiSparkle } from 'react-icons/pi';
import type { IconName } from '@/tools/registry';

const icons = { waveform: PiWaveform, image: PiImageSquare, text: PiTextAa, code: PiCodeSimple, sparkle: PiSparkle };

export default function ToolIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  const Icon = icons[name];
  return <Icon size={size} aria-hidden="true" />;
}
