# Sumerhub

Sumer 的个人工具箱：常用的网页小工具放在一起，打开即用，文件都在浏览器本地处理。

## 现有工具

| 工具 | 路径 | 说明 |
| --- | --- | --- |
| NCM 转 MP3 | `/tools/ncm-to-mp3` | 来自 [NCM-Swift](https://github.com/asiansumer/NCM-Swift)，去掉了 3D 动画和 three.js，转换逻辑不变 |

## 开发

```sh
npm ci
npm run dev     # http://localhost:3000
npm test        # NCM 解码 / 标签 / 封面的回归测试（需要 ffmpeg、ffprobe）
npm run lint
npm run build
```

## 加一个新工具

1. **写工具**：新建 `src/tools/<slug>/tool.tsx`，默认导出一个 React 组件。工具自己的样式放在同目录，例如 `<slug>.css`，在组件里 import。可以直接用全局的 `.panel`、`.button`、`.link` 和颜色变量（`--fg`、`--muted`、`--faint`、`--line`、`--surface`、`--sunken`、`--raised`，见 `src/app/globals.css`）。
2. **登记**：在 `src/tools/registry.ts` 的 `tools` 数组里加一条（名字、一句话介绍、分类、出处、关键词）。首页卡片、搜索、工具页标题和 SEO 都会自动出现。
3. **挂载**：在 `src/tools/loaders.ts` 里加一行懒加载，key 和 slug 一致。
4. **预览图（可选）**：在 `src/tools/previews.tsx` 里给首页卡片加一张小图，不加会显示名字的首字。

工具页 `/tools/<slug>` 的外框（页头、标题、一句话简介）是共用的，工具只负责中间那块。每个工具的代码只在打开它时才下载，首页不会因为工具变多而变重。

## 目录

```
src/
  app/
    page.tsx               首页（工具列表）
    tools/[slug]/page.tsx  所有工具共用的页面外框
    globals.css            设计变量和公共样式
  components/              页头、首页列表等
  tools/
    registry.ts            工具清单
    loaders.ts             工具懒加载表
    ncm-to-mp3/            NCM 转 MP3（tool.tsx、lib/、worker/）
tests/                     NCM 回归测试和测试素材
public/licenses/           第三方许可证全文
```

## 第三方许可

NCM 转 MP3 使用 [`@breezystack/lamejs`](https://github.com/shijinyu/lamejs)（LGPL-3.0，基于 LAME）编码 MP3，使用 [`taglib-wasm`](https://github.com/CharlesWiltgen/TagLib-Wasm)（MIT，内含 LGPL-2.1-or-later 的 TagLib WebAssembly）读写标签。许可证全文在 `public/licenses/`。

## 设计原则

只有暗色：中性的近黑底（`#0f0f10`）、细线、没有强调色。标题、工具名和 Sumerhub 字样用衬线字体（Source Serif 4，中文是 Noto Serif SC），正文和按钮用系统无衬线字体。

首页只有 Sumerhub 字样和工具卡片。一个工具时是横向大卡片，两个时两列，三个以上三列；工具满 6 个后出现搜索框，并按分类分组。转换类工具的预览图可以直接用 `<ConvertPreview from=".heic" to=".jpg" />`。

新工具沿用 `globals.css` 里的变量和 `.panel`、`.button`、`.link`，不要自带颜色。来自别的开源项目的工具，在 `registry.ts` 里填 `source`，工具页底部会标注出处。
