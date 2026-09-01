# DeskFish 本地漫画引擎

DeskFish 的 Windows 本机伴生程序。用户只需运行发布后的 `DeskFish.exe`；它会在 `127.0.0.1:47653` 启动一个仅供 Edge 扩展访问的漫画来源服务，并保留一个 Windows 托盘图标。

不需要安装 Java、Python、Node.js、Docker、Suwayomi 或单独的漫画来源插件。发布版本为 .NET 自包含单文件，运行电脑也不需要预装 .NET。

## 本机 API

- `GET /api/v1/health`：运行状态和版本
- `GET /api/v1/sources`：已内置的漫画来源
- `GET /api/v1/search?source=ID&q=关键词&page=1`：搜索
- `GET /api/v1/manga?source=ID&id=漫画ID`：详情和章节
- `GET /api/v1/chapter?source=ID&mangaId=漫画ID&chapterId=章节ID`：页面清单
- `GET /api/v1/image/{ticket}`：转发该次章节解析生成的短期图片票据

图片接口不是开放代理：客户端不能提交任意图片网址，票据只能由内置来源在搜索或章节解析时生成，并会过期。HTTP CORS 只向 `chrome-extension://` 来源返回授权头。

## 来源适配器

每个来源实现 `Sources/IMangaSource.cs` 的搜索、详情和页面三个方法。当前内置 `BaoziSource`、`KomiicSource` 和 `YyMangaSource`。统一接口让 Edge 阅读器不必了解具体站点页面结构；来源失效时可以独立更新宿主程序。

搜索、漫画详情/章节目录和页面清单会以 JSON 缓存在兼容旧版的 `%LOCALAPPDATA%\DeskFrame\manga-cache-v2`。搜索缓存 2 小时、章节目录 12 小时、页面清单 2 小时；进程重启后缓存仍然有效，网络临时失败时最多回退到 14 天内的旧缓存，启动时自动删除超过 14 天的缓存文件。

## 构建

```powershell
dotnet publish DeskFish.Host.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

输出的 `DeskFish.exe` 是 Windows x64 自包含单文件。

项目主页：[GitHub · DeskFish](https://github.com/onguoin/DeskFish)
