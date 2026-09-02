using DeskFrame.Host.Sources;
using System.Text;

const string html = """
  <section>
    <a class="comics-chapters__item" href="/user/page_direct?id=event-300"><span>300話紀念活動第一彈！</span></a>
    <a href="/user/page_direct?id=celebration-100" class="comics-chapters__item"><span>終極斗羅100話慶典！</span></a>
    <a class="comics-chapters__item featured" href="/user/page_direct?id=qq-extra"><span>QQ飛車特別番外篇</span></a>
    <a href="/user/page_direct?id=princess-a" class="comics-chapters__item"><span>尊敬的金龍公主殿下</span></a>
    <a href="/user/page_direct?id=princess-b" class="comics-chapters__item"><span>尊敬的金龍公主殿下</span></a>
    <a href="/user/page_direct?id=planet" class="comics-chapters__item"><span>罪惡星球</span></a>
    <a href="/user/page_direct?id=success" class="comics-chapters__item"><span>罪惡得手</span></a>
    <a href="/user/page_direct?id=blank" class="comics-chapters__item"><span></span></a>
    <a href="/user/page_direct?id=planet" class="comics-chapters__item"><span>同 ID 的重复条目不会出现</span></a>
  </section>
  """;

var chapters = BaoziChapterParser.Parse(html);
var expected = new[]
{
    ("/user/page_direct?id=event-300", "300話紀念活動第一彈！"),
    ("/user/page_direct?id=celebration-100", "終極斗羅100話慶典！"),
    ("/user/page_direct?id=qq-extra", "QQ飛車特別番外篇"),
    ("/user/page_direct?id=princess-a", "尊敬的金龍公主殿下"),
    ("/user/page_direct?id=princess-b", "尊敬的金龍公主殿下"),
    ("/user/page_direct?id=planet", "罪惡星球"),
    ("/user/page_direct?id=success", "罪惡得手"),
    ("/user/page_direct?id=blank", "")
};

if (chapters.Count != expected.Length) Fail($"期望 {expected.Length} 个章节，实际 {chapters.Count} 个");
for (var index = 0; index < expected.Length; index++)
{
    var chapter = chapters[index];
    if (chapter.Id != expected[index].Item1) Fail($"第 {index + 1} 项 ID 顺序错误：{chapter.Id}");
    if (chapter.Title != expected[index].Item2) Fail($"第 {index + 1} 项标题被修改：{chapter.Title}");
    if (chapter.Number is not null || chapter.Part != 0) Fail($"第 {index + 1} 项不应猜测章节号或上下篇");
    if (chapter.Sequence != index) Fail($"第 {index + 1} 项原始序号错误：{chapter.Sequence}");
}

Console.WriteLine("Baozi chapter order regression: PASS");
const string catalogHtml = """
  <a href="/user/page_direct?id=latest" class="comics-chapters__item"><span>最新预览</span></a>
  <div id="chapter-items">
    <a href="/user/page_direct?chapter_slot=0" class="comics-chapters__item"><span>序章</span></a>
    <a href="/user/page_direct?chapter_slot=1" class="comics-chapters__item"><span>第一话</span></a>
  </div>
  <button id="button_show_all_chatper">查看全部</button>
  """;
var catalogChapters = BaoziChapterParser.Parse(catalogHtml);
if (!catalogChapters.Select(chapter => chapter.Title).SequenceEqual(new[] { "序章", "第一话" }))
    Fail("包子章节解析混入了目录外的最新预览项");
var imageCandidates = BaoziImageFallback.Candidates("https://s2.bzcdn.net/scomic/example/0/1/1.jpg");
if (imageCandidates.Count < 4 || imageCandidates[1].Host != "static-tw.baozimh.com"
    || imageCandidates.Select(item => item.AbsolutePath).Distinct().Count() != 1)
    Fail("包子图片备用 CDN 列表错误");
Console.WriteLine("Baozi catalog scope and image fallback regression: PASS");
var splitNovel = NovelChapterSplitter.Split("书名\n作者\n第一章 开始\n正文。\n第二章 继续\n内容。\n番外 小记\n结束。");
var splitTitles = splitNovel.Chapters.Select(chapter => chapter.Title).ToArray();
var expectedSplitTitles = new[] { "开头", "第一章 开始", "第二章 继续", "番外 小记" };
if (!splitTitles.SequenceEqual(expectedSplitTitles)) Fail($"小说自动分章错误：{string.Join(" / ", splitTitles)}");
if (splitNovel.Chapters.Select(chapter => chapter.Sequence).Where((sequence, index) => sequence != index).Any()) Fail("小说章节原始顺序被改变");
if (splitNovel.Chapters.Any(chapter => chapter.Offset < 0 || chapter.Offset >= splitNovel.Text.EnumerateRunes().Count())) Fail("小说章节偏移无效");
Console.WriteLine("Novel chapter splitter regression: PASS");

