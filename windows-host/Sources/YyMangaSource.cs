using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;

namespace DeskFrame.Host.Sources;

internal sealed class YyMangaSource : IMangaSource, IDisposable
{
    private const string BaseAddress = "https://www.yymanhua.com/";
    private const string BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    private static readonly Regex SearchItemPattern = new(
        "<li>.*?<img[^>]+class=\"mh-cover\"[^>]+src=\"(?<cover>[^\"]+)\".*?<h2[^>]+class=\"title\"[^>]*>.*?<a[^>]+href=\"(?<href>/\\d+yy/)\"[^>]+title=\"(?<title>[^\"]+)\"",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled,
        TimeSpan.FromSeconds(3));
    private static readonly Regex ChapterPattern = new(
        "<a[^>]+href=\"(?<href>/m\\d+/)\"[^>]*class=\"detail-list-form-item[^\"]*\"[^>]*>(?<title>.*?)</a>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled,
        TimeSpan.FromSeconds(3));
    private static readonly Regex PackedPattern = new(
        "\\}\\('(?<payload>(?:\\\\.|[^'])*)',(?<radix>\\d+),(?<count>\\d+),'(?<keys>(?:\\\\.|[^'])*)'\\.split\\('\\|'\\)",
        RegexOptions.Singleline | RegexOptions.Compiled,
        TimeSpan.FromSeconds(2));
    private static readonly Regex TagPattern = new("<[^>]+>", RegexOptions.Compiled, TimeSpan.FromSeconds(1));
    private readonly HttpClient _client;

    public YyMangaSource()
    {
        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All,
            CookieContainer = new CookieContainer()
        };
        handler.CookieContainer.Add(new Uri(BaseAddress), new Cookie("yymanhua_lang", "2"));
        _client = new HttpClient(handler)
        {
            BaseAddress = new Uri(BaseAddress),
            Timeout = TimeSpan.FromSeconds(35)
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd(BrowserUserAgent);
        _client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("zh-CN,zh;q=0.9,zh-TW;q=0.8");
    }

    public SourceInfo Info { get; } = new(
        "yymanhua",
        "YY漫画",
        "中文",
        "由 DeskFish 本地引擎解析网页目录与漫画页；无需登录或额外来源插件。");

