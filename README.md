# Sumerhub

Sumer 的个人工具箱：常用的网页小工具放在一起，打开即用，文件都在浏览器本地处理。

## 现有工具

| 工具 | 路径 | 说明 |
| --- | --- | --- |
| NCM 转 MP3 | `/tools/ncm-to-mp3` | 来自 [NCM-Swift](https://github.com/asiansumer/NCM-Swift)，去掉了 3D 动画和 three.js，转换逻辑不变 |
| 图片压缩 | `/tools/image-compress` | 压缩 JPG、PNG、WebP、HEIC，可转格式、限制最长边。编码器来自 [Squoosh](https://github.com/GoogleChromeLabs/squoosh) |
| 音频分析 | `/tools/audio-analyze` | BPM、调性、Camelot 编号、响度（LUFS）、波形和试听。灵感来自 [Tunebat](https://tunebat.com/Analyzer) |

## 开发

```sh
npm ci
npm run dev     # http://localhost:3000
npm test        # 回归测试：NCM 解码 / 标签 / 封面（需要 ffmpeg、ffprobe），音频分析的 BPM / 调性 / 响度（需要 Node 22）
npm run lint
npm run build
```

## 加一个新工具

1. **写工具**：新建 `src/tools/<slug>/tool.tsx`，默认导出一个 React 组件。界面直接用公共的零件（见下面「公共零件」），一般不需要自己写样式。
2. **登记**：在 `src/tools/registry.ts` 的 `tools` 数组里加一条（名字、一句话介绍、分类、出处、关键词）。出处只是借鉴想法时加 `inspired: true`，页脚会写「灵感来自」而不是「源自」。首页卡片、搜索、工具页标题和 SEO 都会自动出现。
3. **挂载**：在 `src/tools/loaders.ts` 里加一行懒加载，key 和 slug 一致。
4. **预览图（可选）**：在 `src/tools/previews.tsx` 里给首页卡片加一张小图，不加会显示名字的首字。

工具页 `/tools/<slug>` 的外框（页头、标题、一句话简介）是共用的，工具只负责中间那块。每个工具的代码只在打开它时才下载，首页不会因为工具变多而变重。

## 公共零件

- `src/components/drop-area.tsx`：拖放区 `<DropArea>`，有结果后自动收成一条窄栏。
- `src/app/toolkit.css`：工具页通用的样式。`.tool`、`.panel` 是外框；`.controls`、`.field`、`.segmented`、`.select` 是设置栏；`.results-head`、`.rows`、`.row`、`.thumb`、`.row-text`、`.row-meta`、`.icon` 是结果列表；`.progress`、`.errors`、`.message` 是状态；`.notes`、`.fine` 是底部说明。
- `src/lib/format.ts`：`formatSize`（文件大小）、`uniqueFileName`（一批里不重名）。
- `src/lib/download.ts`：`downloadZip`（打包下载）。
- 颜色变量在 `src/app/globals.css`：`--fg`、`--muted`、`--faint`、`--line`、`--surface`、`--sunken`、`--raised`。

## 目录

```
src/
  app/
    page.tsx               首页（工具列表）
    tools/[slug]/page.tsx  所有工具共用的页面外框
    globals.css            设计变量、首页和页面外框的样式
    toolkit.css            工具页通用的样式
  components/              页头、首页列表、拖放区等
  lib/                     各工具共用的小函数
  tools/
    registry.ts            工具清单
    loaders.ts             工具懒加载表
    previews.tsx           首页卡片的预览图
    ncm-to-mp3/            NCM 转 MP3（tool.tsx、lib/、worker/）
    image-compress/        图片压缩（tool.tsx、compress.worker.ts）
    audio-analyze/         音频分析（tool.tsx、analyze.worker.ts、lib/ 里接入 BPM、调性、响度）
scripts/keynet/            生成调性模型文件的脚本
tests/                     回归测试和测试素材
public/models/keynet/      调性模型（ONNX）
public/licenses/           第三方许可证全文
```

## 第三方许可

NCM 转 MP3 使用 [`@breezystack/lamejs`](https://github.com/shijinyu/lamejs)（LGPL-3.0，基于 LAME）编码 MP3，使用 [`taglib-wasm`](https://github.com/CharlesWiltgen/TagLib-Wasm)（MIT，内含 LGPL-2.1-or-later 的 TagLib WebAssembly）读写标签。

图片压缩使用 [`@jsquash/jpeg`、`@jsquash/webp`](https://github.com/jamsinclair/jSquash)（Apache-2.0，Squoosh 的 MozJPEG 和 libwebp 编码器）、[`upng-js`](https://github.com/photopea/UPNG.js)（MIT，内含 pako）和 [`heic2any`](https://github.com/alexcorvi/heic2any)（MIT，内含 LGPL-3.0 的 libheif）。

音频分析的 BPM 使用 [`realtime-bpm-analyzer`](https://github.com/dlepaux/realtime-bpm-analyzer)（Apache-2.0）的 tempogram 检测器，响度和真峰值使用 [`ebur128-wasm`](https://github.com/streamonkey/ebur128_wasm)（Apache-2.0，Rust 的 ebur128 库编译成 WebAssembly），标签读取同样使用 `taglib-wasm`。调性使用 [MusicalKeyCNN](https://github.com/a1ex90/MusicalKeyCNN)（MIT）训练好的卷积网络，用 [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)（MIT）在浏览器里运行。模型文件 `public/models/keynet/keynet.onnx` 由 `scripts/keynet/export_onnx.py` 生成：把原仓库的权重和 [nnAudio](https://github.com/KinWaiCheuk/nnAudio)（MIT）的 CQT 频谱打包成一个 ONNX 文件，输入 44.1 kHz 单声道音频，输出 24 个调的概率。模型会把同一首歌移调 −2 到 +2 个半音各听一遍，再把五次结果移回原调取平均，这样拿不准的歌不会因为解码器不同而变来变去。在 380 首有标注的歌上（GiantSteps key + GTZAN key），调完全正确 67%，音阶正确（含关系大小调）72%，前三个候选里有正确音阶 91%（只听一遍是 66%、71%、90%）；同一批电子乐上本模型 70%，Mixed In Key 是 65%、rekordbox 是 62%。

许可证全文在 `public/licenses/`。

## 设计原则

只有暗色：中性的近黑底（`#0f0f10`）、细线、没有强调色。标题、工具名和 Sumerhub 字样用衬线字体（Source Serif 4，中文是 Noto Serif SC），正文和按钮用系统无衬线字体。

首页只有 Sumerhub 字样和工具卡片。一个工具时是横向大卡片，两个时两列，三个以上三列；工具满 6 个后出现搜索框，并按分类分组。转换类工具的预览图可以直接用 `<ConvertPreview from=".heic" to=".jpg" />`。

新工具沿用 `globals.css` 里的变量和 `.panel`、`.button`、`.link`，不要自带颜色。来自别的开源项目的工具，在 `registry.ts` 里填 `source`，工具页底部会标注出处。