const string qidianSearchHtml = """
<script id="vite-plugin-ssr_pageContext" type="application/json">
{"pageContext":{"pageProps":{"pageData":{"bookInfo":{"records":[
  {"bid":1115277,"bName":"斗罗大陆","bAuth":"唐家三少","imgUrl":"//bookcover.example/1115277/180","state":"完结","cnt":"299.62万字","lastChapterName":"大结局"},
  {"bid":1115277,"bName":"重复项","bAuth":"唐家三少"}
]}}}}}
</script>
""";
var qidianSearch = QidianNovelSource.ParseSearchPage(qidianSearchHtml);
if (qidianSearch.Count != 1 || qidianSearch[0].Id != "1115277" || qidianSearch[0].Title != "斗罗大陆") Fail("起点搜索解析或去重错误");
if (qidianSearch[0].Author != "唐家三少" || !qidianSearch[0].Cover.StartsWith("https://", StringComparison.Ordinal)) Fail("起点搜索元数据错误");

const string qidianCatalogHtml = """
<script id="vite-plugin-ssr_pageContext" type="application/json">
{"pageContext":{"pageProps":{"pageData":{"bookId":1115277,"bookName":"斗罗大陆","authorInfo":{"authorName":"唐家三少"},"vs":[
  {"vN":"作品相关","cs":[{"id":22087045,"cN":"作者公告","cnt":393,"sS":1}]},
  {"vN":"第一集 斗罗世界","cs":[{"id":22058859,"cN":"引子 穿越的唐家三少","cnt":3261,"sS":1},{"id":22525237,"cN":"第二十五章 器武魂的威力（上）","cnt":3000,"sS":0}]}
]}}}}
</script>
""";
var qidianCatalog = QidianNovelSource.ParseCatalogPage(qidianCatalogHtml, "1115277");
if (qidianCatalog.Chapters.Count != 3) Fail("起点目录数量错误");
if (!qidianCatalog.Chapters.Select(chapter => chapter.Title).SequenceEqual(new[] { "作者公告", "引子 穿越的唐家三少", "第二十五章 器武魂的威力（上）" })) Fail("起点目录原始顺序或标题被修改");
if (!qidianCatalog.Chapters[0].IsReadable || !qidianCatalog.Chapters[1].IsReadable || qidianCatalog.Chapters[2].IsReadable) Fail("起点公开/付费章节标记错误");

const string qidianChapterHtml = """
<script id="vite-plugin-ssr_pageContext" type="application/json">
{"pageContext":{"pageProps":{"pageData":{"bookInfo":{"bookId":1115277},"chapterInfo":{"chapterId":22058859,"vipStatus":0,"content":"<p>第一段 &amp; 内容<p>第二段<br>换行"}}}}}
</script>
""";
var qidianChapter = QidianNovelSource.ParseChapterPage(qidianChapterHtml, "1115277", "22058859");
if (qidianChapter != "第一段 & 内容\n第二段\n换行") Fail($"起点章节正文清理错误：{qidianChapter}");
Console.WriteLine("Qidian public-page parser regression: PASS");

var huyaFormat = Convert.ToBase64String(Encoding.UTF8.GetBytes("DeskFishPrefix_$0_$1_$2_$3"));
var huyaHtml = $$"""
<script>window.test = { stream: {"data":[{"gameLiveInfo":{"introduction":"测试直播","nick":"测试主播"},"gameStreamInfoList":[{"sCdnType":"AL","sHlsUrl":"http://al.hls.huya.com/src","sStreamName":"al-stream","sHlsUrlSuffix":"m3u8","sFlvAntiCode":"fm={{Uri.EscapeDataString(huyaFormat)}}&ctype=huya_live&fs=bgct"},{"sCdnType":"TX","sHlsUrl":"http://tx.hls.huya.com/src","sStreamName":"tx-stream","sHlsUrlSuffix":"m3u8","sFlvAntiCode":"fm={{Uri.EscapeDataString(huyaFormat)}}&ctype=huya_live&fs=bgct"}] }],"iWebDefaultBitRate":0 };</script>
""";
var huyaParsed = HuyaLiveSource.ParsePage("660000", huyaHtml);
if (huyaParsed.Title != "测试直播" || huyaParsed.Anchor != "测试主播" || huyaParsed.Streams.Count != 2) Fail("虎牙直播页或多 CDN 列表解析错误");
var huyaPlaylist = HuyaLiveSource.BuildPlaylistUrl(huyaParsed.Streams[0]);
if (huyaPlaylist.Scheme != "https" || !huyaPlaylist.AbsoluteUri.Contains("wsSecret=", StringComparison.Ordinal)
    || !huyaPlaylist.AbsoluteUri.Contains("codec=264", StringComparison.Ordinal)) Fail("虎牙 HLS 动态签名生成错误");
