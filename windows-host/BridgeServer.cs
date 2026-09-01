using System.Collections.Concurrent;
using System.Net;
using DeskFrame.Host.Sources;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DeskFrame.Host;

internal sealed class BridgeServer : IAsyncDisposable
{
    public const string Endpoint = "http://127.0.0.1:47653";
    public const string Version = "0.12.0";

    private readonly IReadOnlyDictionary<string, IMangaSource> _sources;
    private readonly IReadOnlyDictionary<string, INovelSource> _novelSources;
    private readonly ConcurrentDictionary<string, ProxyTicket> _tickets = new(StringComparer.Ordinal);
    private readonly HttpClient _imageClient;
    private readonly LocalCache _cache = new();
    private WebApplication? _app;

    public BridgeServer()
    {
        var sources = new IMangaSource[] { new BaoziSource(), new KomiicSource(), new YyMangaSource() };
        _sources = sources.ToDictionary(source => source.Info.Id, StringComparer.OrdinalIgnoreCase);
        var novelSources = new INovelSource[] { new QidianNovelSource(), new GutenbergOpdsNovelSource() };
        _novelSources = novelSources.ToDictionary(source => source.Info.Id, StringComparer.OrdinalIgnoreCase);
        _imageClient = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All
        })
        {
            Timeout = TimeSpan.FromSeconds(45)
        };
        _imageClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36");
    }

    public bool IsRunning => _app is not null;
    public string SourceSummary => string.Join(" · ", _sources.Values.Select(source => source.Info.Name).Concat(_novelSources.Values.Select(source => source.Info.Name)));

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        if (_app is not null) return;
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
        {
            ApplicationName = typeof(BridgeServer).Assembly.GetName().Name,
            Args = []
        });
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls(Endpoint);
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        });

        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            var origin = context.Request.Headers.Origin.ToString();
            if (origin.StartsWith("chrome-extension://", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.Headers.AccessControlAllowOrigin = origin;
                context.Response.Headers.Vary = "Origin";
                context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
                context.Response.Headers.AccessControlAllowHeaders = "content-type";
                context.Response.Headers.AccessControlAllowMethods = "GET, OPTIONS";
            }
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }
            try
            {
                await next(context);
            }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
            {
                // The browser cancelled an obsolete request.
            }
            catch (Exception error)
            {
                if (context.Response.HasStarted) throw;
                context.Response.StatusCode = StatusCodes.Status502BadGateway;
                await context.Response.WriteAsJsonAsync(new { error = FriendlyMessage(error) });
            }
        });

        app.MapGet("/", () => Results.Content(StatusHtml(), "text/html; charset=utf-8"));
        app.MapGet("/api/v1/health", () => Results.Json(new
        {
            ok = true,
            name = "DeskFish Local Reading Engine",
            version = Version,
            sourceCount = _sources.Count,
            novelSourceCount = _novelSources.Count
        }));
        app.MapGet("/api/v1/sources", () => Results.Json(new
        {
            items = _sources.Values.Select(source => source.Info).OrderBy(source => source.Name).ToArray()
        }));
        app.MapGet("/api/v1/search", SearchAsync);
        app.MapGet("/api/v1/manga", DetailsAsync);
        app.MapGet("/api/v1/chapter", ChapterAsync);
        app.MapGet("/api/v1/novel/sources", () => Results.Json(new
        {
            items = _novelSources.Values.Select(source => source.Info).OrderBy(source => source.Name).ToArray()
        }));
        app.MapGet("/api/v1/novel/search", NovelSearchAsync);
        app.MapGet("/api/v1/novel/details", NovelDetailsAsync);
        app.MapGet("/api/v1/novel/book", NovelBookAsync);
        app.MapGet("/api/v1/image/{token}", ProxyImageAsync);

        await app.StartAsync(cancellationToken);
        _app = app;
    }

    private async Task<IResult> SearchAsync(string source, string q, int? page, CancellationToken cancellationToken)
    {
        var provider = Source(source);
        var query = (q ?? "").Trim();
        if (query.Length is < 1 or > 100) return Results.BadRequest(new { error = "搜索词长度应为 1 到 100 个字符" });
        var currentPage = Math.Clamp(page ?? 1, 1, 100);
        var cached = await _cache.GetOrCreateAsync(
            $"search|{provider.Info.Id}|{query.ToLowerInvariant()}|{currentPage}",
            TimeSpan.FromHours(2),
            token => provider.SearchAsync(query, currentPage, token),
            cancellationToken);
        var projected = cached.Value.Select(item => new
        {
            item.Id,
            item.Title,
            cover = ProxyUrl(item.Cover, ""),
            item.Details
        }).ToArray();
        return Results.Json(new { source = provider.Info, page = currentPage, cache = cached.State, items = projected });
    }

    private async Task<IResult> DetailsAsync(string source, string id, CancellationToken cancellationToken)
    {
        var provider = Source(source);
        var safeId = id ?? "";
        var cached = await _cache.GetOrCreateAsync(
            $"manga|{provider.Info.Id}|{safeId}",
            TimeSpan.FromHours(12),
            token => provider.GetDetailsAsync(safeId, token),
            cancellationToken);
        var manga = cached.Value;
        return Results.Json(new
        {
            source = provider.Info,
            cache = cached.State,
            manga.Id,
            manga.Title,
            cover = ProxyUrl(manga.Cover, ""),
            manga.Description,
            manga.Chapters
        });
    }

    private async Task<IResult> ChapterAsync(string source, string mangaId, string chapterId, CancellationToken cancellationToken)
    {
        var provider = Source(source);
        var safeMangaId = mangaId ?? "";
        var safeChapterId = chapterId ?? "";
        var cached = await _cache.GetOrCreateAsync(
            $"chapter|{provider.Info.Id}|{safeMangaId}|{safeChapterId}",
            TimeSpan.FromHours(2),
            token => provider.GetPagesAsync(safeMangaId, safeChapterId, token),
            cancellationToken);
        var chapter = cached.Value;
        var pages = chapter.Pages.Select(page => ProxyUrl(page.Url, page.Referer)).ToArray();
        return Results.Json(new
        {
            source = provider.Info,
            cache = cached.State,
            chapter.MangaId,
            chapter.ChapterId,
            chapter.Title,
            count = pages.Length,
            pages
        });
    }

    private async Task<IResult> NovelSearchAsync(string source, string q, int? page, CancellationToken cancellationToken)
    {
        var provider = NovelSource(source);
        var query = (q ?? "").Trim();
        if (query.Length is < 1 or > 100) return Results.BadRequest(new { error = "搜索词长度应为 1 到 100 个字符" });
        var currentPage = Math.Clamp(page ?? 1, 1, 100);
        var cached = await _cache.GetOrCreateAsync(
            $"novel-search|{provider.Info.Id}|{query.ToLowerInvariant()}|{currentPage}",
            TimeSpan.FromHours(2),
            token => provider.SearchAsync(query, currentPage, token),
            cancellationToken);
        var projected = cached.Value.Select(item => new
        {
            item.Id,
            item.Title,
            item.Author,
            cover = ProxyUrl(item.Cover, ""),
            item.Details
        }).ToArray();
        return Results.Json(new { source = provider.Info, page = currentPage, cache = cached.State, items = projected });
    }

    private async Task<IResult> NovelDetailsAsync(string source, string id, CancellationToken cancellationToken)
    {
        var provider = NovelSource(source);
        var safeId = id ?? "";
        var cached = await _cache.GetOrCreateAsync(
            $"novel-details|{provider.Info.Id}|{safeId}",
            TimeSpan.FromDays(2),
            token => provider.GetDetailsAsync(safeId, token),
            cancellationToken);
        var novel = cached.Value;
        return Results.Json(new
        {
            source = provider.Info,
            cache = cached.State,
            novel.Id,
            novel.Title,
            novel.Author,
            cover = ProxyUrl(novel.Cover, ""),
            novel.Description,
            novel.Chapters
        });
    }

    private async Task<IResult> NovelBookAsync(string source, string id, CancellationToken cancellationToken)
    {
        var provider = NovelSource(source);
        var novel = await provider.GetBookAsync(id ?? "", cancellationToken);
        return Results.Json(new
        {
            source = provider.Info,
            novel.Id,
            novel.Title,
            novel.Author,
            cover = ProxyUrl(novel.Cover, ""),
            novel.Description,
            novel.Text,
            novel.Chapters
        });
    }

    private async Task ProxyImageAsync(string token, HttpContext context)
    {
        CleanupTickets();
        if (!_tickets.TryGetValue(token ?? "", out var ticket) || ticket.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(new { error = "图片链接已过期，请重新打开章节" });
            return;
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, ticket.Url);
        if (Uri.TryCreate(ticket.Referer, UriKind.Absolute, out var referer)) request.Headers.Referrer = referer;
        using var response = await _imageClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
        response.EnsureSuccessStatusCode();
        context.Response.StatusCode = (int)response.StatusCode;
        context.Response.ContentType = response.Content.Headers.ContentType?.ToString() ?? "image/jpeg";
        context.Response.Headers.CacheControl = "private, max-age=600";
        if (response.Content.Headers.ContentLength is long length) context.Response.ContentLength = length;
        await response.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
    }

    private IMangaSource Source(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || !_sources.TryGetValue(id, out var source))
        {
            throw new InvalidOperationException("本地漫画源不存在或尚未启用");
        }
        return source;
    }

    private INovelSource NovelSource(string id)
    {
        if (string.IsNullOrWhiteSpace(id) || !_novelSources.TryGetValue(id, out var source))
        {
            throw new InvalidOperationException("本地小说源不存在或尚未启用");
        }
        return source;
    }

    private string ProxyUrl(string target, string referer)
    {
        if (!Uri.TryCreate(target, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return "";
        var token = Guid.NewGuid().ToString("N");
        _tickets[token] = new ProxyTicket(uri.AbsoluteUri, referer, DateTimeOffset.UtcNow.AddHours(2));
        return $"{Endpoint}/api/v1/image/{token}";
    }

    private void CleanupTickets()
    {
        if (_tickets.Count < 5000) return;
        var now = DateTimeOffset.UtcNow;
        foreach (var pair in _tickets)
        {
            if (pair.Value.ExpiresAt <= now) _tickets.TryRemove(pair.Key, out _);
        }
    }

    private static string FriendlyMessage(Exception error)
    {
        var root = error;
        while (root.InnerException is not null) root = root.InnerException;
        return root switch
        {
            HttpRequestException => $"内容来源访问失败：{root.Message}",
            TaskCanceledException => "内容来源响应超时",
            _ => root.Message
        };
    }

    private string StatusHtml() => $$"""
        <!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        <title>DeskFish 本地阅读引擎</title><style>:root{color-scheme:dark}body{margin:0;background:#08151a;color:#d9f3ee;font:15px/1.65 "Segoe UI",system-ui;padding:48px}main{max-width:680px;margin:auto;background:#10262d;border:1px solid #28505a;border-radius:14px;padding:30px;box-shadow:0 24px 70px #0008}h1{margin:0 0 4px;font:700 34px/1 "Bahnschrift","Microsoft YaHei UI",sans-serif;letter-spacing:.02em}b{color:#66d8c8}code{background:#071115;border:1px solid #234049;padding:3px 7px;border-radius:5px}a{color:#66d8c8}.wake{height:3px;width:92px;background:#ff7a59;margin:18px 0 24px}</style></head>
        <body><main><h1>DeskFish</h1><p>本地漫画与小说引擎</p><div class="wake"></div><p><b>● 运行正常</b> · v{{Version}}</p><p>监听地址：<code>{{Endpoint}}</code></p><p>漫画来源：{{string.Join("、", _sources.Values.Select(source => source.Info.Name))}}</p><p>小说来源：{{string.Join("、", _novelSources.Values.Select(source => source.Info.Name))}}</p><p>磁盘缓存：<code>{{_cache.DirectoryPath}}</code></p><p>保持 DeskFish 在后台运行，Edge 扩展即可搜索和连续阅读。</p><p><a href="https://github.com/onguoin/DeskFish">GitHub · DeskFish</a></p></main></body></html>
        """;

    public async ValueTask DisposeAsync()
    {
        if (_app is not null)
        {
            await _app.StopAsync(TimeSpan.FromSeconds(3));
            await _app.DisposeAsync();
            _app = null;
        }
        foreach (var disposable in _sources.Values.OfType<IDisposable>()) disposable.Dispose();
        foreach (var disposable in _novelSources.Values.OfType<IDisposable>()) disposable.Dispose();
        _imageClient.Dispose();
    }
}
