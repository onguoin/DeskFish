using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DeskFrame.Host.Sources;

internal sealed record HuyaResolvedStream(
    string Room,
    string Title,
    string Anchor,
    IReadOnlyList<HuyaCdnStream> Streams);

internal sealed record HuyaCdnStream(
    string Cdn,
    string HlsBase,
    string StreamName,
    string HlsSuffix,
    string AntiCode);

internal sealed partial class HuyaLiveSource : IDisposable
{
    private readonly HttpClient _client;
    private readonly Dictionary<string, string> _preferredCdn = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _preferredCdnLock = new();

    public HuyaLiveSource()
    {
        _client = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = true,
            AutomaticDecompression = DecompressionMethods.All
        })
        {
            Timeout = TimeSpan.FromSeconds(20)
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36");
        _client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("zh-CN,zh;q=0.9");
    }

    public async Task<HuyaResolvedStream> ResolveAsync(string room, CancellationToken cancellationToken)
    {
        var safeRoom = NormalizeRoom(room);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"https://www.huya.com/{safeRoom}");
        request.Headers.Referrer = new Uri("https://www.huya.com/");
        using var response = await _client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        var html = await response.Content.ReadAsStringAsync(cancellationToken);
        return ParsePage(safeRoom, html);
    }

    public async Task<(string Playlist, Uri RemoteUrl)> FetchPlaylistAsync(
        HuyaResolvedStream stream,
        CancellationToken cancellationToken)
    {
        Exception? lastError = null;
        string preferred;
        lock (_preferredCdnLock) _preferredCdn.TryGetValue(stream.Room, out preferred!);
        var candidates = stream.Streams
            .OrderBy(item => item.Cdn.Equals(preferred, StringComparison.OrdinalIgnoreCase) ? -1 : CdnPriority(item.Cdn))
            .ToArray();
        foreach (var candidate in candidates)
        {
            var remoteUrl = BuildPlaylistUrl(candidate);
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, remoteUrl);
                request.Headers.Referrer = new Uri($"https://www.huya.com/{stream.Room}");
                using var response = await _client.SendAsync(request, cancellationToken);
                response.EnsureSuccessStatusCode();
                lock (_preferredCdnLock) _preferredCdn[stream.Room] = candidate.Cdn;
                return (await response.Content.ReadAsStringAsync(cancellationToken), remoteUrl);
            }
            catch (HttpRequestException error)
            {
                lastError = error;
            }
        }
        throw new HttpRequestException("虎牙直播流暂时不可用，请稍后重试", lastError);
    }

    internal static HuyaResolvedStream ParsePage(string room, string html)
    {
        var match = StreamJsonRegex().Match(html ?? "");
        if (!match.Success) throw new InvalidOperationException("虎牙房间不存在、未开播或页面结构已经变化");
        using var document = JsonDocument.Parse(match.Groups[1].Value + "}");
        var root = document.RootElement.GetProperty("data")[0];
        var liveInfo = root.GetProperty("gameLiveInfo");
        var streamList = root.GetProperty("gameStreamInfoList");
        if (streamList.GetArrayLength() == 0) throw new InvalidOperationException("虎牙直播间当前未开播");

        var streams = new List<HuyaCdnStream>();
        foreach (var selected in streamList.EnumerateArray())
        {
            var hlsBase = Text(selected, "sHlsUrl").Replace("http://", "https://", StringComparison.OrdinalIgnoreCase);
            var streamName = Text(selected, "sStreamName");
            var suffix = Text(selected, "sHlsUrlSuffix");
            var antiCode = Text(selected, "sFlvAntiCode");
            if (!Uri.TryCreate(hlsBase, UriKind.Absolute, out _) || streamName.Length == 0
                || suffix.Length == 0 || antiCode.Length == 0)
            {
                continue;
            }
            streams.Add(new HuyaCdnStream(
                Text(selected, "sCdnType"),
                hlsBase.TrimEnd('/'),
                streamName,
                suffix,
                antiCode));
        }
        if (streams.Count == 0) throw new InvalidOperationException("虎牙没有返回可播放的 HLS 直播流");

        return new HuyaResolvedStream(
            NormalizeRoom(room),
            Text(liveInfo, "introduction"),
            Text(liveInfo, "nick"),
            streams.OrderBy(item => CdnPriority(item.Cdn)).ToArray());
    }

    internal static Uri BuildPlaylistUrl(HuyaCdnStream stream)
    {
        var query = ParseQuery(stream.AntiCode);
        if (!query.TryGetValue("fm", out var encodedFormat)
            || !query.TryGetValue("ctype", out var contentType)
            || !query.TryGetValue("fs", out var sourceType))
        {
            throw new InvalidOperationException("虎牙直播签名参数不完整");
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var uid = 1_400_000_000_000L + RandomNumberGenerator.GetInt32(0, 9_999_999);
        var sequence = uid + now;
        var wsTime = ((now + 110_624) / 1000).ToString("x");
        var uuid = (uint)(((ulong)(now % 10_000_000_000L) * 1000UL
            + (uint)RandomNumberGenerator.GetInt32(0, 1000)) % uint.MaxValue);
        var format = Encoding.UTF8.GetString(Convert.FromBase64String(WebUtility.UrlDecode(encodedFormat)));
        var prefix = format.Split('_', 2)[0];
        var innerHash = Md5Hex($"{sequence}|{contentType}|100");
        var secret = Md5Hex($"{prefix}_{uid}_{stream.StreamName}_{innerHash}_{wsTime}");
        var antiCode = string.Join('&', new[]
        {
            $"wsSecret={secret}",
            $"wsTime={wsTime}",
            $"seqid={sequence}",
            $"ctype={Uri.EscapeDataString(contentType)}",
            "ver=1",
            $"fs={Uri.EscapeDataString(sourceType)}",
            $"uuid={uuid}",
            $"u={uid}",
            "t=100",
            "sv=2403051612",
            $"sdk_sid={now}",
            "codec=264",
            "ratio=2000"
        });
        return new Uri($"{stream.HlsBase}/{Uri.EscapeDataString(stream.StreamName)}.{stream.HlsSuffix}?{antiCode}");
    }

    internal static string NormalizeRoom(string value)
    {
        var trimmed = (value ?? "").Trim();
        var match = HuyaRoomRegex().Match(trimmed);
        var candidate = match.Success ? match.Groups[1].Value : trimmed;
        if (!SafeRoomRegex().IsMatch(candidate)) throw new InvalidOperationException("虎牙房间号格式不正确");
        return candidate;
    }

    private static Dictionary<string, string> ParseQuery(string value)
    {
        return (value ?? "")
            .TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Split('=', 2))
            .Where(parts => parts.Length == 2)
            .GroupBy(parts => WebUtility.UrlDecode(parts[0]), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => WebUtility.UrlDecode(group.First()[1]), StringComparer.OrdinalIgnoreCase);
    }

    private static string Text(JsonElement element, string name)
    {
        return element.TryGetProperty(name, out var value) ? value.ToString().Trim() : "";
    }

    private static string Md5Hex(string value)
    {
        return Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
    }

    public void Dispose() => _client.Dispose();

    private static int CdnPriority(string cdn)
    {
        return cdn.ToUpperInvariant() switch
        {
            "AL13" => 0,
            "TX15" => 1,
            "HW16" => 2,
            "HS" => 3,
            "HS24" => 4,
            "HY" => 5,
            "TX" => 6,
            "AL" => 7,
            "HW" => 8,
            "WS" => 9,
            _ => 20
        };
    }

    [GeneratedRegex(@"stream:\s*(\{""data"".*?),""iWebDefaultBitRate""", RegexOptions.Singleline)]
    private static partial Regex StreamJsonRegex();

    [GeneratedRegex(@"(?:https?://)?(?:[^/]+\.)?huya\.com/(?:iframe/)?([^/?#]+)", RegexOptions.IgnoreCase)]
    private static partial Regex HuyaRoomRegex();

    [GeneratedRegex(@"^[0-9A-Za-z_-]{2,40}$")]
    private static partial Regex SafeRoomRegex();
}
