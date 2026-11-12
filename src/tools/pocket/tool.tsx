'use client';

import { useEffect, useState } from 'react';
import MetronomePanel from './metronome';
import QrPanel from './qr';
import TunerPanel from './tuner';

const TABS = [
  { id: 'metronome', label: '节拍器', Panel: MetronomePanel },
  { id: 'tuner', label: '调音器', Panel: TunerPanel },
  { id: 'qr', label: '二维码', Panel: QrPanel },
] as const;
type TabId = (typeof TABS)[number]['id'];

const NOTES: Record<TabId, React.ReactNode> = {
  metronome: (
    <>
      <dl className="notes">
        <div><dt>快捷键</dt><dd>空格开始或停止，T 敲击测速，← → 调速度（按住 Shift 一次 5）。</dd></div>
        <div><dt>敲击测速</dt><dd>跟着歌连续点四五下，按平均间隔算出 BPM。停两秒再点会重新算。</dd></div>
        <div><dt>iPhone</dt><dd>静音键打开时也会响（iOS 17 以上）。锁屏后会停。</dd></div>
      </dl>
      <p className="fine">调度方式移植自 <a href="https://github.com/cwilso/metronome" target="_blank" rel="noopener noreferrer">cwilso/metronome</a>（MIT），用声卡的时钟提前排好每一拍，不会越走越偏。</p>
    </>
  ),
  tuner: (
    <>
      <dl className="notes">
        <div><dt>隐私</dt><dd>麦克风的声音只在浏览器里分析，不录音、不上传。点停止就关掉麦克风。</dd></div>
        <div><dt>怎么看</dt><dd>大字是最接近的音，指针往右是偏高、往左是偏低，中间变绿就是准了。下面的曲线是最近 6 秒唱的音高。</dd></div>
        <div><dt>环境</dt><dd>安静一点更准。戴耳机放伴奏、只让麦克风听到人声，效果最好。</dd></div>
      </dl>
      <p className="fine">音高检测使用 <a href="https://github.com/ianprime0509/pitchy" target="_blank" rel="noopener noreferrer">pitchy</a>（MIT，McLeod Pitch Method）。</p>
    </>
  ),
  qr: (
    <>
      <dl className="notes">
        <div><dt>隐私</dt><dd>生成和识别都在浏览器里完成，内容和图片不会上传。</dd></div>
        <div><dt>中间放图</dt><dd>放了图会自动提高容错，挡住一部分也能扫出来。图别太复杂，扫之前自己用手机试一下。</dd></div>
        <div><dt>识别</dt><dd>一张图里有几个码会都列出来，条形码也能读。</dd></div>
      </dl>
      <p className="fine">
        生成使用 <a href="https://github.com/kozakdenys/qr-code-styling" target="_blank" rel="noopener noreferrer">qr-code-styling</a>（MIT），
        识别使用 <a href="https://github.com/Sec-ant/zxing-wasm" target="_blank" rel="noopener noreferrer">zxing-wasm</a>（MIT，ZXing-C++ 的 WebAssembly 版）。
      </p>
    </>
  ),
};

const fromHash = (): TabId => {
  const hash = typeof location === 'undefined' ? '' : location.hash.slice(1);
  return TABS.some(tab => tab.id === hash) ? hash as TabId : 'metronome';
};

export default function PocketTools() {
  const [tab, setTab] = useState<TabId>('metronome');

  // 地址栏带 #tuner 之类的可以直接打开对应的那个。
  useEffect(() => {
    setTab(fromHash());
    const onHash = () => setTab(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function choose(id: TabId) {
    setTab(id);
    history.replaceState(null, '', id === 'metronome' ? location.pathname : '#' + id);
  }

  const { Panel } = TABS.find(item => item.id === tab)!;
  return (
    <div className="tool pocket">
      <div className="panel">
        <nav className="pocket-tabs" role="tablist" aria-label="小工具">
          {TABS.map(item => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => choose(item.id)}>{item.label}</button>
          ))}
        </nav>
        <div role="tabpanel"><Panel key={tab} /></div>
      </div>
      {NOTES[tab]}
    </div>
  );
}