    public async Task<IReadOnlyList<MangaItem>> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query)) return [];
        var html = await FetchTextAsync($"search?title={Uri.EscapeDataString(query.Trim())}&page={Math.Max(1, page)}", BaseAddress, cancellationToken);
        var results = new List<MangaItem>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in SearchItemPattern.Matches(html))
        {
            var id = Decode(match.Groups["href"].Value);
            if (!seen.Add(id)) continue;
            results.Add(new MangaItem(id, CleanText(match.Groups["title"].Value), AbsoluteUrl(match.Groups["cover"].Value), "YY漫画 · 查看目录"));
            if (results.Count >= 30) break;
        }
        return results;
    }

    public async Task<MangaDetails> GetDetailsAsync(string mangaId, CancellationToken cancellationToken)
    {
        var path = NormalizeMangaPath(mangaId);
        var html = await FetchTextAsync(path, BaseAddress, cancellationToken);
        var title = MatchValue(html, "<p[^>]+class=\"detail-info-title\"[^>]*>(?<value>.*?)</p>");
        var cover = MatchValue(html, "<img[^>]+src=\"(?<value>[^\"]+)\"[^>]+class=\"detail-info-cover\"");
        var description = MatchValue(html, "<p[^>]+class=\"detail-info-content\"[^>]*>(?<value>.*?)</p>");
        if (string.IsNullOrWhiteSpace(title)) title = "未命名漫画";

        var chapters = new List<MangaChapter>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in ChapterPattern.Matches(html))
        {
            var id = Decode(match.Groups["href"].Value);
            if (!seen.Add(id)) continue;
            var chapterTitle = CleanText(match.Groups["title"].Value);
            var numberMatch = Regex.Match(chapterTitle, "(?<number>\\d+(?:\\.\\d+)?)", RegexOptions.None, TimeSpan.FromSeconds(1));
            double? number = numberMatch.Success && double.TryParse(numberMatch.Groups["number"].Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
            chapters.Add(new MangaChapter(id, chapterTitle, "YY漫画", number));
        }
        var ordered = chapters
            .OrderBy(chapter => chapter.Number ?? double.MaxValue)
            .ThenBy(chapter => chapter.Title, StringComparer.OrdinalIgnoreCase)
            .Select((chapter, index) => chapter with { Sequence = index })
            .ToArray();
        if (ordered.Length == 0) throw new InvalidOperationException("YY漫画没有解析到章节目录");
        return new MangaDetails(path, title, AbsoluteUrl(cover), description, ordered);
    }

    public async Task<ChapterPages> GetPagesAsync(string mangaId, string chapterId, CancellationToken cancellationToken)
    {
        var mangaPath = NormalizeMangaPath(mangaId);
        var chapterPath = NormalizeChapterPath(chapterId);
        var html = await FetchTextAsync(chapterPath, new Uri(new Uri(BaseAddress), mangaPath).AbsoluteUri, cancellationToken);
        var cid = ScriptNumber(html, "YYMANHUA_CID");
        var mid = ScriptNumber(html, "YYMANHUA_MID");
        var count = Math.Clamp(ScriptNumber(html, "YYMANHUA_IMAGE_COUNT"), 1, 600);
        var date = ScriptString(html, "YYMANHUA_VIEWSIGN_DT");
        var sign = ScriptString(html, "YYMANHUA_VIEWSIGN");
        var chapterUri = new Uri(new Uri(BaseAddress), chapterPath);
        var referer = chapterUri.AbsoluteUri;
        var paths = new string[count];
        using var gate = new SemaphoreSlim(8, 8);
        var tasks = Enumerable.Range(1, count).Select(async page =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                var query = $"chapterimage.ashx?cid={cid}&page={page}&key=&_cid={cid}&_mid={mid}&_dt={Uri.EscapeDataString(date)}&_sign={Uri.EscapeDataString(sign)}";
                var packed = await FetchTextAsync(new Uri(chapterUri, query).AbsoluteUri, referer, cancellationToken);
                foreach (var image in UnpackImages(packed))
                {
                    var pageNumber = ImagePageNumber(image);
                    if (pageNumber is >= 1 && pageNumber <= count) paths[pageNumber - 1] ??= image;
                }
            }
            finally
            {
                gate.Release();
            }
        });
        await Task.WhenAll(tasks);

        var pages = paths.Where(path => !string.IsNullOrWhiteSpace(path)).Select(path => new PageAsset(path, referer)).ToArray();
        if (pages.Length == 0) throw new InvalidOperationException("YY漫画没有解析到漫画图片");
        return new ChapterPages(mangaPath, chapterPath, ScriptString(html, "YYMANHUA_CTITLE"), pages);
    }

    private async Task<string> FetchTextAsync(string path, string referer, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Referrer = new Uri(referer);
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }

    private static IReadOnlyList<string> UnpackImages(string script)
    {
        var match = PackedPattern.Match(script);
        if (!match.Success) return [];
        var payload = JavaScriptUnescape(match.Groups["payload"].Value);
        var radix = int.Parse(match.Groups["radix"].Value, CultureInfo.InvariantCulture);
        var count = int.Parse(match.Groups["count"].Value, CultureInfo.InvariantCulture);
        var keys = JavaScriptUnescape(match.Groups["keys"].Value).Split('|');
        for (var index = Math.Min(count, keys.Length) - 1; index >= 0; index--)
        {
            if (string.IsNullOrEmpty(keys[index])) continue;
            payload = Regex.Replace(payload, $"\\b{Regex.Escape(BaseEncode(index, radix))}\\b", keys[index], RegexOptions.None, TimeSpan.FromSeconds(1));
        }
        var prefix = Regex.Match(payload, "var\\s+pix=\"(?<value>[^\"]+)\"", RegexOptions.None, TimeSpan.FromSeconds(1)).Groups["value"].Value;
        var key = Regex.Match(payload, "var\\s+key='(?<value>[^']+)'", RegexOptions.None, TimeSpan.FromSeconds(1)).Groups["value"].Value;
        var cid = Regex.Match(payload, "var\\s+cid=(?<value>\\d+)", RegexOptions.None, TimeSpan.FromSeconds(1)).Groups["value"].Value;
        var values = Regex.Match(payload, "var\\s+pvalue=\\[(?<value>.*?)\\]", RegexOptions.Singleline, TimeSpan.FromSeconds(1)).Groups["value"].Value;
        if (string.IsNullOrWhiteSpace(prefix) || string.IsNullOrWhiteSpace(values)) return [];
        return Regex.Matches(values, "[\"'](?<value>/[^\"']+)[\"']")
            .Select(item => $"{prefix}{item.Groups["value"].Value}?cid={cid}&key={Uri.EscapeDataString(key)}&uk=")
            .ToArray();
    }

    private static string BaseEncode(int value, int radix)
    {
        const string digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (value < radix) return digits[value].ToString();
        return BaseEncode(value / radix, radix) + digits[value % radix];
    }

    private static string JavaScriptUnescape(string value) => value.Replace("\\'", "'").Replace("\\\\", "\\");

    private static int ImagePageNumber(string url)
    {
        var match = Regex.Match(url, "/(?<number>\\d+)_", RegexOptions.None, TimeSpan.FromSeconds(1));
        return match.Success && int.TryParse(match.Groups["number"].Value, out var number) ? number : 0;
    }

    private static int ScriptNumber(string html, string name)
    {
        var match = Regex.Match(html, $"(?:var\\s+)?{Regex.Escape(name)}\\s*=\\s*(?<value>\\d+)", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        if (!match.Success || !int.TryParse(match.Groups["value"].Value, out var value)) throw new InvalidOperationException($"YY漫画页面缺少 {name}");
        return value;
    }

    private static string ScriptString(string html, string name)
    {
        var match = Regex.Match(html, $"(?:var\\s+)?{Regex.Escape(name)}\\s*=\\s*[\"'](?<value>.*?)[\"']", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
        return match.Success ? Decode(match.Groups["value"].Value) : "";
    }

    private static string MatchValue(string html, string pattern)
    {
        var match = Regex.Match(html, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline, TimeSpan.FromSeconds(1));
        return match.Success ? CleanText(match.Groups["value"].Value) : "";
    }

    private static string NormalizeMangaPath(string value)
    {
        var decoded = Decode(value).Trim();
        if (!Regex.IsMatch(decoded, "^/\\d+yy/$", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1))) throw new InvalidOperationException("YY漫画地址无效");
        return decoded;
    }

    private static string NormalizeChapterPath(string value)
    {
        var decoded = Decode(value).Trim();
        if (!Regex.IsMatch(decoded, "^/m\\d+/$", RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1))) throw new InvalidOperationException("YY漫画章节地址无效");
        return decoded;
    }

    private static string CleanText(string value) => Regex.Replace(TagPattern.Replace(Decode(value), " "), "\\s+", " ").Trim();
    private static string Decode(string value) => WebUtility.HtmlDecode(value ?? "");
    private static string AbsoluteUrl(string value) => string.IsNullOrWhiteSpace(value) ? "" : new Uri(new Uri(BaseAddress), value).AbsoluteUri;

    public void Dispose() => _client.Dispose();
}
