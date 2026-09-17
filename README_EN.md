<p align="center">
  <img src="docs/deskfish-logo.png" width="132" alt="DeskFish Logo">
</p>

<h1 align="center">DeskFish</h1>

<p align="center">Turn ordinary web pages into a discreet video player, comic shelf, ebook, or mini-game corner.</p>

<p align="center">
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

<p align="center">
  <a href="https://github.com/onguoin/DeskFish/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/onguoin/DeskFish?display_name=tag&label=Latest%20Release&color=3ab7a7"></a>
  <a href="https://github.com/onguoin/DeskFish/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/onguoin/DeskFish/total?label=Downloads&color=3ab7a7"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-0078D4?logo=windows11&logoColor=white">
  <img alt="Microsoft Edge" src="https://img.shields.io/badge/Microsoft%20Edge-Extension-0A9EDC?logo=microsoftedge&logoColor=white">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-ff7e60"></a>
</p>

DeskFish is a small fish living at the edge of your browser. It is made for office downtime, lunch breaks, and those quiet moments when work is slow. It does not pretend to be a productivity suite: it lets you replace an image or video area on a page with Bilibili video, Bilibili/Huya Live, a desktop game window, a mini game, or a comic. A normal paragraph can also become a TXT ebook reader.

When a page has no suitable area, DeskFish can create one on the left, right, or as a floating panel. It can also open a browser-level retro game-ad window that survives tab changes. With hover disguise enabled, moving the pointer away restores the original page immediately; ordinary video pauses without losing its position, while live streams keep playing behind the cover.

> Use DeskFish without disrupting your responsibilities, and follow your organisation's policies and each content provider's terms. DeskFish does not bundle or resell video, live-stream, or comic content.

## Demo

<p align="center">
  <a href="https://github.com/onguoin/DeskFish/releases/download/v0.12.0/DeskFish-v0.12.0-demo.mp4">
    <img src="docs/deskfish-demo.gif" width="760" alt="DeskFish feature demo">
  </a>
</p>

<p align="center">Click the animated preview to watch the high-quality MP4 video.</p>

## Features

- **Media replacement** — replace a selected image or video area with Bilibili video, Bilibili/Huya Live, comics, or mini games.
- **Desktop game window overlay** — drag a windowed or borderless Terraria, Minecraft, GTA V, or other game onto `DeskFish.exe`, then place the real interactive window over a page image; leaving the area instantly restores the original image.
- **Hover disguise** — replacements appear only while hovered by default; leaving restores the page, pauses ordinary video, and keeps live streams connected.
- **Local Huya live path** — the bundled executable resolves public rooms, falls back across CDNs, and proxies short-lived HLS segments over loopback, avoiding Huya's external “preview ended” embed.
- **Custom regions** — create your own left, right, or floating area when the page has nothing suitable to replace.
- **Browser ad window** — a browser-level bottom-right window styled after old-school game ads, with replaceable content and persistence across tabs.
- **Global shortcuts** — pick an area, move to the previous or next item, hide controls, or restore the page without focusing the player.
- **Novels and TXT ebooks** — streams large local files into chunks, detects chapters automatically, and supports chapter jumps, percentage steps, arrow keys, line-by-line wheel reading, and saved progress.
- **Online novels and public-domain books** — Smart Search prefers the bundled Qidian public-chapter parser for Chinese web fiction, while Project Gutenberg plus Chinese and English Wikisource remain available directly without the executable.
- **Comic reader** — local CBZ/ZIP/image folders, MangaDex, Komga, Kavita, LANraragi, Suwayomi, and Windows-host sources, with a persistent switch between source order and numeric chapter order.
- **Continuous reading and caching** — remembers searches, titles, chapters, pages, and ebook positions; prefetches five comic pages on each side and releases them when the reader closes.
- **Responsive mini games** — Gomoku and other games scale down to the selected area instead of forcing a desktop-sized board into a tiny tile.

## Interface

<p align="center">
  <img src="docs/windows-host.png" width="620" alt="DeskFish Windows host light interface">
</p>

<details>
  <summary>Show the full Edge extension panel</summary>
  <p align="center"><img src="docs/extension-popup.png" width="380" alt="DeskFish Edge extension popup"></p>
</details>

## Download and install

