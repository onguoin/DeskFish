## 中文

DeskFish v0.12.0 加强了漫画连续阅读，并正式加入网络小说、在线公版书和本地 TXT 自动分章流程。

- 新增 Project Gutenberg 官方 OPDS、中文维基文库与英文 Wikisource 直连来源
- 新增编入 `DeskFish.exe` 的起点公开章节解析器；保留官方目录顺序，不绕过订阅章节
- 中文关键词默认智能合并起点公开搜索与中文维基文库结果
- 本地 TXT 流式自动分章、章节跳转、分片保存与旧阅读进度兼容
- 漫画章节标题与接口原始顺序保持一致，列表增加浅青色自有序号
- 下一章节后台预加载、命中复用、过期请求取消与 Blob 缓存释放
- README 新增功能演示 GIF；本 Release 同时提供高清 MP4 演示

解压 `DeskFish-v0.12.0-Windows-x64.zip`，先运行 `DeskFish.exe`，再在 Edge 开发人员模式中加载 `edge-extension` 文件夹。程序为 Windows x64 自包含版本，不需要另装 .NET、Python、Node.js 或 Java。

## English

DeskFish v0.12.0 improves continuous comic reading and adds a complete workflow for online novels, public-domain books, and automatic local TXT chapter detection.

- Added direct Project Gutenberg OPDS, Chinese Wikisource, and English Wikisource sources
- Added a Qidian public-chapter parser bundled into `DeskFish.exe`; it preserves official catalog order and never bypasses subscription chapters
- Smart Search now combines Qidian public results with Chinese Wikisource for Chinese queries
- Added streaming TXT chapter detection, chapter jumps, chunked storage, and compatibility with existing reading progress
- Preserved source chapter titles/order and added pale-cyan display ordinals to comic chapter rows
- Added next-chapter background prefetch, cache reuse, stale-request cancellation, and Blob cleanup
- Added an animated README demo and a high-quality MP4 demo to this Release

Extract `DeskFish-v0.12.0-Windows-x64.zip`, run `DeskFish.exe`, then load the `edge-extension` folder from Edge Developer mode. The Windows x64 package is self-contained and requires no separate .NET, Python, Node.js, or Java installation.

## SHA-256

`DeskFish-v0.12.0-Windows-x64.zip`

`6C78698AA9F27DF42EF6CD860C57D6DB0C745078406511DAA0EBCC9395E90AA0`

`DeskFish-v0.12.0-demo.mp4`

`DEE47FC1D97C60CC93268325811282BEE936D02EEC6330B35FE8AAD857495B7C`
