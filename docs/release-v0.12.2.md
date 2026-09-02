# DeskFish v0.12.2

## 中文

这一版修复包子漫画图片加载失败，并给章节列表增加可随时切换的排序方式。

- 修复包子图片 CDN TLS 中断产生的 `Received an unexpected EOF or 0 bytes from the transport stream`。
- 本地引擎会完整读取并校验图片；原节点失效时自动尝试 `static-tw`、`s1`、`s2` 备用节点。
- 章节解析只保留真正的目录区域，不再把“最新章节”预览混入开头。
- 新增“按章节号自动排序”开关，设置会自动保存。
- 关闭开关：严格显示来源原顺序。
- 开启开关：按明确的标题章节号、来源章节号或包子 `chapter_slot` 从小到大排列；活动、番外等标题不会被改写。
- 切换后会更新当前章节索引，上一话、下一话和预加载继续按照当前列表顺序运行。

解压 `DeskFish-v0.12.2-Windows-x64.zip`，退出旧版托盘程序后运行新的 `DeskFish.exe`，并在 Edge 扩展管理页重新加载压缩包内的 `edge-extension` 文件夹。

## English

This release repairs Baozi comic image loading and adds a persistent chapter-order switch.

- Fixes `Received an unexpected EOF or 0 bytes from the transport stream` from Baozi's failing image CDN.
- Fully buffers and validates each image, then falls back across the working `static-tw`, `s1`, and `s2` hosts.
- Reads only the actual chapter catalog instead of mixing the separate latest-chapter preview into the list.
- Adds a saved numeric-order switch: off preserves source order; on sorts by explicit title numbers, provider chapter numbers, or Baozi `chapter_slot` values.
- Keeps source titles unchanged and updates the active index so previous/next navigation and prefetch use the selected order.

Extract `DeskFish-v0.12.2-Windows-x64.zip`, exit the older tray process, run the new `DeskFish.exe`, and reload the bundled `edge-extension` folder from Edge's extension page.
