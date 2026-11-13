'use client';

import TabbedTool, { type Tab } from '@/components/tabbed-tool';
import ColorPanel from './color';
import HashPanel from './hash';
import QrPanel from './qr';
import RandomPanel from './random';
import TimePanel from './time';

const link = (name: string, url: string) => <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>;

const TABS: Tab[] = [
  {
    id: 'qr', label: '二维码', Panel: QrPanel,
    notes: (
      <>
        <dl className="notes">
          <div><dt>隐私</dt><dd>生成和识别都在浏览器里完成，内容和图片不会上传。</dd></div>
          <div><dt>中间放图</dt><dd>放了图会自动提高容错，挡住一部分也能扫出来。图别太复杂，用之前自己拿手机扫一下。</dd></div>
          <div><dt>识别</dt><dd>截图、照片都可以，也能直接粘贴。一张图里有几个码会都列出来，条形码也能读。</dd></div>
        </dl>
        <p className="fine">生成使用 {link('qr-code-styling', 'https://github.com/kozakdenys/qr-code-styling')}（MIT），识别使用 {link('zxing-wasm', 'https://github.com/Sec-ant/zxing-wasm')}（MIT，ZXing-C++ 的 WebAssembly 版）。</p>
      </>
    ),
  },
  {
    id: 'random', label: '随机生成', Panel: RandomPanel,
    notes: (
      <>
        <dl className="notes">
          <div><dt>隐私</dt><dd>在浏览器里用系统的安全随机数生成，不联网，不会被记录。</dd></div>
          <div><dt>密码</dt><dd>越长越安全，16 位以上、几种字符混着用就很难猜了。</dd></div>
          <div><dt>UUID 和短 ID</dt><dd>都是「几乎不会重复」的编号。UUID 是通用格式，短 ID 更短，可以直接放进网址。</dd></div>
        </dl>
        <p className="fine">密码和短 ID 使用 {link('Nano ID', 'https://github.com/ai/nanoid')}（MIT）。</p>
      </>
    ),
  },
  {
    id: 'hash', label: '哈希', Panel: HashPanel,
    notes: (
      <>
        <dl className="notes">
          <div><dt>隐私</dt><dd>文字和文件都只在浏览器里计算，不会上传。</dd></div>
          <div><dt>用在哪</dt><dd>下载软件或大文件时，网站会给一串校验值。把文件拖进来算一遍，一样就说明文件完整、没被改过。</dd></div>
          <div><dt>大文件</dt><dd>分块读取，几个 GB 的文件也可以，只是要等一会儿。</dd></div>
        </dl>
        <p className="fine">计算使用 {link('hash-wasm', 'https://github.com/Daninet/hash-wasm')}（MIT）。</p>
      </>
    ),
  },
  {
    id: 'color', label: '颜色', Panel: ColorPanel,
    notes: (
      <>
        <dl className="notes">
          <div><dt>怎么输入</dt><dd>#5fb37c、rgb(95 179 124)、hsl(141 36% 54%) 或者英文颜色名都认，也可以点色块取色。</dd></div>
          <div><dt>深浅</dt><dd>下面一排是同一个颜色从浅到深，点一下就换过去。</dd></div>
          <div><dt>配字</dt><dd>对比度 4.5 以上，正文字才看得清；3 以上只适合大字。</dd></div>
        </dl>
        <p className="fine">换算使用 {link('color', 'https://github.com/Qix-/color')}（MIT）。</p>
      </>
    ),
  },
  {
    id: 'time', label: '时间戳', Panel: TimePanel,
    notes: (
      <>
        <dl className="notes">
          <div><dt>是什么</dt><dd>时间戳是从 1970 年 1 月 1 日（UTC）到某一刻过了多少秒，程序和接口里常用它记时间。</dd></div>
          <div><dt>秒还是毫秒</dt><dd>10 位左右按秒算，13 位左右按毫秒算，自动判断。</dd></div>
          <div><dt>时区</dt><dd>同一个时间戳在不同时区是不同的钟点，这里会同时列出本地和几个常用时区。</dd></div>
        </dl>
        <p className="fine">时间换算使用 {link('Day.js', 'https://github.com/iamkun/dayjs')}（MIT）。</p>
      </>
    ),
  },
];

export default function Generators() {
  return <TabbedTool tabs={TABS} label="生成与转换" />;
}
