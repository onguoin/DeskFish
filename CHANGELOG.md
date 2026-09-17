# Changelog / 更新记录

## 0.13.0 — 2026-09-17

### 中文

- 新增桌面游戏窗口贴片：可在 `DeskFish.exe` 中把窗口拖入投放框自动识别，或从顶层窗口列表选择。
- Edge 扩展新增“桌面游戏窗口”来源，将真实可操作的窗口无边框贴到选中的网页图片/视频区域；支持滚动、缩放、高 DPI 与多显示器坐标更新。
- 悬停模式由本机光标检测负责隐藏，不会因为原生窗口遮住网页而误触移开；显示时不主动抢焦点，点击画面后才操作游戏。
- 恢复页面、切换来源、关闭页面或退出程序时会释放贴片并恢复窗口原有样式、位置与可见状态；新增 `Alt+Shift+G` 紧急隐藏快捷键。
- 版本号升级为 0.13.0，并加入本地窗口 API、回归测试与中英文使用说明。

### English

- Added desktop game window overlays with drag-to-identify and top-level window list selection in `DeskFish.exe`.
- Added a **Desktop game window** source that positions the real interactive borderless window over a selected page image or video, with scroll, resize, high-DPI, and multi-monitor coordinate updates.
- Native cursor tracking handles hover hiding even while the game covers the DOM target. Showing the overlay does not steal focus; clicking the game activates it normally.
- Restoring the page, changing sources, closing the page, or exiting DeskFish releases the overlay and restores the original window style, position, and visibility. `Alt+Shift+G` provides an emergency hide.
- Bumped the release to 0.13.0 with local window APIs, regression coverage, and bilingual documentation.

## 0.12.4 — 2026-09-16

### 中文

- 修复 Bilibili 视频首次悬停正常、移开后再次悬停却重新出现入口提示和中央加载图标的问题。
- 净化样式改为持续守护：恢复播放、播放器 DOM 更新或站点重建样式后都会重新注入，并对已出现的浮层做内联兜底隐藏。

### English

- Fixed Bilibili entry and center-loading overlays returning after leaving and hovering the replaced area a second time.
- Player cleanup is now self-healing after playback resumes, DOM updates, or site-side style replacement, with direct inline hiding as a fallback.

## 0.12.3 — 2026-09-16

### 中文

- 隐藏 Bilibili 外链播放器的“进入哔哩哔哩，观看更高清”入口层，兼容该入口使用普通 `div` 而非按钮标签的情况。
- 隐藏 Bilibili 播放器持续遮挡画面的中央加载/暂停状态图标，同时保留原有播放、暂停、进度续播和直播保活逻辑。

### English

- Hides the “Open Bilibili for higher quality” overlay even when Bilibili renders it as a plain `div` instead of a button.
- Removes persistent center loading/pause chrome without changing playback, resume position, hover pausing, or live-stream keep-alive behavior.

## 0.12.2 — 2026-09-02

### 中文

- 修复包子漫画图片节点 TLS 中断造成的 `unexpected EOF`：本地引擎会先完整校验图片，再自动回退到三个可用的官方 CDN 域名。
- 包子章节解析只读取真正的章节目录，不再把页面顶部“最新章节”预览混入列表开头。
- 新增持久化“按章节号自动排序”开关；关闭时严格恢复来源顺序，开启时按明确的“第 N 话/章/回/卷”、来源数值或包子 `chapter_slot` 升序。
- 切换排序后会同步当前章节索引，上一话、下一话和后台预加载继续沿新顺序工作；章节标题保持来源原文不变。

### English

- Fixed Baozi image `unexpected EOF` failures by fully validating each response and falling back across three working official CDN hostnames.
- Scoped Baozi parsing to the actual chapter catalog so the page's separate “latest chapter” preview no longer pollutes the beginning of the list.
- Added a persistent automatic chapter-order switch. Disabled preserves source order; enabled uses explicit numbered titles, provider numbers, or Baozi `chapter_slot` values.
- Reindexes the selected chapter after an order change so previous/next navigation and next-chapter prefetch follow the chosen order without rewriting source titles.

## 0.12.1 — 2026-09-02

### 中文

- 新增 Bilibili 直播间来源，可填写房间号或直播链接，并使用官方活动播放器的净化参数隐藏入口、互动区和多余控制组件。
- 虎牙不再使用会触发“试看结束”的 `liveshare` 外链页；改由随包 `DeskFish.exe` 解析公开房间流、多 CDN 自动回退并通过短时本地 HLS 代理播放。
- 内置 hls.js 1.6.16，修复 Edge 原生 HLS 管线在虎牙时间戳切片上停止播放的问题；不需要额外安装播放器或运行时。
- 将“画面是否显示”与“是否继续播放”分离：普通视频移开鼠标后暂停，虎牙与 Bilibili 直播只隐藏画面并持续播放。
- 直播播放器加入缓冲恢复、过期会话重连和短时分片内存释放；虎牙本地流固定为适合小窗的 2000 kbps 档位并默认不含弹幕。

### English

- Added Bilibili Live rooms through Bilibili's official activity-player embed with entry points, interaction panels, and excess controls disabled.
- Replaced Huya's time-limited `liveshare` embed with a bundled local public-room resolver, multi-CDN fallback, and short-lived HLS proxy in `DeskFish.exe`.
- Bundled hls.js 1.6.16 to avoid Edge's native HLS timestamp failures without requiring another player or runtime.
- Split visual reveal from playback state: ordinary videos pause when hidden, while Huya and Bilibili live streams continue playing behind the restored cover.
- Added live-buffer recovery, expired-session reconnects, short-lived segment cleanup, a small-window-friendly 2000 kbps Huya profile, and danmaku-free local playback.

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
