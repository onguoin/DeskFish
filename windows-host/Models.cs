namespace DeskFrame.Host;

internal sealed record SourceInfo(string Id, string Name, string Language, string Description);

internal sealed record MangaItem(
    string Id,
    string Title,
    string Cover,
    string Details = "查看章节");

internal sealed record MangaChapter(
    string Id,
    string Title,
    string Details = "",
    double? Number = null,
    int Part = 0,
    int Sequence = 0);

internal sealed record MangaDetails(
    string Id,
    string Title,
    string Cover,
    string Description,
    IReadOnlyList<MangaChapter> Chapters);

internal sealed record PageAsset(string Url, string Referer);

internal sealed record ChapterPages(
    string MangaId,
    string ChapterId,
    string Title,
    IReadOnlyList<PageAsset> Pages);

internal sealed record NovelItem(
    string Id,
    string Title,
    string Author,
    string Cover,
    string Details = "查看目录");

internal sealed record NovelChapter(
    string Id,
    string Title,
    int Offset,
    int Length,
    int Sequence,
    bool IsReadable = true,
    string Details = "");

internal sealed record NovelDetails(
    string Id,
    string Title,
    string Author,
    string Cover,
    string Description,
    IReadOnlyList<NovelChapter> Chapters);

internal sealed record NovelBook(
    string Id,
    string Title,
    string Author,
    string Cover,
    string Description,
    string Text,
    IReadOnlyList<NovelChapter> Chapters);

internal sealed record ProxyTicket(string Url, string Referer, DateTimeOffset ExpiresAt);