Latest version: [**Download DeskFish for Windows x64**](https://github.com/onguoin/DeskFish/releases/latest/download/DeskFish-v0.13.0-Windows-x64.zip)

1. Extract the ZIP and run `DeskFish.exe`. The release is self-contained; Python, Node.js, Java, Docker, and a separate .NET installation are not required.
2. Open `edge://extensions` in Microsoft Edge and enable **Developer mode**.
3. Select **Load unpacked**, then choose the `edge-extension` folder from the extracted package.
4. Pin DeskFish to the Edge toolbar. Keep `DeskFish.exe` in the system tray for local comic/novel sources, Huya Live, and desktop window overlays.

Desktop game overlays require windowed or borderless-window mode. Drag the game window onto the **Window overlay** target in `DeskFish.exe` (or select it from the list), choose **Desktop game window** in the extension, and pick a page image. `Alt + Shift + G` immediately hides the overlay and returns to the browser.

Windows may show **Unknown publisher** because the executable is not code-signed. Download only from this repository's Releases and compare the ZIP against the SHA-256 value in the release notes.

## Default shortcuts

| Action | Shortcut |
| --- | --- |
| Pick an image or video to replace | `Alt + Shift + V` |
| Next video / next comic page | `Alt + Shift + →` |
| Previous video / previous comic page | `Alt + Shift + ←` |
| Show or hide video controls | `Alt + Shift + H` |
| Emergency-hide desktop game overlay | `Alt + Shift + G` (registered by DeskFish.exe) |

Set additional shortcuts at `edge://extensions/shortcuts`. Ebook arrow keys and wheel navigation activate only after clicking the replaced text, so normal page scrolling remains available.

## Comic sources

| Type | Support | Notes |
| --- | --- | --- |
| Local CBZ / ZIP / image folders | Built in | Most reliable; files stay on your computer |
| MangaDex official API | Built in | Online search and chapter reading |
| Komga / Kavita / LANraragi | Built-in connectors | For existing self-hosted libraries |
| Suwayomi Server | Built-in connector | Supports the Suwayomi / Tachidesk OPDS API |
| DeskFish local engine | Windows companion | Currently includes Baozi, Komiic Chinese, and YY Manga |

Online sites may change, rate-limit traffic, or restrict access in some regions. Connectors request data only when the user searches or reads, and comic pages are never bundled with DeskFish. Follow each provider's terms and applicable copyright rules.

## Novel sources

- Local TXT import supports UTF-8 and GB18030/GBK. It detects common Chinese chapter headings, extras, prologues, and English `Chapter` headings while streaming; a book with no recognizable headings remains available as a single “Full text” chapter.
- Three free official interfaces work without the executable: Project Gutenberg OPDS, Chinese Wikisource's MediaWiki API, and English Wikisource's MediaWiki API. Selecting a chapter imports the complete text into local Edge chunks and jumps there, so closing the popup or restarting the browser does not lose the book or reading position.
- `DeskFish.exe` now includes a Qidian public-page parser. It can find Chinese web novels such as *Douluo Dalu*, preserves the official catalog order, downloads only chapters Qidian exposes as publicly readable, and labels subscription chapters without bypassing payment.
- Smart Search combines Qidian with Chinese Wikisource for Chinese queries, and Gutenberg with English Wikisource for Latin-script queries. A specific source can still be selected manually.
- The Project Gutenberg adapter remains available as a disk-cached fallback. All local parsing code is bundled into `DeskFish.exe`; Node, Python, Java, Legado, and additional browser extensions are not required.
- The Windows host exposes a separate `INovelSource` adapter interface, allowing future licensed APIs or site adapters without changing the in-page reader.

## Data, cache, and privacy

- Extension settings, reading history, and ebook content stay in local Edge extension storage.
- Comic metadata and downloaded public-domain book text are cached at `%LOCALAPPDATA%\DeskFrame\manga-cache-v2` and entries older than 14 days are removed. The legacy directory name is kept for data compatibility.
- Comic images use an in-window memory cache containing up to five pages before and after the current page. Blob URLs are revoked when the reader closes.
- The Windows service listens only on `127.0.0.1:47653`; it does not expose a LAN or public network port. Huya manifests and segments are proxied briefly over loopback and are not cached to disk.
- Desktop overlay mode stores only the selected native window handle. It does not capture or upload frames, and releasing the overlay or exiting DeskFish restores the window's original style, position, and visibility.

## Build from source

Windows 10/11 and the .NET 10 SDK are required:

```powershell
./build.ps1
```

The package is written to `artifacts/DeskFish-v0.13.0-Windows-x64`. The Edge extension needs no build step and can be loaded directly from `edge-extension`.

## Repository layout

```text
DeskFish/
├─ edge-extension/   # Edge Manifest V3 extension
├─ windows-host/     # Local comic/novel service and tray app
├─ docs/             # Logo and screenshots
└─ build.ps1         # Windows x64 packaging script
```

## License

DeskFish is open source under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled dependencies, assets, and connector references.

Created by [@onguoin](https://github.com/onguoin).
