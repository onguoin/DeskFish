# DeskFish v0.12.1

## 中文

这一版修复了虎牙站外播放器几秒后出现“试看结束”的问题，并加入 Bilibili 直播间。

- 虎牙改用 DeskFish.exe 内置的公开房间解析器、本地 HLS 代理与多 CDN 自动回退。
- 内置 hls.js，避开 Edge 原生 HLS 在虎牙时间戳切片上的停止播放问题。
- 新增 Bilibili 官方活动直播播放器，默认关闭入口、互动区、推荐、弹幕和多余控制组件。
- 普通视频在鼠标移开后暂停；虎牙与 Bilibili 直播只隐藏画面，继续保持播放。
- 虎牙直播使用适合小窗的 2000 kbps 档位，不加载平台弹幕或“进入直播间”组件。

解压 `DeskFish-v0.12.1-Windows-x64.zip`，先运行 `DeskFish.exe`，再在 Edge 开发人员模式中加载 `edge-extension` 文件夹。虎牙直播需要让 DeskFish 保持在托盘运行；无需另装 Python、Node.js、Java、播放器或浏览器插件。

## English

This release replaces Huya's external player—which ends after a brief preview—and adds Bilibili Live rooms.

- Huya now uses the bundled public-room resolver, loopback HLS proxy, and automatic multi-CDN fallback in DeskFish.exe.
- hls.js is bundled to avoid Edge's native HLS timestamp failure on Huya streams.
- Bilibili Live uses the official activity player with entry, interaction, recommendation, danmaku, and excess controls disabled.
- Ordinary videos pause when the pointer leaves; Huya and Bilibili live streams only hide and remain connected.
- Huya uses a small-window-friendly 2000 kbps profile without platform danmaku or room-entry overlays.

Extract `DeskFish-v0.12.1-Windows-x64.zip`, run `DeskFish.exe`, then load the `edge-extension` folder in Edge Developer mode. Keep DeskFish in the tray for Huya Live. No separate Python, Node.js, Java, media player, or browser plugin is required.
