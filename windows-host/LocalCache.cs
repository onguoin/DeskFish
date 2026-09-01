using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DeskFrame.Host;

internal sealed record CacheResult<T>(T Value, string State);

internal sealed class LocalCache
{
    private static readonly TimeSpan StaleFallbackAge = TimeSpan.FromDays(14);
    private readonly string _directory;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public LocalCache()
    {
        _directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DeskFrame",
            "manga-cache-v2");
        Directory.CreateDirectory(_directory);
        CleanupExpiredFiles();
    }

    public string DirectoryPath => _directory;

    private void CleanupExpiredFiles()
    {
        var cutoff = DateTime.UtcNow - StaleFallbackAge;
        try
        {
            foreach (var path in Directory.EnumerateFiles(_directory, "*.json", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    if (File.GetLastWriteTimeUtc(path) < cutoff) File.Delete(path);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    public async Task<CacheResult<T>> GetOrCreateAsync<T>(
        string key,
        TimeSpan freshness,
        Func<CancellationToken, Task<T>> factory,
        CancellationToken cancellationToken)
    {
        var cacheId = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();
        var path = Path.Combine(_directory, $"{cacheId}.json");
        var gate = _locks.GetOrAdd(cacheId, static _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken);
        try
        {
            var stored = await ReadAsync<T>(path, cancellationToken);
            var age = stored is null ? TimeSpan.MaxValue : DateTimeOffset.UtcNow - stored.SavedAt;
            if (stored is not null && age <= freshness) return new CacheResult<T>(stored.Value, "hit");

            try
            {
                var value = await factory(cancellationToken);
                await WriteAsync(path, new CacheEnvelope<T>(DateTimeOffset.UtcNow, value), cancellationToken);
                return new CacheResult<T>(value, stored is null ? "miss" : "refresh");
            }
            catch when (stored is not null && age <= StaleFallbackAge && !cancellationToken.IsCancellationRequested)
            {
                return new CacheResult<T>(stored.Value, "stale");
            }
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<CacheEnvelope<T>?> ReadAsync<T>(string path, CancellationToken cancellationToken)
    {
        if (!File.Exists(path)) return null;
        try
        {
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 32 * 1024, true);
            return await JsonSerializer.DeserializeAsync<CacheEnvelope<T>>(stream, _json, cancellationToken);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
    }

    private async Task WriteAsync<T>(string path, CacheEnvelope<T> envelope, CancellationToken cancellationToken)
    {
        var temporary = Path.Combine(_directory, $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 32 * 1024, true))
            {
                await JsonSerializer.SerializeAsync(stream, envelope, _json, cancellationToken);
            }
            File.Move(temporary, path, true);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    private sealed record CacheEnvelope<T>(DateTimeOffset SavedAt, T Value);
}
