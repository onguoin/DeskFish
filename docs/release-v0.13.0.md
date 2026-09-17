# DeskFish v0.13.0

## 这次更新了什么

### 新增

- 新增“桌面游戏窗口”来源：可以把 Terraria、Minecraft、GTA V 等窗口化或无边框游戏贴到网页图片、视频或 DeskFish 自建区域。
- `DeskFish.exe` 新增窗口列表与拖入投放框。拖动游戏窗口到投放框松开，即可自动识别窗口句柄、进程名称和窗口标题。
- 新增本机级紧急隐藏快捷键 `Alt+Shift+G`。
- 新增桌面窗口状态、窗口列表和贴片控制 API，仍然只监听 `127.0.0.1`。

### 改进与保护

- 游戏窗口保持真实可操作；显示时不会主动抢键盘焦点，点击画面后才进入游戏操作。
- 鼠标离开网页目标区域后由本机直接隐藏游戏窗口并恢复原图，不依赖被游戏窗口遮住的网页悬停事件。
- 支持高 DPI、多显示器、网页滚动、浏览器缩放和目标区域尺寸变化后的坐标同步。
- 恢复页面、切换来源、关闭标签页或退出 DeskFish 时，会恢复游戏原有边框、位置、尺寸、置顶状态和可见状态。
- 加入页面会话隔离：旧标签页迟到的定位或释放请求不会覆盖当前正在使用的贴片。
- 扩展与 EXE 界面继续使用白色、浅青色设计，并加入清晰的窗口识别状态。

## 使用方法

1. 把游戏切换为窗口化或无边框窗口模式。
2. 打开新版 `DeskFish.exe`，把游戏窗口拖到“窗口贴片”投放框内松开；也可以从列表选择。
3. 在 Edge 扩展中选择“桌面游戏窗口”，刷新识别状态。
4. 选择网页图片、视频，或者创建一个独立区域。
5. 鼠标进入区域显示游戏，点击后操作；移开后恢复网页原图。

## 已知限制

- 独占全屏游戏不能贴入网页，请使用窗口化或无边框窗口模式。
- 如果游戏以管理员身份运行，DeskFish 也需要使用相同权限。
- 带反作弊、受保护窗口或禁止修改窗口样式的游戏可能无法使用；不建议在联机反作弊游戏中启用。

## 安装与升级

解压 `DeskFish-v0.13.0-Windows-x64.zip`，退出旧版托盘程序后运行新的 `DeskFish.exe`，并在 Edge 扩展管理页重新加载压缩包内的 `edge-extension` 文件夹。

## 下载校验

`SHA-256: 66989014C9A59AA4411FDE63589566695B55993918B5C9E32B42EA916782335F`

---

## What changed

### Added

- Added a **Desktop game window** source for placing a real windowed or borderless game over a page image, video, or custom DeskFish region.
- Added drag-to-identify and top-level window selection in `DeskFish.exe`, including process and window-title detection.
- Added the native emergency-hide shortcut `Alt+Shift+G`.
- Added loopback-only status, window-list, and overlay-control APIs.

### Improved and protected

- The game stays interactive without stealing keyboard focus on reveal; click it to start controlling it.
- Native cursor tracking hides the game and restores the page image even while the native window covers the DOM target.
- Added high-DPI, multi-monitor, page-scroll, browser-zoom, and target-resize coordinate updates.
- Restoring the page, changing sources, closing the tab, or exiting DeskFish restores the original border, position, size, topmost state, and visibility.
- Session isolation prevents delayed requests from an older tab from moving or releasing the current overlay.
- Kept the white and pale-cyan interface while adding a clear window-identification state.

## How to use it

1. Switch the game to windowed or borderless-window mode.
2. Drag the game window onto the **Window overlay** target in `DeskFish.exe`, or select it from the list.
3. Choose **Desktop game window** in the Edge extension and refresh the detected-window status.
4. Pick a page image/video or create a custom region.
5. Hover to reveal, click to interact, and leave the area to restore the original page image.

## Known limitations

- Exclusive-fullscreen games are not supported.
- DeskFish needs matching elevation when the game runs as administrator.
- Anti-cheat-protected or style-locked windows may reject the operation; do not use this feature with competitive anti-cheat games.

## Install or upgrade

Extract `DeskFish-v0.13.0-Windows-x64.zip`, exit the older tray process, run the new `DeskFish.exe`, and reload the bundled `edge-extension` folder from Edge's extension page.

## Checksum

`SHA-256: 66989014C9A59AA4411FDE63589566695B55993918B5C9E32B42EA916782335F`
