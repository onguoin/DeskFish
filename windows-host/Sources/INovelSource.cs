namespace DeskFrame.Host.Sources;

internal interface INovelSource
{
    SourceInfo Info { get; }

    Task<IReadOnlyList<NovelItem>> SearchAsync(string query, int page, CancellationToken cancellationToken);

    Task<NovelDetails> GetDetailsAsync(string novelId, CancellationToken cancellationToken);

    Task<NovelBook> GetBookAsync(string novelId, CancellationToken cancellationToken);
}
