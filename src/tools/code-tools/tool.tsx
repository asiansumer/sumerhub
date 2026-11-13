'use client';

import TabbedTool, { type Tab } from '@/components/tabbed-tool';
import FormatPanel from './format';
import JsonPanel from './json';
import JwtPanel from './jwt';
import MarkdownPanel from './markdown';
import RegexPanel from './regex';

const link = (name: string, url: string) => <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>;
const PRIVATE = <div><dt>隐私</dt><dd>都在浏览器里处理，粘贴进来的内容不会上传。</dd></div>;

const TABS: Tab[] = [
  {
    id: 'json', label: 'JSON', Panel: JsonPanel,
    notes: (
      <>
        <dl className="notes">
          {PRIVATE}
          <div><dt>自动修复</dt><dd>少了引号、多了逗号、用了单引号、带注释这些常见毛病可以一键修好。</dd></div>
          <div><dt>压成一行</dt><dd>去掉所有空格和换行，适合贴进配置或者接口里。</dd></div>
        </dl>
        <p className="fine">修复使用 {link('jsonrepair', 'https://github.com/josdejong/jsonrepair')}（ISC），上色使用 {link('highlight.js', 'https://github.com/highlightjs/highlight.js')}（BSD-3-Clause）。</p>
      </>
    ),
  },
  {
    id: 'format', label: '代码格式化', Panel: FormatPanel,
    notes: (
      <>
        <dl className="notes">
          {PRIVATE}
          <div><dt>用在哪</dt><dd>从网页上复制下来挤成一行的代码，整理成一行一句、带缩进的样子，方便看。</dd></div>
          <div><dt>SQL</dt><dd>关键字会统一成大写。</dd></div>
        </dl>
        <p className="fine">HTML、CSS、JS 使用 {link('js-beautify', 'https://github.com/beautifier/js-beautify')}（MIT），SQL 使用 {link('sql-formatter', 'https://github.com/sql-formatter-org/sql-formatter')}（MIT）。</p>
      </>
    ),
  },
  {
    id: 'regex', label: '正则测试', Panel: RegexPanel,
    notes: (
      <>
        <dl className="notes">
          {PRIVATE}
          <div><dt>选项</dt><dd>g 找出全部，i 不分大小写，m 按行匹配，s 让点号匹配换行，u 支持中文和表情。鼠标停在上面有说明。</dd></div>
          <div><dt>替换</dt><dd>切到「替换」可以试替换后的结果，用 $1、$2 引用括号里的分组。</dd></div>
        </dl>
        <p className="fine">用的是浏览器自带的正则引擎（和 JavaScript 里一样）。灵感来自 {link('RegExr', 'https://github.com/gskinner/regexr')}。</p>
      </>
    ),
  },
  {
    id: 'markdown', label: 'Markdown', Panel: MarkdownPanel,
    notes: (
      <>
        <dl className="notes">
          {PRIVATE}
          <div><dt>自动保存</dt><dd>写的内容存在这台设备的浏览器里，下次打开还在。</dd></div>
          <div><dt>导出</dt><dd>可以复制成 HTML，或者下载成一个能直接打开的网页。支持表格、任务列表这些 GitHub 的写法。</dd></div>
        </dl>
        <p className="fine">解析使用 {link('marked', 'https://github.com/markedjs/marked')}（MIT），输出经过 {link('DOMPurify', 'https://github.com/cure53/DOMPurify')}（Apache-2.0）过滤。</p>
      </>
    ),
  },
  {
    id: 'jwt', label: 'JWT 解码', Panel: JwtPanel,
    notes: (
      <>
        <dl className="notes">
          {PRIVATE}
          <div><dt>是什么</dt><dd>JWT 是网站登录后发给你的一串令牌，里面写着你是谁、什么时候过期。这里把它翻译成能看懂的内容。</dd></div>
          <div><dt>注意</dt><dd>只是解码，不验证签名，所以不能用来判断令牌是真是假。</dd></div>
        </dl>
        <p className="fine">解码使用 {link('jwt-decode', 'https://github.com/auth0/jwt-decode')}（MIT）。</p>
      </>
    ),
  },
];

export default function CodeTools() {
  return <TabbedTool tabs={TABS} label="代码小工具" />;
}
