# Changelog / 更新记录

## 0.12.0 — 2026-09-01

### 中文

- 新增无需运行本地 EXE 的 Project Gutenberg 官方 OPDS 直连小说源。
- 新增中文维基文库与英文 Wikisource 官方 MediaWiki API 直连源。
- 新增直接编入 `DeskFish.exe` 的起点中文网公开章节解析器；支持中文网文搜索、官方原序目录、公开章节正文缓存，并明确禁用订阅章节。
- 在线小说默认加入智能搜索，中文关键词优先检索起点与中文维基文库，不再默认落到英文公版书库。
- 在线小说统一使用“搜索 → 目录 → 本地分片 → 进度记忆”流程，并保留本地引擎来源作为稳定缓存选项。
- 本地 TXT 继续支持流式自动分章、章节跳转和旧版阅读进度兼容。

### English

- Added a direct Project Gutenberg official OPDS source that does not require the local executable.
- Added direct Chinese and English Wikisource sources through the official MediaWiki API.
- Added a Qidian public-chapter parser directly to `DeskFish.exe`, including Chinese web-fiction search, source-order catalogs, public chapter caching, and explicit subscription-chapter disabling.
- Added Smart Search so Chinese queries prefer Qidian and Chinese Wikisource instead of defaulting to an English public-domain catalog.
- Unified online novels around search, contents, local chunk import, and persistent reading progress while retaining the local engine as a cached option.
- Kept streaming TXT chapter detection, chapter jumps, and compatibility with existing reading progress.

## 0.11.0 — 2026-09-01

### 中文

- 正式更名为 DeskFish，并统一 Edge 扩展、Windows 程序、托盘图标和品牌 Logo。
- 重做扩展面板与 Windows 程序界面；Windows 程序改为白色与浅青色主题，并修复高 DPI 下标题重叠、裁字和版本号截断。
- 漫画阅读新增页码持久化、章节连续切换、当前页前后各 5 页预取和自动内存释放。
- Windows 本地引擎加入包子漫画、Komiic 中文漫画、YY漫画三个来源。
- 修复虎牙弹幕默认状态、Bilibili/虎牙悬停遮罩与进入直播间提示等干扰组件。
- 完善 TXT 大文件自动拆分、可调步进、百分比翻页、滚轮逐行阅读和进度保存。
- TXT 导入新增流式自动分章和章节跳转；本地阅读引擎新增 Project Gutenberg 官方 OPDS 公版书搜索、自动目录与整本本地缓存。
- 改进五子棋与小游戏在极小替换区域中的自适应布局。

### English

- Renamed the project to DeskFish and refreshed the Edge extension, Windows app, tray icon, and brand logo.
- Redesigned both interfaces; the Windows app now uses a white and pale-cyan theme and fixes high-DPI title overlap, clipping, and truncated version text.
- Added persistent comic progress, continuous chapter navigation, five-page look-ahead/look-behind prefetching, and automatic memory cleanup.
- Added Baozi, Komiic Chinese, and YY Manga to the bundled local engine.
- Fixed Huya danmaku defaults and removed intrusive Bilibili/Huya hover overlays and room-entry prompts.
- Improved large TXT splitting, adjustable and percentage-based stepping, line-by-line wheel reading, and progress memory.
- Added streaming TXT chapter detection and chapter jumps, plus Project Gutenberg official OPDS search, generated contents, and full-book local caching through the bundled reading engine.
- Improved Gomoku and mini-game scaling inside very small replacement areas.
