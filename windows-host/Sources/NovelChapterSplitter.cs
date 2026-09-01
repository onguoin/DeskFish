using System.Text;
using System.Text.RegularExpressions;

namespace DeskFrame.Host.Sources;

internal sealed record SplitNovel(string Text, IReadOnlyList<NovelChapter> Chapters);

internal static partial class NovelChapterSplitter
{
    private const int MaxHeadingRunes = 80;

    public static SplitNovel Split(string source)
    {
        var text = new StringBuilder(Math.Max(16, source?.Length ?? 0));
        var headings = new List<(string Title, int Offset)>();
        var offset = 0;

        foreach (var rawLine in LineBreak().Split(source ?? ""))
        {
            var line = Whitespace().Replace(rawLine.Trim().TrimStart('\uFEFF'), " ");
            if (line.Length == 0) continue;
            if (text.Length > 0)
            {
                text.Append(' ');
                offset += 1;
            }
            if (IsHeading(line)) headings.Add((line, offset));
            text.Append(line);
            offset += line.EnumerateRunes().Count();
        }

        if (headings.Count == 0) headings.Add(("全文", 0));
        else if (headings[0].Offset > 0) headings.Insert(0, ("开头", 0));

        var chapters = headings.Select((heading, index) =>
        {
            var next = index + 1 < headings.Count ? headings[index + 1].Offset : offset;
            return new NovelChapter(
                $"chapter:{index}",
                heading.Title,
                heading.Offset,
                Math.Max(0, next - heading.Offset),
                index);
        }).ToArray();
        return new SplitNovel(text.ToString(), chapters);
    }

    internal static bool IsHeading(string value)
    {
        var title = Whitespace().Replace(value ?? "", " ").Trim();
        if (title.Length == 0 || title.EnumerateRunes().Count() > MaxHeadingRunes) return false;
        return ChineseNumberedHeading().IsMatch(title)
            || ChineseVolumeHeading().IsMatch(title)
            || ChineseNamedHeading().IsMatch(title)
            || ChineseExtraHeading().IsMatch(title)
            || EnglishNumberedHeading().IsMatch(title)
            || EnglishNamedHeading().IsMatch(title);
    }

    [GeneratedRegex(@"\r\n|\n|\r", RegexOptions.CultureInvariant)]
    private static partial Regex LineBreak();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex Whitespace();

    [GeneratedRegex(@"^(?:正文\s*)?第\s*[0-9零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟两兩]+\s*[章回节節卷部篇集幕](?:\s*[-—_:：、.．]?\s*.{0,48})?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ChineseNumberedHeading();

    [GeneratedRegex(@"^(?:卷|篇|部)\s*[0-9零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟两兩]+(?:\s*[-—_:：、.．]?\s*.{0,48})?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ChineseVolumeHeading();

    [GeneratedRegex(@"^(?:序章|楔子|引子|前言|序言|正文|终章|終章|尾声|尾聲|后记|後記|完结感言|完結感言)(?:(?:\s*[-—_:：、.．]\s*|\s+).{1,48})?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ChineseNamedHeading();

    [GeneratedRegex(@"^(?:番外|外传|外傳|特别篇|特別篇|附录|附錄)(?:(?:\s*[-—_:：、.．]\s*|\s+).{1,48})?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ChineseExtraHeading();

    [GeneratedRegex(@"^(?:chapter|book|part)\s+(?:\d+|[ivxlcdm]+)(?:\s*[-—_:：.．]?\s*.{0,48})?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EnglishNumberedHeading();

    [GeneratedRegex(@"^(?:prologue|epilogue|preface|introduction)(?:\s*[-—_:：.．]?\s*.{0,48})?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EnglishNamedHeading();
}
