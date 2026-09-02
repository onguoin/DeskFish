namespace DeskFrame.Host.Sources;

internal static class BaoziImageFallback
{
    private static readonly string[] FallbackHosts =
    [
        "static-tw.baozimh.com",
        "s1.baozimh.com",
        "s2.baozimh.com"
    ];

    internal static IReadOnlyList<Uri> Candidates(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var original)) return [];
        var candidates = new List<Uri> { original };
        if (!original.AbsolutePath.StartsWith("/scomic/", StringComparison.OrdinalIgnoreCase)
            || (!original.Host.EndsWith(".bzcdn.net", StringComparison.OrdinalIgnoreCase)
                && !original.Host.EndsWith(".baozimh.com", StringComparison.OrdinalIgnoreCase)))
        {
            return candidates;
        }

        foreach (var host in FallbackHosts)
        {
            if (original.Host.Equals(host, StringComparison.OrdinalIgnoreCase)) continue;
            var builder = new UriBuilder(original) { Scheme = Uri.UriSchemeHttps, Port = -1, Host = host };
            if (candidates.All(item => !item.AbsoluteUri.Equals(builder.Uri.AbsoluteUri, StringComparison.OrdinalIgnoreCase)))
            {
                candidates.Add(builder.Uri);
            }
        }
        return candidates;
    }
}
