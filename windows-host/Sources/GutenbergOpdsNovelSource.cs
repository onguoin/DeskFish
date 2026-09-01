using System.Net;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace DeskFrame.Host.Sources;

internal sealed partial class GutenbergOpdsNovelSource : INovelSource, IDisposable
{
    private const int MaximumBookBytes = 32 * 1024 * 1024;
    private static readonly XNamespace Atom = "http://www.w3.org/2005/Atom";
    private readonly HttpClient _client;
    private readonly LocalCache _cache = new();

    public GutenbergOpdsNovelSource()
    {
        _client = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All
        })
        {
            BaseAddress = new Uri("https://www.gutenberg.org/"),
            Timeout = TimeSpan.FromSeconds(60)
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("DeskFish/0.12 (+https://github.com/onguoin/DeskFish)");
    }

    public SourceInfo Info { get; } = new(
        "gutenberg-opds",
        "Project Gutenberg 公版书",
        "多语言",
        "直接使用 Project Gutenberg 官方 OPDS 目录和官方纯文本文件，由 DeskFish 本地缓存并自动生成章节目录。");

    public async Task<IReadOnlyList<NovelItem>> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        var startIndex = (Math.Clamp(page, 1, 100) - 1) * 25 + 1;
        var path = $"ebooks/search.opds/?query={Uri.EscapeDataString(query.Trim())}&start_index={startIndex}";
        var feed = await GetXmlAsync(path, cancellationToken);
        var items = new List<NovelItem>();
        foreach (var entry in feed.Descendants(Atom + "entry"))
        {
            var id = GutenbergId(entry.Element(Atom + "id")?.Value);
            var title = entry.Element(Atom + "title")?.Value.Trim() ?? "";
            if (id.Length == 0 || title.Length == 0) continue;
            var author = entry.Element(Atom + "content")?.Value.Trim() ?? "佚名";
            items.Add(new NovelItem(id, title, author, "", "Project Gutenberg · 公版书"));
        }
        return items;
    }

    public async Task<NovelDetails> GetDetailsAsync(string novelId, CancellationToken cancellationToken)
    {
        var book = await GetBookAsync(novelId, cancellationToken);
        return new NovelDetails(book.Id, book.Title, book.Author, book.Cover, book.Description, book.Chapters);
    }

    public async Task<NovelBook> GetBookAsync(string novelId, CancellationToken cancellationToken)
    {
        if (!int.TryParse(novelId, out var id) || id <= 0) throw new InvalidOperationException("公版书编号无效");
        var cached = await _cache.GetOrCreateAsync(
            $"novel-book|gutenberg-opds|{id}",
            TimeSpan.FromDays(7),
            token => DownloadBookAsync(id, token),
            cancellationToken);
        return cached.Value;
    }

    private async Task<NovelBook> DownloadBookAsync(int id, CancellationToken cancellationToken)
    {
        var details = await GetXmlAsync($"ebooks/{id}.opds", cancellationToken);
        var entry = details.Descendants(Atom + "entry").FirstOrDefault()
            ?? throw new InvalidOperationException("Project Gutenberg 没有返回书籍详情");
        var title = entry.Element(Atom + "title")?.Value.Trim() ?? $"Project Gutenberg #{id}";
        var author = entry.Element(Atom + "content")?.Value.Trim() ?? "佚名";
        var cover = entry.Elements(Atom + "link")
            .Where(link => (string?)link.Attribute("rel") == "http://opds-spec.org/image")
            .Select(link => AbsoluteUrl((string?)link.Attribute("href")))
            .FirstOrDefault(url => url.Length > 0) ?? "";
        var rawText = await DownloadTextAsync(id, cancellationToken);
        var body = TrimGutenbergBoilerplate(rawText);
        var split = NovelChapterSplitter.Split(body);
        if (split.Text.Length == 0) throw new InvalidOperationException("公版书正文为空");
        return new NovelBook(
            id.ToString(System.Globalization.CultureInfo.InvariantCulture),
            title,
            author,
            cover,
            $"{author} · Project Gutenberg 公版书",
            split.Text,
            split.Chapters);
    }

    private async Task<string> DownloadTextAsync(int id, CancellationToken cancellationToken)
    {
        var candidates = new[]
        {
            $"cache/epub/{id}/pg{id}.txt",
            $"files/{id}/{id}-0.txt",
            $"files/{id}/{id}.txt"
        };
        foreach (var path in candidates)
        {
            using var response = await _client.GetAsync(path, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode) continue;
            if (response.Content.Headers.ContentLength is > MaximumBookBytes) throw new InvalidOperationException("这本书超过 32 MB 的本地导入上限");
            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            if (bytes.Length > MaximumBookBytes) throw new InvalidOperationException("这本书超过 32 MB 的本地导入上限");
            return System.Text.Encoding.UTF8.GetString(bytes);
        }
        throw new InvalidOperationException("Project Gutenberg 没有提供可读取的 UTF-8 纯文本文件");
    }

    private async Task<XDocument> GetXmlAsync(string path, CancellationToken cancellationToken)
    {
        using var response = await _client.GetAsync(path, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await XDocument.LoadAsync(stream, LoadOptions.None, cancellationToken);
    }

    private static string GutenbergId(string? value)
    {
        var match = EbookId().Match(value ?? "");
        return match.Success ? match.Groups[1].Value : "";
    }

    private static string AbsoluteUrl(string? value)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var absolute)) return absolute.AbsoluteUri;
        return Uri.TryCreate(new Uri("https://www.gutenberg.org/"), value, out var combined) ? combined.AbsoluteUri : "";
    }

    internal static string TrimGutenbergBoilerplate(string value)
    {
        var text = value.Replace("\0", "");
        var start = StartMarker().Match(text);
        if (start.Success) text = text[(start.Index + start.Length)..];
        var end = EndMarker().Match(text);
        if (end.Success) text = text[..end.Index];
        return text.Trim();
    }

    [GeneratedRegex(@"/ebooks/(\d+)\.opds(?:$|[?#])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EbookId();

    [GeneratedRegex(@"\*\*\*\s*START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*\*\*", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex StartMarker();

    [GeneratedRegex(@"\*\*\*\s*END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*\*\*", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EndMarker();

    public void Dispose() => _client.Dispose();
}