Console.WriteLine("Huya live parser/signature regression: PASS");
if (args.Contains("--live", StringComparer.OrdinalIgnoreCase))
{
    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36");
    var liveHtml = await client.GetStringAsync("https://www.baozimh.com/comic/douluodalu4zhongjidouluo-shenman");
    var liveChapters = BaoziChapterParser.Parse(liveHtml);
    if (liveChapters.Count < 100) Fail($"线上目标漫画只解析到 {liveChapters.Count} 项，疑似页面结构变化");
    foreach (var title in new[] { "300話紀念活動第一彈！", "終極斗羅100話慶典！", "QQ飛車特別番外篇", "尊敬的金龍公主殿下", "罪惡星球", "罪惡得手" })
    {
        var liveIndex = liveChapters.ToList().FindIndex(chapter => chapter.Title == title);
        if (liveIndex < 0) Fail($"线上章节列表未保留：{title}");
        Console.WriteLine($"LIVE {liveIndex + 1:D3} {title}");
    }
    Console.WriteLine($"Baozi live target regression: PASS ({liveChapters.Count} unique chapter IDs)");
}
if (args.Contains("--novel-live", StringComparer.OrdinalIgnoreCase))
{
    using var source = new GutenbergOpdsNovelSource();
    var books = await source.SearchAsync("alice wonderland", 1, CancellationToken.None);
    var alice = books.FirstOrDefault(book => book.Id == "11") ?? throw new InvalidOperationException("官方 OPDS 搜索未返回 Gutenberg #11");
    var book = await source.GetBookAsync(alice.Id, CancellationToken.None);
    if (!book.Title.Contains("Alice", StringComparison.OrdinalIgnoreCase)) Fail($"在线书标题异常：{book.Title}");
    if (book.Text.Contains("PROJECT GUTENBERG EBOOK", StringComparison.OrdinalIgnoreCase)) Fail("Gutenberg 首尾声明未清除");
    if (book.Chapters.Count < 5) Fail($"Alice 只识别到 {book.Chapters.Count} 章");
    Console.WriteLine($"Gutenberg official OPDS regression: PASS ({book.Chapters.Count} chapters, {book.Text.EnumerateRunes().Count():N0} characters)");
}
if (args.Contains("--qidian-live", StringComparer.OrdinalIgnoreCase))
{
    using var source = new QidianNovelSource();
    var books = await source.SearchAsync("斗罗大陆", 1, CancellationToken.None);
    var douluo = books.FirstOrDefault(book => book.Title == "斗罗大陆" && book.Author == "唐家三少")
        ?? throw new InvalidOperationException("起点官方搜索未返回《斗罗大陆》");
    var details = await source.GetDetailsAsync(douluo.Id, CancellationToken.None);
    if (details.Chapters.Count < 700) Fail($"《斗罗大陆》目录只解析到 {details.Chapters.Count} 项");
    var preview = details.Chapters.FirstOrDefault(chapter => chapter.Title.StartsWith("引子", StringComparison.Ordinal) && chapter.IsReadable)
        ?? throw new InvalidOperationException("《斗罗大陆》没有找到公开引子章节");
    var body = await source.GetChapterForTestAsync(douluo.Id, preview.Id, CancellationToken.None);
    if (body.Length < 1000 || !body.Contains("唐门", StringComparison.Ordinal)) Fail("《斗罗大陆》公开章节正文异常");
    Console.WriteLine($"Qidian official public-page regression: PASS ({details.Chapters.Count} catalog entries, {details.Chapters.Count(chapter => chapter.IsReadable)} readable)");
}
if (args.Contains("--qidian-book-live", StringComparer.OrdinalIgnoreCase))
{
    using var source = new QidianNovelSource();
    var book = await source.GetBookAsync("1115277", CancellationToken.None);
    var runeCount = book.Text.EnumerateRunes().Count();
    if (book.Chapters.Count < 140 || runeCount < 200_000) Fail($"《斗罗大陆》公开章节整本缓存结果异常：{book.Chapters.Count} 章 / {runeCount:N0} 字符");
    if (book.Chapters.Select(chapter => chapter.Sequence).Where((sequence, index) => sequence != index).Any()) Fail("《斗罗大陆》公开章节缓存顺序错误");
    Console.WriteLine($"Qidian public chapters cache regression: PASS ({book.Chapters.Count} chapters, {runeCount:N0} characters)");
}
if (args.Contains("--huya-live", StringComparer.OrdinalIgnoreCase))
{
    using var source = new HuyaLiveSource();
    var stream = await source.ResolveAsync("660000", CancellationToken.None);
    var first = await source.FetchPlaylistAsync(stream, CancellationToken.None);
    await Task.Delay(1100);
    var second = await source.FetchPlaylistAsync(stream, CancellationToken.None);
    if (!first.Playlist.StartsWith("#EXTM3U", StringComparison.Ordinal)
        || !second.Playlist.StartsWith("#EXTM3U", StringComparison.Ordinal)) Fail("虎牙 HLS 播放清单返回异常");
    if (first.RemoteUrl == second.RemoteUrl) Fail("虎牙 HLS 播放清单没有刷新动态签名");
    Console.WriteLine($"Huya live HLS regression: PASS ({stream.Anchor} · {stream.Title})");
}
return;

static void Fail(string message) => throw new InvalidOperationException(message);
