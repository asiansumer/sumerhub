# Sumerhub

Sumer 的个人工具箱：常用的网页小工具放在一起，打开即用，文件都在浏览器本地处理。

## 现有工具

| 工具 | 路径 | 说明 |
| --- | --- | --- |
| NCM 转 MP3 | `/tools/ncm-to-mp3` | 来自 [NCM-Swift](https://github.com/asiansumer/NCM-Swift)，去掉了 3D 动画和 three.js，转换逻辑不变 |
| 图片压缩 | `/tools/image-compress` | 压缩 JPG、PNG、WebP、HEIC，可转格式、限制最长边。编码器来自 [Squoosh](https://github.com/GoogleChromeLabs/squoosh) |
| 抠图 | `/tools/remove-bg` | 去掉照片背景，导出透明 PNG 或换成纯色背景。模型是 [BiRefNet](https://github.com/ZhengPeng7/BiRefNet) 的轻量版，另有一个抠镂空细节的备用模型 |
| 音频分析 | `/tools/audio-analyze` | BPM、调性、Camelot 编号、响度（LUFS）、波形和试听。灵感来自 [Tunebat](https://tunebat.com/Analyzer) |
| 音频转换 | `/tools/audio-convert` | MP3、WAV、FLAC、M4A、OGG 互转，也能从 MP4、MOV 等视频里取出声音；已经是目标格式时原样取出不重新编码。核心来自 [Mediabunny](https://github.com/Vanilagy/mediabunny) |
| 人声伴奏分离 | `/tools/vocal-split` | 把一首歌分成人声、伴奏、鼓、贝斯、其他乐器，导出 WAV。模型是 Demucs v4，浏览器版本来自 [timcsy/demucs-web](https://github.com/timcsy/demucs-web)；优先用 WebGPU，没有就用单线程 wasm（很慢） |
| 节拍器和调音器 | `/tools/metronome-tuner` | 节拍器（调度移植自 [cwilso/metronome](https://github.com/cwilso/metronome)）和调音器（[pitchy](https://github.com/ianprime0509/pitchy)）放在一个工具里，用标签切换，`#tuner` 直接打开调音器 |
| 代码小工具 | `/tools/code-tools` | 五个标签：JSON 整理（含自动修复）、代码格式化（HTML、CSS、JS、SQL）、正则测试、Markdown 预览、JWT 解码。`#format`、`#regex`、`#markdown`、`#jwt` 直接打开对应标签 |
| 生成与转换 | `/tools/generators` | 五个标签：二维码生成和识别、随机密码 / UUID / 短 ID、哈希（MD5、SHA-1、SHA-256、SHA-512，文字或文件）、颜色换算、时间戳转换。`#random`、`#hash`、`#color`、`#time` 直接打开对应标签 |
| PDF 合并拆分 | `/tools/pdf-pages` | 合并多个 PDF 和图片，拖动排序、旋转、删除页面，导出成一个文件或每页一个文件。核心来自 [pdf-lib](https://github.com/Hopding/pdf-lib) |

## 开发

```sh
npm ci
npm run dev     # http://localhost:3000（第一次会先下载抠图模型，约 180 MB）
npm test        # 回归测试：NCM 解码 / 标签 / 封面（需要 ffmpeg、ffprobe），音频分析的 BPM / 调性 / 响度、音频转换（需要 Node 22）
npm run lint
npm run build
npm run assets  # 只取抠图要用的模型和 wasm（dev 和 build 会自动先跑这一步）
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
- `src/components/tabbed-tool.tsx`：几个小功能共用一个工具位时用的标签页 `<TabbedTool>`，每个标签可以带自己的底部说明。
- `src/components/copy-button.tsx`：复制按钮 `<CopyButton>`。
- `src/lib/stored.ts`：`useStored`，把设置记在浏览器里。
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
  app/api/netease/         跟唱录音的歌词接口（向网易云代取歌名和歌词）
  components/              页头、首页列表、拖放区等
  lib/                     各工具共用的小函数
  tools/
    registry.ts            工具清单
    loaders.ts             工具懒加载表
    previews.tsx           首页卡片的预览图
    ncm-to-mp3/            NCM 转 MP3（tool.tsx、lib/、worker/）
    image-compress/        图片压缩（tool.tsx、compress.worker.ts）
    remove-bg/             抠图（tool.tsx、remove.worker.ts、lib/engine.ts 调用 Transformers.js、lib/compose.ts 铺背景色）
    audio-analyze/         音频分析（tool.tsx、analyze.worker.ts、lib/ 里接入 BPM、调性、响度）
    audio-convert/         音频转换（tool.tsx、convert.worker.ts、lib/convert.ts 调用 Mediabunny）
    sing-along/            跟唱录音（tool.tsx 管链接、文件和分离；studio.tsx 是录音台，用 AMLL 和 waveform-playlist；lib/ 里是链接识别、歌词整理、读文件、伴奏缓存）
    vocal-split/           人声伴奏分离（tool.tsx、split.worker.ts 调用 demucs-web，lib/model.ts 下载并缓存模型，lib/wav.ts 写 WAV）
    metronome-tuner/       节拍器和调音器（tool.tsx 切换标签；metronome.tsx、tuner.tsx；lib/metronome.ts 是节拍调度）
    code-tools/            代码小工具（tool.tsx 列出标签；json.tsx、format.tsx、regex.tsx、markdown.tsx、jwt.tsx；highlight.tsx 给代码上色）
    generators/            生成与转换（tool.tsx 列出标签；qr.tsx、random.tsx、hash.tsx、color.tsx、time.tsx）
    pdf-pages/             PDF 合并拆分（tool.tsx、pdf.worker.ts、lib/pdf.ts 调用 pdf-lib、lib/render.ts 调用 PDF.js）
scripts/keynet/            生成调性模型文件的脚本
scripts/fetch-assets.mjs   构建前取来抠图的模型和 ONNX Runtime 的 wasm（放进 public/，不进 git）
tests/                     回归测试和测试素材
public/models/keynet/      调性模型（ONNX）
public/models/remove-bg*/  抠图模型（构建时下载，不在 git 里）
public/vendor/pdfjs/       PDF.js 画缩略图要用的字符映射表和标准字体
public/licenses/           第三方许可证全文
```

## 第三方许可

NCM 转 MP3 使用 [`@breezystack/lamejs`](https://github.com/shijinyu/lamejs)（LGPL-3.0，基于 LAME）编码 MP3，使用 [`taglib-wasm`](https://github.com/CharlesWiltgen/TagLib-Wasm)（MIT，内含 LGPL-2.1-or-later 的 TagLib WebAssembly）读写标签。

图片压缩使用 [`@jsquash/jpeg`、`@jsquash/webp`](https://github.com/jamsinclair/jSquash)（Apache-2.0，Squoosh 的 MozJPEG 和 libwebp 编码器）、[`upng-js`](https://github.com/photopea/UPNG.js)（MIT，内含 pako）和 [`heic2any`](https://github.com/alexcorvi/heic2any)（MIT，内含 LGPL-3.0 的 libheif）。

音频分析的 BPM 使用 [`realtime-bpm-analyzer`](https://github.com/dlepaux/realtime-bpm-analyzer)（Apache-2.0）的 tempogram 检测器，响度和真峰值使用 [`ebur128-wasm`](https://github.com/streamonkey/ebur128_wasm)（Apache-2.0，Rust 的 ebur128 库编译成 WebAssembly），标签读取同样使用 `taglib-wasm`。调性使用 [MusicalKeyCNN](https://github.com/a1ex90/MusicalKeyCNN)（MIT）训练好的卷积网络，用 [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)（MIT）在浏览器里运行。模型文件 `public/models/keynet/keynet.onnx` 由 `scripts/keynet/export_onnx.py` 生成：把原仓库的权重和 [nnAudio](https://github.com/KinWaiCheuk/nnAudio)（MIT）的 CQT 频谱打包成一个 ONNX 文件，输入 44.1 kHz 单声道音频，输出 24 个调的概率。模型会把同一首歌移调 −2 到 +2 个半音各听一遍，再把五次结果移回原调取平均，这样拿不准的歌不会因为解码器不同而变来变去。在 380 首有标注的歌上（GiantSteps key + GTZAN key），调完全正确 67%，音阶正确（含关系大小调）72%，前三个候选里有正确音阶 91%（只听一遍是 66%、71%、90%）；同一批电子乐上本模型 70%，Mixed In Key 是 65%、rekordbox 是 62%。

音频转换使用 [`mediabunny`](https://github.com/Vanilagy/mediabunny)（MPL-2.0）读文件、解码和封装，浏览器自己不会编码的格式用它官方的扩展：[`@mediabunny/mp3-encoder`](https://www.npmjs.com/package/@mediabunny/mp3-encoder)（MPL-2.0，内含 LGPL 的 LAME）、[`@mediabunny/aac-encoder`](https://www.npmjs.com/package/@mediabunny/aac-encoder)（MPL-2.0，内含 LGPL-2.1 的 FFmpeg AAC 编码器）、[`@mediabunny/flac-encoder`](https://www.npmjs.com/package/@mediabunny/flac-encoder)（MPL-2.0，内含 BSD-3-Clause 的 libFLAC）。这些库都没有改动，以独立的 npm 包和 wasm 文件使用。没有用 ffmpeg.wasm，因为它的核心 `@ffmpeg/core` 是 GPL-2.0-or-later。

抠图使用 [`@huggingface/transformers`](https://github.com/huggingface/transformers.js)（Apache-2.0，Transformers.js）的 background-removal 流程，底下是 ONNX Runtime Web（MIT）；有显卡时用 WebGPU，没有就用 WebAssembly。「通用」模型是 [BiRefNet](https://github.com/ZhengPeng7/BiRefNet)（MIT）的轻量版，用的是 Studio Ludens 导出的 512×512 版本 [`studioludens/birefnet-lite-512`](https://huggingface.co/studioludens/birefnet-lite-512)（MIT，1024 版在浏览器里内存不够）。「镂空细节」模型是 [IS-Net](https://github.com/xuebinqin/DIS)（Apache-2.0）的 general-use 权重，取自 [`imgly/isnet-general-onnx`](https://huggingface.co/imgly/isnet-general-onnx)（MIT）。两个模型和 ONNX Runtime 的 wasm 都由 `scripts/fetch-assets.mjs` 在构建时按固定版本取来并核对 sha256，放在自己的站点上，运行时不请求别的网站。

选模型时在 160 张带标准答案的图片上比过（动物和物品、人像、日常场景、镂空结构各 40 张，数字是主体重合度 IoU，括号里是明显抠错的张数）：

| 模型 | 许可 | 动物和物品 | 人像 | 日常场景 | 镂空结构 |
| --- | --- | --- | --- | --- | --- |
| BiRefNet_lite 512（通用） | MIT | 97.9%（0） | 98.9%（0） | 89.7%（3） | 70.1%（18） |
| IS-Net general-use（镂空细节，也是 @imgly/background-removal 用的模型） | MIT / Apache-2.0 | 93.0%（4） | 94.3%（4） | 81.6%（12） | 92.7%（2） |
| ormbg | Apache-2.0 | 98.8%（0） | 99.0%（0） | 71.5%（18） | 52.8%（34） |
| RMBG-1.4 | 仅限非商业 | 98.6%（0） | 96.8%（1） | 70.8%（19） | 94.2%（2） |
| MODNet | Apache-2.0 | 87.9%（7） | 98.2%（0） | 没测 | 17.0%（39） |

BiRefNet_lite 的 1024 版和 BEN2 效果应该更好，但在浏览器里放不下（1024 版在 Node 里跑一张要 7.5 GB 内存）。

PDF 合并拆分使用 [`pdf-lib`](https://github.com/Hopding/pdf-lib)（MIT）合并、拆分、旋转页面和把图片放进 PDF，使用 [`pdfjs-dist`](https://github.com/mozilla/pdf.js)（Apache-2.0，PDF.js）读页数和画缩略图，使用 [`@dnd-kit`](https://github.com/clauderic/dnd-kit)（MIT）做拖动排序。`public/vendor/pdfjs/` 里的字符映射表和标准字体来自 `pdfjs-dist`，各自的许可证在同一个目录里。

许可证全文在 `public/licenses/`。

## 设计原则

只有暗色：中性的近黑底（`#0f0f10`）、细线、没有强调色。标题、工具名和 Sumerhub 字样用衬线字体（Source Serif 4，中文是 Noto Serif SC），正文和按钮用系统无衬线字体。

首页只有 Sumerhub 字样和工具卡片。一个工具时是横向大卡片，两个时两列，三个以上三列；工具满 6 个后出现搜索框，并按分类分组。转换类工具的预览图可以直接用 `<ConvertPreview from=".heic" to=".jpg" />`。

新工具沿用 `globals.css` 里的变量和 `.panel`、`.button`、`.link`，不要自带颜色。来自别的开源项目的工具，在 `registry.ts` 里填 `source`，工具页底部会标注出处。

节拍器的调度方式移植自 [cwilso/metronome](https://github.com/cwilso/metronome)（MIT），调音器使用 [`pitchy`](https://github.com/ianprime0509/pitchy)（MIT）。

人声伴奏分离使用 [`demucs-web`](https://github.com/timcsy/demucs-web)（MIT）：Meta 的 [Demucs v4](https://github.com/facebookresearch/demucs)（MIT）导出成 ONNX，STFT 和 iSTFT 在 JS 里做，用 ONNX Runtime Web 的 WebGPU 版运行。模型（180 MB）不在仓库和构建产物里，用的时候从 Hugging Face 的 `timcsy/demucs-web-onnx` 按固定版本下载，存进浏览器的 Cache Storage。在 MUSDB18 测试集的 50 段片段上，这个浏览器版本的中位数 SDR 是人声 8.7 dB、伴奏 13.6 dB，原版 Python Demucs 在同样的片段上是 8.9 和 13.4。

跟唱录音：滚动歌词使用 [AMLL](https://github.com/amll-dev/applemusic-like-lyrics)（`@applemusic-like-lyrics/core`、`react`、`lyric`，**AGPL-3.0-only**）显示和解析歌词，它依赖 [PixiJS](https://github.com/pixijs/pixijs)（MIT）。录音、多轨波形、延迟补偿和导出 WAV 使用 [waveform-playlist](https://github.com/naomiaro/waveform-playlist)（MIT），它底下是 [Tone.js](https://github.com/Tonejs/Tone.js)（MIT）、[styled-components](https://github.com/styled-components/styled-components)（MIT）和 `@dnd-kit`（MIT）；录音流程照它的录音示例写。伴奏分离和「人声伴奏分离」是同一套（demucs-web），分离结果用 [`idb-keyval`](https://github.com/jakearchibald/idb-keyval)（Apache-2.0）存在浏览器里。歌名和歌词由 `src/app/api/netease/route.ts` 向网易云音乐的公开接口代取（浏览器不能直接跨域请求），不取音频，不带账号信息。

因为用了 AGPL-3.0 的 AMLL，整个站点的源代码要向使用者公开：仓库需要是公开的，本项目自己的代码也按 AGPL-3.0 发布（见根目录的 `LICENSE`）。不想公开的话，把 `src/tools/sing-along/studio.tsx` 里的歌词组件换成 MIT 的 [`react-lrc`](https://github.com/mebtte/react-lrc)（只有逐行高亮，没有逐字）。

代码小工具使用 [`jsonrepair`](https://github.com/josdejong/jsonrepair)（ISC）、[`js-beautify`](https://github.com/beautifier/js-beautify)（MIT）、[`sql-formatter`](https://github.com/sql-formatter-org/sql-formatter)（MIT）、[`marked`](https://github.com/markedjs/marked)（MIT）、[`DOMPurify`](https://github.com/cure53/DOMPurify)（Apache-2.0 或 MPL-2.0）、[`jwt-decode`](https://github.com/auth0/jwt-decode)（MIT）和 [`highlight.js`](https://github.com/highlightjs/highlight.js)（BSD-3-Clause）。

生成与转换使用 [`qr-code-styling`](https://github.com/kozakdenys/qr-code-styling)（MIT）、[`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm)（MIT，内含 Apache-2.0 的 ZXing-C++；wasm 在构建时从 node_modules 复制到 `public/vendor/zxing/`）、[`nanoid`](https://github.com/ai/nanoid)（MIT）、[`hash-wasm`](https://github.com/Daninet/hash-wasm)（MIT）、[`color`](https://github.com/Qix-/color)（MIT）和 [`dayjs`](https://github.com/iamkun/dayjs)（MIT）。
