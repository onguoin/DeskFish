(function exposeNovelProviders(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeskFishNovelProviders = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (root) => {
  const ATOM_NAMESPACE = "http://www.w3.org/2005/Atom";
  const GUTENBERG_SOURCE = {
    id: "gutenberg-direct",
    name: "Project Gutenberg · 官方 OPDS 直连",
    language: "多语言",
    description: "不依赖 DeskFish.exe，直接读取 Project Gutenberg 官方 OPDS 公版书目录。",
    direct: true
  };
  const WIKISOURCE_ZH = {
    id: "wikisource-zh",
    name: "中文维基文库 · 官方 API",
    language: "中文",
    description: "通过中文维基文库官方 MediaWiki API 搜索公版及自由许可文本。",
    direct: true,
    host: "zh.wikisource.org"
  };
  const WIKISOURCE_EN = {
    id: "wikisource-en",
    name: "English Wikisource · Official API",
    language: "English",
    description: "Search public-domain and freely licensed works through the official MediaWiki API.",
    direct: true,
    host: "en.wikisource.org"
  };
  const sources = Object.freeze([GUTENBERG_SOURCE, WIKISOURCE_ZH, WIKISOURCE_EN]);
  const bookCache = new Map();

  function sourceById(id) {
    return sources.find((source) => source.id === id) || null;
  }

  async function responseText(url, signal) {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`免费书源返回 ${response.status}`);
    return response.text();
  }

  async function responseJson(url, signal) {
    const response = await fetch(url, { signal, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.info || `免费书源返回 ${response.status}`);
    }
    return payload;
  }

  function xmlDocument(value) {
    const parser = new DOMParser();
    const document = parser.parseFromString(value, "application/xml");
    if (document.querySelector("parsererror")) throw new Error("官方 OPDS 返回的目录格式无效");
    return document;
  }

  function atomText(parent, localName) {
    return parent.getElementsByTagNameNS(ATOM_NAMESPACE, localName)[0]?.textContent?.trim() || "";
  }

  function trimGutenbergBoilerplate(value) {
    let text = String(value || "").replace(/\0/g, "");
    const start = /\*\*\*\s*START OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*\*\*/i.exec(text);
    if (start) text = text.slice(start.index + start[0].length);
    const end = /\*\*\*\s*END OF (?:THIS|THE) PROJECT GUTENBERG EBOOK[^\r\n]*\*\*\*/i.exec(text);
    if (end) text = text.slice(0, end.index);
    return text.trim();
  }

  function splitReadableText(value) {
    const parser = root.DeskFishEbookChapterParser;
    if (!parser?.isChapterHeading) throw new Error("电子书章节识别器没有加载");
    const parts = [];
    const headings = [];
    let offset = 0;
    for (const rawLine of String(value || "").split(/\r\n|\n|\r/)) {
      const line = rawLine.replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
      if (!line) continue;
      if (parts.length) {
        parts.push(" ");
        offset += 1;
      }
      if (parser.isChapterHeading(line)) headings.push({ title: line, offset });
      parts.push(line);
      offset += Array.from(line).length;
    }
    if (!headings.length) headings.push({ title: "全文", offset: 0 });
    else if (headings[0].offset > 0) headings.unshift({ title: "开头", offset: 0 });
    const chapters = headings.map((heading, index) => {
      const nextOffset = headings[index + 1]?.offset ?? offset;
      return {
        id: `chapter:${index}`,
        title: heading.title,
        offset: heading.offset,
        length: Math.max(0, nextOffset - heading.offset),
        sequence: index
      };
    });
    return { text: parts.join(""), chapters };
  }

  function normalizeReadableText(value) {
    return String(value || "")
      .split(/\r\n|\n|\r/)
      .map((line) => line.replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
  }

  function chaptersForTitles(text, titles) {
    const chapters = [];
    let searchFrom = 0;
    for (const rawTitle of titles) {
      const title = String(rawTitle || "").replace(/\s+/g, " ").trim();
      if (!title) continue;
      const codeUnitOffset = text.indexOf(title, searchFrom);
      if (codeUnitOffset < 0) continue;
      const offset = Array.from(text.slice(0, codeUnitOffset)).length;
      chapters.push({ id: `section:${chapters.length}`, title, offset, length: 0, sequence: chapters.length });
      searchFrom = codeUnitOffset + title.length;
    }
    if (!chapters.length) return [{ id: "full", title: "全文", offset: 0, length: Array.from(text).length, sequence: 0 }];
    const totalLength = Array.from(text).length;
    return chapters.map((chapter, index) => ({
      ...chapter,
      length: Math.max(0, (chapters[index + 1]?.offset ?? totalLength) - chapter.offset)
    }));
  }

  function buildSegmentBook(segments) {
    const parts = [];
    const chapters = [];
    let offset = 0;
    segments.forEach((segment, index) => {
      const title = String(segment.title || `第 ${index + 1} 章`).replace(/\s+/g, " ").trim();
      const body = String(segment.text || "").replace(/\s+/g, " ").trim();
      if (parts.length) {
        parts.push(" ");
        offset += 1;
      }
      const chapterOffset = offset;
      const content = [title, body].filter(Boolean).join(" ");
      parts.push(content);
      offset += Array.from(content).length;
      chapters.push({
        id: String(segment.id || `chapter:${index}`),
        title: title || "未命名章节",
        offset: chapterOffset,
        length: offset - chapterOffset,
        sequence: index
      });
    });
    return { text: parts.join(""), chapters };
  }

  function cacheBook(key, book) {
    bookCache.delete(key);
    bookCache.set(key, book);
    while (bookCache.size > 2) bookCache.delete(bookCache.keys().next().value);
    return book;
  }

  async function searchGutenberg(query, page, signal) {
    const startIndex = (Math.max(1, page) - 1) * 25 + 1;
    const url = `https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(query)}&start_index=${startIndex}`;
    const document = xmlDocument(await responseText(url, signal));
    return Array.from(document.getElementsByTagNameNS(ATOM_NAMESPACE, "entry")).flatMap((entry) => {
      const idMatch = atomText(entry, "id").match(/\/ebooks\/(\d+)\.opds(?:$|[?#])/i);
      const title = atomText(entry, "title");
      if (!idMatch || !title) return [];
      return [{
        id: idMatch[1],
        title,
        author: atomText(entry, "content") || "佚名",
        cover: "",
        details: "Project Gutenberg · 官方公版书"
      }];
    });
  }

  async function downloadGutenbergBook(id, signal) {
    const cacheKey = `${GUTENBERG_SOURCE.id}:${id}`;
    if (bookCache.has(cacheKey)) return bookCache.get(cacheKey);
    const detailXml = await responseText(`https://www.gutenberg.org/ebooks/${encodeURIComponent(id)}.opds`, signal);
    const document = xmlDocument(detailXml);
    const entry = document.getElementsByTagNameNS(ATOM_NAMESPACE, "entry")[0];
    if (!entry) throw new Error("Project Gutenberg 没有返回书籍详情");
    const candidates = [
      `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
      `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
      `https://www.gutenberg.org/files/${id}/${id}.txt`
    ];
    let rawText = "";
    for (const url of candidates) {
      try {
        rawText = await responseText(url, signal);
        if (rawText) break;
      } catch (error) {
        if (error.name === "AbortError") throw error;
      }
    }
    if (!rawText) throw new Error("Project Gutenberg 没有提供可读取的纯文本文件");
    const split = splitReadableText(trimGutenbergBoilerplate(rawText));
    const title = atomText(entry, "title") || `Project Gutenberg #${id}`;
    const author = atomText(entry, "content") || "佚名";
    return cacheBook(cacheKey, {
      source: GUTENBERG_SOURCE,
      id: String(id),
      title,
      author,
      cover: "",
      description: `${author} · Project Gutenberg 官方公版书`,
      text: split.text,
      chapters: split.chapters
    });
  }

  function mediaWikiUrl(source, parameters) {
    const query = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...parameters });
    return `https://${source.host}/w/api.php?${query}`;
  }

  function plainSnippet(value) {
    const document = new DOMParser().parseFromString(`<body>${String(value || "")}</body>`, "text/html");
    return document.body.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  function htmlToPlainText(value) {
    const document = new DOMParser().parseFromString(String(value || ""), "text/html");
    document.querySelectorAll("script,style,noscript,.mw-editsection,.navbox,.metadata,.noprint").forEach((node) => node.remove());
    document.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    document.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,div").forEach((node) => node.append("\n"));
    return document.body.textContent?.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() || "";
  }

  async function searchWikisource(source, query, signal) {
    const payload = await responseJson(mediaWikiUrl(source, {
      action: "query",
      list: "search",
      srsearch: query,
      srnamespace: "0",
      srlimit: "20",
      srprop: "snippet"
    }), signal);
    const items = (payload.query?.search || []).map((item) => ({
      id: item.title,
      title: item.title,
      author: source.language,
      cover: "",
      details: plainSnippet(item.snippet) || source.name
    }));
    const works = items.filter((item) => !item.title.includes("/"));
    return works.length ? works : items;
  }

  async function detailsWikisource(source, id, signal) {
    const payload = await responseJson(mediaWikiUrl(source, {
      action: "parse",
      page: id,
      prop: "links|sections|displaytitle"
    }), signal);
    const parsed = payload.parse;
    if (!parsed) throw new Error("Wikisource 没有返回页面目录");
    const pageTitle = parsed.title || id;
    const prefix = `${pageTitle}/`;
    const seen = new Set();
    const subpages = (parsed.links || []).filter((link) => {
      const title = String(link.title || "");
      if (link.ns !== 0 || !title.startsWith(prefix) || seen.has(title)) return false;
      seen.add(title);
      return true;
    });
    const chapterCollator = new Intl.Collator(source.language.startsWith("English") ? "en" : "zh", {
      numeric: true,
      sensitivity: "base"
    });
    subpages.sort((left, right) => chapterCollator.compare(left.title.slice(prefix.length), right.title.slice(prefix.length)));
    let mode = "full";
    let chapters = [];
    if (subpages.length) {
      mode = "subpages";
      chapters = subpages.map((link, index) => ({
        id: `page:${link.title}`,
        title: link.title.slice(prefix.length) || link.title,
        offset: 0,
        length: 0,
        sequence: index,
        pageTitle: link.title
      }));
    } else if (Array.isArray(parsed.sections) && parsed.sections.length) {
      mode = "sections";
      chapters = parsed.sections.map((section, index) => ({
        id: `section:${section.index}`,
        title: plainSnippet(section.line) || `第 ${index + 1} 节`,
        offset: 0,
        length: 0,
        sequence: index
      }));
    } else {
      chapters = [{ id: "full", title: "全文", offset: 0, length: 0, sequence: 0 }];
    }
    return {
      id: pageTitle,
      title: plainSnippet(parsed.displaytitle) || pageTitle,
      author: source.language,
      cover: "",
      description: `${source.name} · 公版或自由许可文本`,
      chapters,
      providerData: { mode, pageTitle, sectionTitles: mode === "sections" ? chapters.map((chapter) => chapter.title) : [] }
    };
  }

  async function fetchWikiExtracts(source, titles, signal) {
    const segments = [];
    for (let start = 0; start < titles.length; start += 20) {
      const requested = titles.slice(start, start + 20);
      const payload = await responseJson(mediaWikiUrl(source, {
        action: "query",
        prop: "extracts",
        explaintext: "1",
        exsectionformat: "plain",
        redirects: "1",
        titles: requested.join("|")
      }), signal);
      const pages = payload.query?.pages || [];
      const byTitle = new Map(pages.map((page) => [page.title, page.extract || ""]));
      const normalized = new Map((payload.query?.normalized || []).map((entry) => [entry.from, entry.to]));
      const redirects = new Map((payload.query?.redirects || []).map((entry) => [entry.from, entry.to]));
      requested.forEach((title) => {
        const normalizedTitle = normalized.get(title) || title;
        const resolvedTitle = redirects.get(normalizedTitle) || normalizedTitle;
        segments.push({ title, text: byTitle.get(resolvedTitle) || byTitle.get(normalizedTitle) || "" });
      });
    }
    const missing = segments.map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => Array.from(segment.text.trim()).length < 40);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (cursor < missing.length) {
        const current = missing[cursor];
        cursor += 1;
        const payload = await responseJson(mediaWikiUrl(source, {
          action: "parse",
          page: current.segment.title,
          prop: "text"
        }), signal);
        segments[current.index].text = htmlToPlainText(payload.parse?.text || "");
      }
    });
    await Promise.all(workers);
    return segments;
  }

  async function downloadWikisourceBook(source, novel, signal) {
    const cacheKey = `${source.id}:${novel.id}`;
    if (bookCache.has(cacheKey)) return bookCache.get(cacheKey);
    const mode = novel.providerData?.mode || "full";
    let split;
    if (mode === "subpages") {
      const titles = novel.chapters.map((chapter) => chapter.pageTitle || chapter.id.replace(/^page:/, ""));
      const segments = await fetchWikiExtracts(source, titles, signal);
      const titledSegments = segments.map((segment, index) => ({
        id: novel.chapters[index]?.id,
        title: novel.chapters[index]?.title || segment.title,
        text: segment.text
      }));
      split = buildSegmentBook(titledSegments);
    } else {
      const payload = await responseJson(mediaWikiUrl(source, {
        action: "parse",
        page: novel.providerData?.pageTitle || novel.id,
        prop: "text"
      }), signal);
      const plainText = htmlToPlainText(payload.parse?.text || "");
      if (mode === "sections") {
        const text = normalizeReadableText(plainText);
        split = { text, chapters: chaptersForTitles(text, novel.providerData?.sectionTitles || novel.chapters.map((chapter) => chapter.title)) };
      } else {
        split = splitReadableText(plainText);
      }
    }
    if (!split.text) throw new Error("Wikisource 页面没有可读取的正文");
    return cacheBook(cacheKey, {
      source,
      id: novel.id,
      title: novel.title,
      author: novel.author,
      cover: "",
      description: novel.description,
      text: split.text,
      chapters: split.chapters
    });
  }

  async function search(sourceId, query, page, signal) {
    const source = sourceById(sourceId);
    if (!source) throw new Error("在线小说接口不存在");
    if (source.id === GUTENBERG_SOURCE.id) return searchGutenberg(query, page, signal);
    return searchWikisource(source, query, signal);
  }

  async function details(sourceId, item, signal) {
    const source = sourceById(sourceId);
    if (!source) throw new Error("在线小说接口不存在");
    if (source.id === GUTENBERG_SOURCE.id) {
      const book = await downloadGutenbergBook(item.id, signal);
      return { ...book, text: undefined };
    }
    return detailsWikisource(source, item.id, signal);
  }

  async function book(sourceId, novel, signal) {
    const source = sourceById(sourceId);
    if (!source) throw new Error("在线小说接口不存在");
    if (source.id === GUTENBERG_SOURCE.id) return downloadGutenbergBook(novel.id, signal);
    return downloadWikisourceBook(source, novel, signal);
  }

  return {
    sources,
    sourceById,
    search,
    details,
    book,
    trimGutenbergBoilerplate,
    splitReadableText,
    buildSegmentBook,
    normalizeReadableText,
    chaptersForTitles
  };
});
