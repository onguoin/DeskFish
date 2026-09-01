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

internal sealed record ProxyTicket(string Url, string Referer, DateTimeOffset ExpiresAt);
