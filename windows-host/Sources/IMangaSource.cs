namespace DeskFrame.Host.Sources;

internal interface IMangaSource
{
    SourceInfo Info { get; }

    Task<IReadOnlyList<MangaItem>> SearchAsync(string query, int page, CancellationToken cancellationToken);

    Task<MangaDetails> GetDetailsAsync(string mangaId, CancellationToken cancellationToken);

    Task<ChapterPages> GetPagesAsync(string mangaId, string chapterId, CancellationToken cancellationToken);
}
