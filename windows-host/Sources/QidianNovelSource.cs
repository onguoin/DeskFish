using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DeskFrame.Host.Sources;

internal sealed partial class QidianNovelSource : INovelSource, IDisposable
{
    private const string BaseAddress = "https://m.qidian.com/";
    private const string BrowserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
    private const int MaximumBookRunes = 32 * 1024 * 1024;
    private const int DownloadConcurrency = 4;
    private readonly HttpClient _client;
    private readonly LocalCache _cache = new();

    public QidianNovelSource()
    {
        _client = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All,
            // Qidian may issue a short-lived browser challenge cookie. Keeping it in a
            // headless HTTP session makes the following catalog request look invalid;
            // independent public-page requests remain readable without account cookies.
            UseCookies = false
        })
        {
            BaseAddress = new Uri(BaseAddress),
            Timeout = TimeSpan.FromSeconds(45)
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd(BrowserUserAgent);
        _client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("zh-CN,zh;q=0.9,zh-TW;q=0.8");
    }

    public SourceInfo Info { get; } = new(
        "qidian-public",
        "起点中文网 · 公开章节",
        "简体中文",
        "DeskFish 内置本地解析器：读取起点官方公开搜索、原始目录和可公开阅读章节；付费章节只显示目录，不绕过订阅。");

    public async Task<IReadOnlyList<NovelItem>> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query)) return [];
        var currentPage = Math.Clamp(page, 1, 100);
        var path = $"so/{Uri.EscapeDataString(query.Trim())}.html?page={currentPage}";
        var html = await GetTextAsync(path, cancellationToken);
        return ParseSearchPage(html);
    }

    public async Task<NovelDetails> GetDetailsAsync(string novelId, CancellationToken cancellationToken)
    {
        var catalog = await GetCatalogAsync(NormalizeId(novelId), cancellationToken);
        return new NovelDetails(
            catalog.Id,
            catalog.Title,
            catalog.Author,
            catalog.Cover,
            catalog.Description,
            catalog.Chapters);
    }

    public async Task<NovelBook> GetBookAsync(string novelId, CancellationToken cancellationToken)
    {
        var id = NormalizeId(novelId);
        var cached = await _cache.GetOrCreateAsync(
            $"novel-book|qidian-public|{id}",
            TimeSpan.FromDays(7),
            token => DownloadReadableBookAsync(id, token),
            cancellationToken);
        return cached.Value;
    }

    private async Task<NovelBook> DownloadReadableBookAsync(string novelId, CancellationToken cancellationToken)
    {
        var catalog = await GetCatalogAsync(novelId, cancellationToken);
        var readable = catalog.Chapters.Where(chapter => chapter.IsReadable).ToArray();
        if (readable.Length == 0) throw new InvalidOperationException("这本书当前没有可公开读取的章节");

        var bodies = new string[readable.Length];
        using var gate = new SemaphoreSlim(DownloadConcurrency, DownloadConcurrency);
        var tasks = readable.Select(async (chapter, index) =>
        {
            await gate.WaitAsync(cancellationToken);
            try
            {
                bodies[index] = await GetChapterAsync(novelId, chapter.Id, cancellationToken);
            }
            finally
            {
                gate.Release();
            }
        }).ToArray();
        await Task.WhenAll(tasks);

        var text = new StringBuilder();
        var chapters = new List<NovelChapter>(readable.Length);
        var runeOffset = 0;
        for (var index = 0; index < readable.Length; index++)
        {
            var source = readable[index];
            var body = bodies[index].Trim();
            if (body.Length == 0) continue;
            if (text.Length > 0)
            {
                text.Append("\n\n");
                runeOffset += 2;
            }
            var start = runeOffset;
            text.Append(source.Title).Append('\n').Append(body);
            runeOffset += source.Title.EnumerateRunes().Count() + 1 + body.EnumerateRunes().Count();
            if (runeOffset > MaximumBookRunes) throw new InvalidOperationException("公开章节正文超过 32 MB，请改用本地 TXT 分批导入");
            chapters.Add(new NovelChapter(
                source.Id,
                source.Title,
                start,
                runeOffset - start,
                chapters.Count,
                true,
                source.Details));
        }
        if (chapters.Count == 0) throw new InvalidOperationException("公开章节暂时没有返回可读取正文");

        return new NovelBook(
            catalog.Id,
            catalog.Title,
            catalog.Author,
            catalog.Cover,
            $"{catalog.Description} · 已缓存 {chapters.Count} 个公开章节",
            text.ToString(),
            chapters);
    }

    private async Task<QidianCatalog> GetCatalogAsync(string novelId, CancellationToken cancellationToken)
    {
        var cached = await _cache.GetOrCreateAsync(
            $"novel-details|qidian-public|{novelId}",
            TimeSpan.FromHours(12),
            async token => ParseCatalogPage(await GetTextAsync($"book/{novelId}/catalog", token), novelId),
            cancellationToken);
        return cached.Value;
    }

    private async Task<string> GetChapterAsync(string novelId, string chapterId, CancellationToken cancellationToken)
    {
        var cached = await _cache.GetOrCreateAsync(
            $"novel-chapter|qidian-public|{novelId}|{chapterId}",
            TimeSpan.FromDays(14),
            async token => ParseChapterPage(await GetTextAsync($"chapter/{novelId}/{chapterId}/", token), novelId, chapterId),
            cancellationToken);
        return cached.Value;
    }

    internal Task<string> GetChapterForTestAsync(string novelId, string chapterId, CancellationToken cancellationToken) =>
        GetChapterAsync(NormalizeId(novelId), NormalizeId(chapterId), cancellationToken);

    private async Task<string> GetTextAsync(string path, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }

    internal static IReadOnlyList<NovelItem> ParseSearchPage(string html)
    {
        using var document = ParsePageContext(html);
        var records = Navigate(document.RootElement, "pageContext", "pageProps", "pageData", "bookInfo", "records");
        if (records.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("起点搜索页没有返回作品列表");
        var output = new List<NovelItem>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in records.EnumerateArray())
        {
            var id = JsonString(item, "bid");
            var title = JsonString(item, "bName");
            if (id.Length == 0 || title.Length == 0 || !seen.Add(id)) continue;
            var author = JsonString(item, "bAuth", "佚名");
            var cover = AbsoluteUrl(JsonString(item, "imgUrl"));
            var details = string.Join(" · ", new[]
            {
                JsonString(item, "state"),
                JsonString(item, "cnt"),
                JsonString(item, "lastChapterName")
            }.Where(value => value.Length > 0));
            output.Add(new NovelItem(id, title, author, cover, details));
            if (output.Count >= 30) break;
        }
        return output;
    }

    internal static QidianCatalog ParseCatalogPage(string html, string expectedNovelId)
    {
        using var document = ParsePageContext(html);
        var pageData = Navigate(document.RootElement, "pageContext", "pageProps", "pageData");
        var id = JsonString(pageData, "bookId");
        if (id.Length == 0) id = expectedNovelId;
        if (!string.Equals(id, expectedNovelId, StringComparison.Ordinal)) throw new InvalidOperationException("起点目录返回了不匹配的作品");
        var title = JsonString(pageData, "bookName", $"起点作品 #{id}");
        var authorInfo = PropertyOrDefault(pageData, "authorInfo");
        var author = JsonString(authorInfo, "authorName", "佚名");
        var chapters = new List<NovelChapter>();
        var volumes = PropertyOrDefault(pageData, "vs");
        if (volumes.ValueKind == JsonValueKind.Array)
        {
            foreach (var volume in volumes.EnumerateArray())
            {
                var volumeName = JsonString(volume, "vN", "正文");
                var entries = PropertyOrDefault(volume, "cs");
                if (entries.ValueKind != JsonValueKind.Array) continue;
                foreach (var entry in entries.EnumerateArray())
                {
                    var chapterId = JsonString(entry, "id");
                    if (chapterId.Length == 0) continue;
                    var chapterTitle = JsonString(entry, "cN", "未命名章节");
                    var readable = JsonInteger(entry, "sS") == 1;
                    var count = Math.Max(0, JsonInteger(entry, "cnt"));
                    var state = readable ? "公开可读" : "需在起点订阅";
                    chapters.Add(new NovelChapter(
                        chapterId,
                        chapterTitle,
                        0,
                        count,
                        chapters.Count,
                        readable,
                        $"{volumeName} · {state}"));
                }
            }
        }
        if (chapters.Count == 0) throw new InvalidOperationException("起点作品目录为空或页面结构已经变化");
        var readableCount = chapters.Count(chapter => chapter.IsReadable);
        var description = $"起点中文网官方目录 · {chapters.Count} 项 · {readableCount} 项公开可读";
        return new QidianCatalog(
            id,
            title,
            author,
            $"https://bookcover.yuewen.com/qdbimg/349573/{id}/180",
            description,
            chapters);
    }

    internal static string ParseChapterPage(string html, string expectedNovelId, string expectedChapterId)
    {
        using var document = ParsePageContext(html);
        var pageData = Navigate(document.RootElement, "pageContext", "pageProps", "pageData");
        var chapter = PropertyOrDefault(pageData, "chapterInfo");
        var bookId = JsonString(chapter, "bookId");
        if (bookId.Length == 0) bookId = JsonString(PropertyOrDefault(pageData, "bookInfo"), "bookId");
        var chapterId = JsonString(chapter, "chapterId");
        if (bookId.Length > 0 && !string.Equals(bookId, expectedNovelId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("起点章节返回了不匹配的作品");
        }
        if (chapterId.Length > 0 && !string.Equals(chapterId, expectedChapterId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("起点章节编号不匹配");
        }
        var vipStatus = JsonInteger(chapter, "vipStatus");
        var content = JsonString(chapter, "content");
        if (vipStatus != 0 || content.Length == 0)
        {
            throw new InvalidOperationException("该章节需要在起点订阅，DeskFish 不会绕过付费阅读");
        }
        var plain = ParagraphTag().Replace(content, "\n");
        plain = BreakTag().Replace(plain, "\n");
        plain = AnyTag().Replace(plain, "");
        plain = WebUtility.HtmlDecode(plain).Replace('\u00A0', ' ');
        plain = HorizontalWhitespace().Replace(plain, " ");
        plain = ExcessLineBreaks().Replace(plain, "\n\n").Trim();
        if (plain.Length == 0) throw new InvalidOperationException("起点公开章节正文为空");
        return plain;
    }

    private static JsonDocument ParsePageContext(string html)
    {
        var match = PageContextScript().Match(html ?? "");
        if (!match.Success) throw new InvalidOperationException("起点页面没有返回可解析数据，可能触发了验证页");
        try
        {
            return JsonDocument.Parse(match.Groups["json"].Value);
        }
        catch (JsonException error)
        {
            throw new InvalidOperationException("起点页面数据格式已经变化", error);
        }
    }

    private static JsonElement Navigate(JsonElement element, params string[] path)
    {
        foreach (var name in path)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out element)) return default;
        }
        return element;
    }

    private static JsonElement PropertyOrDefault(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) ? value : default;

    private static string JsonString(JsonElement element, string name, string fallback = "")
    {
        var value = PropertyOrDefault(element, name);
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString()?.Trim() ?? fallback,
            JsonValueKind.Number => value.GetRawText(),
            _ => fallback
        };
    }

    private static int JsonInteger(JsonElement element, string name)
    {
        var value = PropertyOrDefault(element, name);
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)) return number;
        return value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out number) ? number : 0;
    }

    private static string NormalizeId(string value)
    {
        var id = (value ?? "").Trim();
        if (id.Length is < 1 or > 24 || id.Any(character => !char.IsAsciiDigit(character)))
        {
            throw new InvalidOperationException("起点作品编号无效");
        }
        return id;
    }

    private static string AbsoluteUrl(string value)
    {
        if (value.StartsWith("//", StringComparison.Ordinal)) return $"https:{value}";
        return Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps ? uri.AbsoluteUri : "";
    }

    [GeneratedRegex("<script\\s+id=[\"']vite-plugin-ssr_pageContext[\"'][^>]*>(?<json>.*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 3000)]
    private static partial Regex PageContextScript();

    [GeneratedRegex("<p\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
    private static partial Regex ParagraphTag();

    [GeneratedRegex("<br\\s*/?>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
    private static partial Regex BreakTag();

    [GeneratedRegex("<[^>]+>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
    private static partial Regex AnyTag();

    [GeneratedRegex("[\\t\\f\\v ]+", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
    private static partial Regex HorizontalWhitespace();

    [GeneratedRegex("(?:\\r?\\n){3,}", RegexOptions.CultureInvariant, matchTimeoutMilliseconds: 1000)]
    private static partial Regex ExcessLineBreaks();

    public void Dispose() => _client.Dispose();
}

internal sealed record QidianCatalog(
    string Id,
    string Title,
    string Author,
    string Cover,
    string Description,
    IReadOnlyList<NovelChapter> Chapters);
