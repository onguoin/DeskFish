using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;

namespace DeskFrame.Host.Sources;

internal sealed class KomiicSource : IMangaSource, IDisposable
{
    private const string SearchQuery = "query searchComicAndAuthorQuery($keyword: String!) { searchComicsAndAuthors(keyword: $keyword) { comics { id title status year imageUrl lastChapterUpdate lastBookUpdate } } }";
    private const string ChaptersQuery = "query chapterByComicId($comicId: ID!) { chaptersByComicId(comicId: $comicId) { id serial type dateUpdated size } }";
    private const string ImagesQuery = "query imagesByChapterId($chapterId: ID!) { imagesByChapterId(chapterId: $chapterId) { id kid height width } }";
    private readonly HttpClient _client;

    public KomiicSource()
    {
        _client = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All
        })
        {
            BaseAddress = new Uri("https://komiic.com/"),
            Timeout = TimeSpan.FromSeconds(30)
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36");
        _client.DefaultRequestHeaders.Referrer = new Uri("https://komiic.com/");
    }

    public SourceInfo Info { get; } = new(
        "komiic-local",
        "Komiic 中文漫画",
        "繁体中文",
        "由 DeskFish 本地引擎统一搜索、缓存并转发图片；站点有每日图片读取额度。");

    public async Task<IReadOnlyList<MangaItem>> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query) || page > 1) return [];
        using var payload = await QueryAsync("searchComicAndAuthorQuery", SearchQuery, new { keyword = query.Trim() }, cancellationToken);
        if (!TryProperty(payload.RootElement, out var comics, "data", "searchComicsAndAuthors", "comics") || comics.ValueKind != JsonValueKind.Array) return [];

        var items = new List<MangaItem>();
        foreach (var comic in comics.EnumerateArray())
        {
            var id = Text(comic, "id");
            var title = Text(comic, "title");
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(title)) continue;
            var cover = Text(comic, "imageUrl");
            var status = Text(comic, "status") switch
            {
                "ONGOING" => "连载",
                "END" => "完结",
                var value => value
            };
            var year = Text(comic, "year");
            var latest = Text(comic, "lastChapterUpdate");
            var details = string.Join(" · ", new[] { status, year, string.IsNullOrWhiteSpace(latest) ? "" : $"更新至 {latest} 话" }.Where(value => !string.IsNullOrWhiteSpace(value)));
            items.Add(new MangaItem(Encode(new MangaToken(id, title, cover, details)), title, cover, details));
        }
        return items;
    }

    public async Task<MangaDetails> GetDetailsAsync(string mangaId, CancellationToken cancellationToken)
    {
        var token = Decode(mangaId);
        using var payload = await QueryAsync("chapterByComicId", ChaptersQuery, new { comicId = token.Id }, cancellationToken);
        if (!TryProperty(payload.RootElement, out var chaptersElement, "data", "chaptersByComicId") || chaptersElement.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("Komiic 没有返回卷/话目录");
        }

        var chapters = new List<MangaChapter>();
        foreach (var chapter in chaptersElement.EnumerateArray())
        {
            var id = Text(chapter, "id");
            var serialText = Text(chapter, "serial");
            var kind = Text(chapter, "type") == "book" ? "卷" : "话";
            if (string.IsNullOrWhiteSpace(id)) continue;
            double? number = double.TryParse(serialText, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var parsed) ? parsed : null;
            var size = Text(chapter, "size");
            chapters.Add(new MangaChapter(id, $"第 {serialText} {kind}", string.IsNullOrWhiteSpace(size) ? "Komiic" : $"{size} 页 · Komiic", number));
        }

        var ordered = chapters
            .OrderBy(chapter => chapter.Number ?? double.MaxValue)
            .ThenBy(chapter => chapter.Title, StringComparer.OrdinalIgnoreCase)
            .Select((chapter, index) => chapter with { Sequence = index })
            .ToArray();
        return new MangaDetails(mangaId, token.Title, token.Cover, token.Details, ordered);
    }

    public async Task<ChapterPages> GetPagesAsync(string mangaId, string chapterId, CancellationToken cancellationToken)
    {
        var token = Decode(mangaId);
        if (!long.TryParse(chapterId, NumberStyles.None, CultureInfo.InvariantCulture, out _)) throw new InvalidOperationException("Komiic 章节编号无效");
        using var payload = await QueryAsync("imagesByChapterId", ImagesQuery, new { chapterId }, cancellationToken);
        if (!TryProperty(payload.RootElement, out var images, "data", "imagesByChapterId") || images.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("Komiic 没有返回漫画页");
        }

        var referer = $"https://komiic.com/comic/{Uri.EscapeDataString(token.Id)}/chapter/{Uri.EscapeDataString(chapterId)}/images/all";
        var pages = images.EnumerateArray()
            .Select(image => Text(image, "kid"))
            .Where(kid => !string.IsNullOrWhiteSpace(kid))
            .Select(kid => new PageAsset($"https://komiic.com/api/image/{Uri.EscapeDataString(kid)}", referer))
            .ToArray();
        if (pages.Length == 0) throw new InvalidOperationException("Komiic 这个卷/话暂时没有可读取页面");
        return new ChapterPages(mangaId, chapterId, token.Title, pages);
    }

    private async Task<JsonDocument> QueryAsync(string operationName, string query, object variables, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new { operationName, query, variables });
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/query")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        if (payload.RootElement.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Array && errors.GetArrayLength() > 0)
        {
            var message = errors[0].TryGetProperty("message", out var text) ? text.GetString() : "Komiic 接口返回错误";
            payload.Dispose();
            throw new InvalidOperationException(message);
        }
        return payload;
    }

    private static bool TryProperty(JsonElement element, out JsonElement value, params string[] path)
    {
        value = element;
        foreach (var name in path)
        {
            if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(name, out value)) return false;
        }
        return true;
    }

    private static string Text(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return "";
        return value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : value.ToString();
    }

    private static string Encode(MangaToken token)
    {
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(token));
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static MangaToken Decode(string value)
    {
        try
        {
            var encoded = value.Replace('-', '+').Replace('_', '/');
            encoded += new string('=', (4 - encoded.Length % 4) % 4);
            return JsonSerializer.Deserialize<MangaToken>(Convert.FromBase64String(encoded))
                ?? throw new InvalidOperationException("Komiic 漫画标识无效");
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            throw new InvalidOperationException("Komiic 漫画标识无效", error);
        }
    }

    public void Dispose() => _client.Dispose();

    private sealed record MangaToken(string Id, string Title, string Cover, string Details);
}
