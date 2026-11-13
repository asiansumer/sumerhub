'use client';

import TabbedTool, { type Tab } from '@/components/tabbed-tool';
import MetronomePanel from './metronome';
import TunerPanel from './tuner';

const TABS: Tab[] = [
  {
    id: 'metronome', label: '节拍器', Panel: MetronomePanel,
    notes: (
    <>
      <dl className="notes">
        <div><dt>快捷键</dt><dd>空格开始或停止，T 敲击测速，← → 调速度（按住 Shift 一次 5）。</dd></div>
        <div><dt>敲击测速</dt><dd>跟着歌连续点四五下，按平均间隔算出 BPM。停两秒再点会重新算。</dd></div>
        <div><dt>iPhone</dt><dd>静音键打开时也会响（iOS 17 以上）。锁屏后会停。</dd></div>
      </dl>
      <p className="fine">调度方式移植自 <a href="https://github.com/cwilso/metronome" target="_blank" rel="noopener noreferrer">cwilso/metronome</a>（MIT），用声卡的时钟提前排好每一拍，不会越走越偏。</p>
    </>
    ),
  },
  {
    id: 'tuner', label: '调音器', Panel: TunerPanel,
    notes: (
    <>
      <dl className="notes">
        <div><dt>隐私</dt><dd>麦克风的声音只在浏览器里分析，不录音、不上传。点停止就关掉麦克风。</dd></div>
        <div><dt>怎么看</dt><dd>大字是最接近的音，指针往右是偏高、往左是偏低，中间变绿就是准了。下面的曲线是最近 6 秒唱的音高。</dd></div>
        <div><dt>环境</dt><dd>安静一点更准。戴耳机放伴奏、只让麦克风听到人声，效果最好。</dd></div>
      </dl>
      <p className="fine">音高检测使用 <a href="https://github.com/ianprime0509/pitchy" target="_blank" rel="noopener noreferrer">pitchy</a>（MIT，McLeod Pitch Method）。</p>
    </>
    ),
  },
];

export default function MetronomeTuner() {
  return <TabbedTool tabs={TABS} label="节拍器和调音器" />;
}
