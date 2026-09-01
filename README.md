<p align="center">
  <img src="docs/deskfish-logo.png" width="132" alt="DeskFish Logo">
</p>

<h1 align="center">DeskFish</h1>

<p align="center">把网页变成不显眼的播放器、漫画架、电子书和小游戏角落。</p>

<p align="center">
  <strong>简体中文</strong> · <a href="README_EN.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/onguoin/DeskFish/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/onguoin/DeskFish?display_name=tag&label=Latest%20Release&color=3ab7a7"></a>
  <a href="https://github.com/onguoin/DeskFish/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/onguoin/DeskFish/total?label=Downloads&color=3ab7a7"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078D4?logo=windows11&logoColor=white">
  <img alt="Microsoft Edge" src="https://img.shields.io/badge/Microsoft%20Edge-Extension-0A9EDC?logo=microsoftedge&logoColor=white">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-ff7e60"></a>
</p>

DeskFish 是一条藏在浏览器边上的小鱼，也是给上班摸鱼、午休和办公室无聊时刻准备的 Edge 工具。它不假装提高生产力：你可以把网页里原有的图片或视频区域换成 Bilibili、虎牙直播、小游戏、漫画，也可以把一段普通文字换成 TXT 电子书。

想要更自由一点时，还能直接在网页空白处创建一块内容区域，或者打开一个跨网页保留的浏览器级“老式传奇广告窗”。鼠标移开后，替换内容可以马上恢复成原网页；视频会暂停而不是被销毁，再次悬停即可接着播放。

> 请在不影响工作、遵守所在组织制度以及内容来源条款的前提下使用。DeskFish 不内置或转售影视、直播、漫画内容。

## 功能

- **网页媒体替换**：选择图片或视频区域，替换为 Bilibili 视频、虎牙直播、自定义图片、漫画或小游戏。
- **悬停伪装**：默认仅在鼠标悬停时显示替换内容；移开立即恢复原样，视频自动暂停并保留进度。
- **独立内容区域**：网页没有合适素材时，可以在左侧、右侧或浮动位置创建自己的区域。
- **浏览器广告窗**：独立于网页的右下角小窗，切换标签页也能保留；外观模拟老式页游广告，内部内容可替换。
- **全局快捷键**：不要求焦点停在播放器上，即可选择区域、切换上一条/下一条、隐藏控制栏或恢复页面。
- **TXT 电子书**：自动处理大文件，按被替换段落的字符容量分页；支持固定字符数、百分比步进、方向键、点击后滚轮逐行阅读和进度记忆。
- **漫画阅读**：本地 CBZ/ZIP/图片文件夹、MangaDex、Komga、Kavita、LANraragi、Suwayomi，以及随 Windows 程序提供的本地来源。
- **连续阅读与缓存**：保存搜索、漫画、章节、页码和电子书进度；漫画页默认预取当前页前后各 5 页，离开窗口后释放内存。
- **自适应小游戏**：五子棋等小游戏会根据被替换区域自动缩放，小格子不会再塞入完整桌面布局。

## 界面

<p align="center">
  <img src="docs/windows-host.png" width="620" alt="DeskFish Windows host light interface">
</p>

<details>
  <summary>查看 Edge 扩展完整面板</summary>
  <p align="center"><img src="docs/extension-popup.png" width="380" alt="DeskFish Edge extension popup"></p>
</details>

## 下载与安装

最新版本：[**下载 DeskFish for Windows x64**](https://github.com/onguoin/DeskFish/releases/latest/download/DeskFish-v0.11.0-Windows-x64.zip)

1. 解压下载的 ZIP，先运行 `DeskFish.exe`。它是自包含程序，不需要另装 Python、Node.js、Java、Docker 或 .NET。
2. 在 Edge 打开 `edge://extensions`，开启右上角“开发人员模式”。
3. 点击“加载解压缩的扩展”，选择压缩包中的 `edge-extension` 文件夹。
4. 建议把 DeskFish 固定到浏览器工具栏。漫画需要本地来源时，让 `DeskFish.exe` 留在托盘运行即可。

Windows 可能因为程序尚未购买代码签名证书而显示“未知发布者”。请只从本仓库的 Releases 下载，并可用 Release 页面提供的 SHA-256 校验压缩包。

## 默认快捷键

| 操作 | 快捷键 |
| --- | --- |
| 选择要替换的图片或视频 | `Alt + Shift + V` |
| 下一条视频 / 下一页漫画 | `Alt + Shift + →` |
| 上一条视频 / 上一页漫画 | `Alt + Shift + ←` |
| 显示或隐藏视频控制栏 | `Alt + Shift + H` |

其余快捷键可以在 `edge://extensions/shortcuts` 中自行设置。电子书方向键和滚轮只在你点击过被替换文字后接管，避免影响网页正常滚动。

## 漫画来源

| 类型 | 支持情况 | 说明 |
| --- | --- | --- |
| 本地 CBZ / ZIP / 图片文件夹 | 内置 | 最稳定，数据不离开电脑 |
| MangaDex 官方 API | 内置 | 在线搜索与章节阅读 |
| Komga / Kavita / LANraragi | 内置连接 | 适合已有自建漫画库的人 |
| Suwayomi Server | 内置连接 | 支持 Suwayomi / Tachidesk OPDS API |
| DeskFish 本地引擎 | Windows 程序 | 当前包含包子漫画、Komiic 中文漫画、YY漫画 |

在线站点可能改版、限流或限制部分地区访问。连接器只在用户主动搜索或阅读时请求数据，漫画图片不会被打包进 DeskFish。请遵守内容来源的服务条款与版权规则。

## 数据、缓存与隐私

- 扩展设置、阅读记录和电子书内容保存在 Edge 扩展本地存储中。
- 本地漫画元数据缓存在 `%LOCALAPPDATA%\DeskFrame\manga-cache-v2`，超过 14 天自动清理；保留旧目录名是为了兼容早期版本的数据。
- 漫画图片使用窗口内存缓存，默认最多保留当前页前后各 5 页；离开阅读器会撤销 Blob URL 并释放缓存。
- Windows 本地服务只监听 `127.0.0.1:47653`，不会对局域网或公网开放端口。

## 从源码构建

需要 Windows 10/11 与 .NET 10 SDK：

```powershell
./build.ps1
```

输出位于 `artifacts/DeskFish-v0.11.0-Windows-x64`。Edge 扩展本身无需编译，直接加载 `edge-extension` 文件夹即可。

## 项目结构

```text
DeskFish/
├─ edge-extension/   # Edge Manifest V3 扩展
├─ windows-host/     # 本地漫画服务与托盘程序
├─ docs/             # Logo 与界面截图
└─ build.ps1         # Windows x64 打包脚本
```

## 许可证

DeskFish 以 [MIT License](LICENSE) 开源。第三方资源、依赖和漫画连接器参考见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

项目作者：[@onguoin](https://github.com/onguoin)
