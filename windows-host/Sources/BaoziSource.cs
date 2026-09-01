using System.Net;
using System.Text.RegularExpressions;

namespace DeskFrame.Host.Sources;

internal sealed class BaoziSource : IMangaSource, IDisposable
{
    private const string BaseAddress = "https://www.baozimh.com/";
    private const string BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

    private static readonly Regex SearchCardPattern = new(
        "<a\\s+href=\"(?<href>/comic/[^\"]+)\"\\s+title=\"(?<title>[^\"]+)\"[^>]*>.*?<amp-img[^>]+src=\"(?<cover>[^\"]+)\"",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled,
        TimeSpan.FromSeconds(2));

    private static readonly Regex ImagePattern = new(
        "\"url\"\\s*:\\s*\"(?<url>https[^\"]+)\"",
        RegexOptions.IgnoreCase | RegexOptions.Compiled,
        TimeSpan.FromSeconds(2));

    private static readonly Regex TagPattern = new("<[^>]+>", RegexOptions.Compiled, TimeSpan.FromSeconds(1));
    private readonly HttpClient _client;

    public BaoziSource()
    {
        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All
        };
        _client = new HttpClient(handler)
        {
            BaseAddress = new Uri(BaseAddress),
            Timeout = TimeSpan.FromSeconds(30)
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd(BrowserUserAgent);
        _client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("zh-CN,zh;q=0.9,zh-TW;q=0.8");
    }

    public SourceInfo Info { get; } = new(
        "baozimh",
        "包子漫画",
        "中文",
        "随 DeskFish 提供的本地网页解析源；无需登录或安装其他漫画插件。");

    public async Task<IReadOnlyList<MangaItem>> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query)) return [];
        var html = await FetchTextAsync($"search?q={Uri.EscapeDataString(query.Trim())}", null, cancellationToken);
        var results = new List<MangaItem>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in SearchCardPattern.Matches(html))
        {
            var id = Decode(match.Groups["href"].Value);
            if (!seen.Add(id)) continue;
            results.Add(new MangaItem(
                id,
                CleanText(match.Groups["title"].Value),
                AbsoluteUrl(Decode(match.Groups["cover"].Value)),
                "包子漫画 · 查看章节"));
            if (results.Count >= 30) break;
        }
        return results;
    }

    public async Task<MangaDetails> GetDetailsAsync(string mangaId, CancellationToken cancellationToken)
    {
        var path = NormalizeMangaPath(mangaId);
        var html = await FetchTextAsync(path, BaseAddress, cancellationToken);
        var title = MetaContent(html, "og:title");
        if (title.EndsWith("漫畫 - 包子漫畫", StringComparison.Ordinal)) title = title[..^9].Trim();
        if (title.EndsWith("漫画 - 包子漫画", StringComparison.Ordinal)) title = title[..^9].Trim();
        if (string.IsNullOrWhiteSpace(title)) title = "未命名漫画";

        var chapters = BaoziChapterParser.Parse(html);

        return new MangaDetails(
            path,
            title,
            AbsoluteUrl(MetaContent(html, "og:image")),
            MetaContent(html, "description"),
            chapters);
    }

    public async Task<ChapterPages> GetPagesAsync(string mangaId, string chapterId, CancellationToken cancellationToken)
    {
        var mangaPath = NormalizeMangaPath(mangaId);
        var chapterPath = Decode(chapterId);
        if (!chapterPath.StartsWith("/user/page_direct?", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("章节地址无效");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_client.BaseAddress!, chapterPath));
        request.Headers.Referrer = new Uri(_client.BaseAddress!, mangaPath);
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        var html = await response.Content.ReadAsStringAsync(cancellationToken);
        var finalUrl = response.RequestMessage?.RequestUri?.AbsoluteUri ?? new Uri(_client.BaseAddress!, chapterPath).AbsoluteUri;
        var title = TitleContent(html);
        if (string.IsNullOrWhiteSpace(title)) title = "漫画章节";

        var pages = new List<PageAsset>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in ImagePattern.Matches(html))
        {
            var url = Decode(match.Groups["url"].Value).Replace("\\/", "/", StringComparison.Ordinal);
            if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != Uri.UriSchemeHttps || !seen.Add(parsed.AbsoluteUri)) continue;
            pages.Add(new PageAsset(parsed.AbsoluteUri, finalUrl));
        }
        if (pages.Count == 0) throw new InvalidOperationException("这个章节暂时没有解析到漫画图片");
        return new ChapterPages(mangaPath, chapterPath, title, pages);
    }

    private async Task<string> FetchTextAsync(string path, string? referer, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        if (!string.IsNullOrWhiteSpace(referer)) request.Headers.Referrer = new Uri(referer);
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }

    private static string NormalizeMangaPath(string value)
    {
        var decoded = Decode(value).Trim();
        if (!decoded.StartsWith("/comic/", StringComparison.OrdinalIgnoreCase)
            || decoded.Contains("..", StringComparison.Ordinal)
            || decoded.Contains('?', StringComparison.Ordinal))
        {
            throw new InvalidOperationException("漫画地址无效");
        }
        return decoded;
    }

    private static string MetaContent(string html, string key)
    {
        var escaped = Regex.Escape(key);
        var forward = Regex.Match(html, $"<meta[^>]+(?:data-hid|property|name)=\"{escaped}\"[^>]+content=\"(?<value>[^\"]*)\"", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        if (forward.Success) return CleanText(forward.Groups["value"].Value);
        var reverse = Regex.Match(html, $"<meta[^>]+content=\"(?<value>[^\"]*)\"[^>]+(?:data-hid|property|name)=\"{escaped}\"", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        return reverse.Success ? CleanText(reverse.Groups["value"].Value) : "";
    }

    private static string TitleContent(string html)
    {
        var match = Regex.Match(html, "<title>(?<value>.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline, TimeSpan.FromSeconds(1));
        return match.Success ? CleanText(match.Groups["value"].Value) : "";
    }

    private static string CleanText(string value) =>
        Regex.Replace(TagPattern.Replace(Decode(value), " "), "\\s+", " ").Trim();

    private static string Decode(string value) => WebUtility.HtmlDecode(value ?? "");

    private static string AbsoluteUrl(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        return Uri.TryCreate(value, UriKind.Absolute, out var absolute)
            ? absolute.AbsoluteUri
            : new Uri(new Uri(BaseAddress), value).AbsoluteUri;
    }

    public void Dispose() => _client.Dispose();
}
