using System.Net;
using System.Text.RegularExpressions;

namespace DeskFrame.Host.Sources;

internal static class BaoziChapterParser
{
    private static readonly Regex ChapterPattern = new(
        "<a\\b(?=[^>]*\\bclass=\"[^\"]*\\bcomics-chapters__item\\b[^\"]*\")(?=[^>]*\\bhref=\"(?<href>/user/page_direct\\?[^\"]+)\")[^>]*>.*?<span[^>]*>(?<title>.*?)</span>.*?</a>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled,
        TimeSpan.FromSeconds(3));

    private static readonly Regex TagPattern = new(
        "<[^>]+>",
        RegexOptions.Compiled,
        TimeSpan.FromSeconds(1));

    internal static IReadOnlyList<MangaChapter> Parse(string html)
    {
        var chapters = new List<MangaChapter>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (Match match in ChapterPattern.Matches(html ?? ""))
        {
            var id = Decode(match.Groups["href"].Value);
            var title = CleanText(match.Groups["title"].Value);
            if (string.IsNullOrWhiteSpace(id) || !seenIds.Add(id)) continue;

            chapters.Add(new MangaChapter(
                id,
                title,
                "包子漫画",
                Number: null,
                Part: 0,
                Sequence: chapters.Count));
        }

        return chapters;
    }

    private static string CleanText(string value) =>
        Regex.Replace(TagPattern.Replace(Decode(value), " "), "\\s+", " ").Trim();

    private static string Decode(string value) => WebUtility.HtmlDecode(value ?? "");
}
