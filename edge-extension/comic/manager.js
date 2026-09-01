(() => {
  const storage = globalThis.DeskFrameComicStorage;
  const chapterList = globalThis.DeskFishComicChapterList;
  const elements = {};
  let notify = () => {};
  let opdsHistory = [];
  let currentManga = null;
  let uiState = { provider: "local", query: "", language: "zh", bridgeSourceId: "", seriesKey: "" };
  let seriesCache = {};
  const BRIDGE_ENDPOINT = "http://127.0.0.1:47653";
  const MAX_CACHED_SERIES = 8;
  const CHAPTER_ORDER_SCHEMA = 2;

  const providerNames = {
    local: "本地文件",
    mangadex: "MangaDex",
    komiic: "Komiic 漫畫",
    bridge: "DeskFish 本地源",
    komga: "Komga",
    kavita: "Kavita",
    lanraragi: "LANraragi",
    suwayomi: "Suwayomi"
  };

  const opdsExamples = {
    komga: "http://localhost:25600/opds/v1.2/catalog",
    kavita: "粘贴 Kavita 用户设置中生成的完整 OPDS 地址",
    lanraragi: "http://localhost:3000/api/opds",
    suwayomi: "http://localhost:4567/api/opds/v1.2"
  };

  function inferredProvider(selection) {
    if (!selection) return "local";
    if (selection.provider !== "opds") return selection.provider || "local";
    const label = String(selection.serverType || "").toLowerCase();
    return Object.keys(opdsExamples).find((key) => label.includes(key)) || "komga";
  }

  async function saveUiState(patch = {}) {
    uiState = { ...uiState, ...patch };
    await chrome.storage.local.set({ comicUiState: uiState });
  }

  function normalizeSeriesChapters(chapters) {
    return chapterList.normalize(chapters);
  }

  function selectionFromSeries(series, chapterIndex) {
    const chapter = series?.chapters?.[chapterIndex];
    if (!chapter) return null;
    return {
      ...(series.selectionBase || {}),
      ...(chapter.extra || {}),
      provider: series.provider,
      id: chapter.selectionId,
      title: series.title,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      seriesKey: series.key,
      chapterIndex,
      chapterCount: series.chapters.length
    };
  }

  async function rememberSeries(series) {
    const normalized = {
      ...series,
      chapters: normalizeSeriesChapters(series.chapters),
      chapterOrderSchema: CHAPTER_ORDER_SCHEMA,
      updatedAt: Date.now()
    };
    seriesCache = { ...seriesCache, [normalized.key]: normalized };
    const retained = Object.values(seriesCache)
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
      .slice(0, MAX_CACHED_SERIES);
    seriesCache = Object.fromEntries(retained.map((item) => [item.key, item]));
    await chrome.storage.local.set({
      comicSeriesCache: seriesCache,
      comicUiState: { ...uiState, seriesKey: normalized.key }
    });
    uiState = { ...uiState, seriesKey: normalized.key };
    return normalized;
  }

  async function chooseSeriesChapter(series, chapterIndex) {
    const selection = selectionFromSeries(series, chapterIndex);
    if (selection) await setSelection(selection);
  }

  async function renderSeries(series) {
    currentManga = { ...(series.meta || {}), provider: series.provider, seriesKey: series.key, title: series.title };
    elements.comicMangaBack.hidden = false;
    elements.comicMangaResults.replaceChildren();
    const indexed = series.chapters.map((chapter, index) => ({ chapter, index }));
    for (let start = 0; start < indexed.length; start += 80) {
      const fragment = document.createDocumentFragment();
      for (const { chapter, index } of indexed.slice(start, start + 80)) {
        const button = makeButton(
          "comic-result comic-chapter",
          chapter.title ?? "",
          chapter.details || `${index + 1} / ${series.chapters.length}`,
          () => void chooseSeriesChapter(series, index)
        );
        const ordinal = document.createElement("span");
        ordinal.className = "comic-chapter-ordinal";
        ordinal.textContent = chapterList.ordinal(index);
        ordinal.setAttribute("aria-label", `列表序号 ${index + 1}`);
        button.prepend(ordinal);
        fragment.append(button);
      }
      elements.comicMangaResults.append(fragment);
      if (start + 80 < indexed.length) await new Promise(requestAnimationFrame);
    }
    if (!series.chapters.length) elements.comicMangaResults.append(emptyState("这部漫画没有可读章节"));
  }

  function bindElements() {
    for (const id of [
      "comicProvider", "comicLocalPanel", "comicMangaDexPanel", "comicOpdsPanel",
      "comicArchiveInput", "comicFolderInput", "comicLocalList", "comicSelection",
      "comicSearchInput", "comicSearchButton", "comicLanguage", "comicLanguageRow", "comicMangaBack", "comicOnlineNote",
      "comicBridgeRow", "comicBridgeSource", "comicBridgeRefresh",
      "comicMangaResults", "comicOpdsUrl", "comicOpdsUsername", "comicOpdsPassword",
      "comicOpdsConnect", "comicOpdsBack", "comicOpdsResults", "comicOpdsHint"
    ]) elements[id] = document.querySelector(`#${id}`);
  }

  function textTitle(attributes = {}, fallback = "未命名漫画") {
    const title = attributes.title || {};
    return title.zh || title["zh-hk"] || title["zh-hans"] || title["zh-hant"] || title.en || title.ja || Object.values(title)[0] || fallback;
  }

  function makeButton(className, title, details, onClick, imageUrl = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      button.append(image);
    }
    const copy = document.createElement("span");
    copy.className = "comic-result-copy";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = details;
    copy.append(strong, small);
    button.append(copy);
    button.addEventListener("click", onClick);
    return button;
  }

  function emptyState(message) {
    const paragraph = document.createElement("p");
    paragraph.className = "comic-empty";
    paragraph.textContent = message;
    return paragraph;
  }

  async function setSelection(selection) {
    const nextUiState = selection.seriesKey ? { ...uiState, seriesKey: selection.seriesKey } : uiState;
    uiState = nextUiState;
    await chrome.storage.local.set({
      comicSelection: selection,
      comicUiState: nextUiState,
      comicReadingState: {
        seriesKey: selection.seriesKey || "",
        chapterIndex: Number.isInteger(selection.chapterIndex) ? selection.chapterIndex : -1,
        selectionId: selection.id,
        updatedAt: Date.now()
      }
    });
    renderSelection(selection);
    document.dispatchEvent(new CustomEvent("deskframe:comic-selection-changed", { detail: selection }));
    notify(`已选择：${selection.title}${selection.chapterTitle ? ` · ${selection.chapterTitle}` : ""}`);
  }

  function renderSelection(selection) {
    elements.comicSelection.replaceChildren();
    if (!selection) {
      elements.comicSelection.append(emptyState("尚未选择漫画"));
      return;
    }
    const label = document.createElement("span");
    label.className = "comic-current-source";
    label.textContent = selection.provider === "opds" ? selection.serverType : providerNames[selection.provider];
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = selection.title || "漫画";
    const chapter = document.createElement("small");
    chapter.textContent = selection.chapterTitle || "从上次页码继续";
    copy.append(title, chapter);
    elements.comicSelection.append(label, copy);
  }

  async function renderLocalBooks() {
    const books = await storage.listBooks();
    elements.comicLocalList.replaceChildren();
    if (!books.length) {
      elements.comicLocalList.append(emptyState("可导入多个 CBZ/ZIP，或选择一个图片文件夹"));
      return;
    }
    for (const book of books) {
      const row = document.createElement("div");
      row.className = "comic-local-row";
      const open = makeButton(
        "comic-result comic-local-open",
        book.title,
        book.kind === "archive" ? "CBZ / ZIP · 首次打开时读取目录" : `${book.pageCount} 页 · 图片文件夹`,
        () => void setSelection({
          provider: "local",
          id: `local:${book.id}`,
          localBookId: book.id,
          title: book.title,
          chapterTitle: "本地文件"
        })
      );
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "comic-remove";
      remove.textContent = "×";
      remove.title = "删除本地漫画";
      remove.addEventListener("click", async () => {
        await storage.deleteBook(book.id);
        const current = (await chrome.storage.local.get("comicSelection")).comicSelection;
        if (current?.localBookId === book.id) {
          await chrome.storage.local.remove("comicSelection");
          renderSelection(null);
          document.dispatchEvent(new CustomEvent("deskframe:comic-selection-changed", { detail: null }));
        }
        await renderLocalBooks();
      });
      row.append(open, remove);
      elements.comicLocalList.append(row);
    }
  }

  async function importArchives(files) {
    for (const file of Array.from(files || [])) {
      notify(`正在保存 ${file.name}…`);
      await storage.importArchive(file);
    }
    await renderLocalBooks();
    notify(`已导入 ${files.length} 个压缩包`);
  }

  async function importFolder(files) {
    notify("正在分批保存图片文件夹…");
    const book = await storage.importImages(files);
    await renderLocalBooks();
    await setSelection({
      provider: "local",
      id: `local:${book.id}`,
      localBookId: book.id,
      title: book.title,
      chapterTitle: `${book.pageCount} 页`
    });
  }

  async function mangaDexSearch() {
    const query = elements.comicSearchInput.value.trim();
    if (!query) return;
    await saveUiState({ query, seriesKey: "" });
    elements.comicSearchButton.disabled = true;
    elements.comicMangaResults.replaceChildren(emptyState("正在搜索 MangaDex…"));
    try {
      const url = new URL("https://api.mangadex.org/manga");
      url.searchParams.set("limit", "20");
      url.searchParams.set("title", query);
      url.searchParams.append("includes[]", "cover_art");
      url.searchParams.set("order[relevance]", "desc");
      url.searchParams.append("contentRating[]", "safe");
      url.searchParams.append("contentRating[]", "suggestive");
      const response = await fetch(url);
      if (!response.ok) throw await responseFailure(response, "MangaDex 搜索失败");
      const payload = await response.json();
      elements.comicMangaResults.replaceChildren();
      for (const manga of payload.data || []) {
        const title = textTitle(manga.attributes);
        const cover = manga.relationships?.find((item) => item.type === "cover_art")?.attributes?.fileName;
        const imageUrl = cover ? `https://uploads.mangadex.org/covers/${manga.id}/${cover}.256.jpg` : "";
        elements.comicMangaResults.append(makeButton(
          "comic-result",
          title,
          manga.attributes?.status ? `状态：${manga.attributes.status}` : "查看章节",
          () => void mangaDexChapters(manga.id, title),
          imageUrl
        ));
      }
      if (!elements.comicMangaResults.childElementCount) elements.comicMangaResults.append(emptyState("没有找到漫画"));
    } catch (error) {
      elements.comicMangaResults.replaceChildren(emptyState(error.message));
    } finally {
      elements.comicSearchButton.disabled = false;
    }
  }

  async function responseFailure(response, prefix) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.errors?.[0]?.detail || payload?.error || payload?.message || "";
    } catch {
      // Keep the status-only fallback for non-JSON responses.
    }
    return new Error(`${prefix}（${response.status}）${detail ? `：${detail}` : ""}`);
  }

  async function mangaDexChapters(mangaId, title) {
    currentManga = { provider: "mangadex", mangaId, title };
    elements.comicMangaBack.hidden = false;
    elements.comicMangaResults.replaceChildren(emptyState("正在读取章节…"));
    try {
      const url = new URL(`https://api.mangadex.org/manga/${mangaId}/feed`);
      url.searchParams.set("limit", "100");
      const language = elements.comicLanguage.value;
      if (language !== "all") url.searchParams.append("translatedLanguage[]", language);
      url.searchParams.set("order[chapter]", "desc");
      url.searchParams.append("includes[]", "scanlation_group");
      url.searchParams.append("contentRating[]", "safe");
      url.searchParams.append("contentRating[]", "suggestive");
      const response = await fetch(url);
      if (!response.ok) throw await responseFailure(response, "章节读取失败");
      const payload = await response.json();
      const chapters = (payload.data || []).map((chapter, index) => {
        const attributes = chapter.attributes || {};
        const chapterName = attributes.title || (attributes.chapter ? `第 ${attributes.chapter} 话` : "单话");
        const groupName = chapter.relationships?.find((item) => item.type === "scanlation_group")?.attributes?.name || "";
        return {
          id: chapter.id,
          selectionId: `mangadex:${chapter.id}`,
          title: chapterName,
          details: [attributes.translatedLanguage, groupName, attributes.publishAt?.slice(0, 10)].filter(Boolean).join(" · ") || "MangaDex",
          number: attributes.chapter === null || attributes.chapter === undefined ? null : Number.parseFloat(attributes.chapter),
          extra: { groupName, language: attributes.translatedLanguage || language }
        };
      });
      if (!chapters.length) {
        elements.comicMangaResults.replaceChildren();
        elements.comicMangaResults.append(emptyState("这个语言下暂无章节。MangaDex 上有些作品只有英文或其他语言版本。"));
        if (language !== "all") {
          elements.comicMangaResults.append(makeButton(
            "comic-result comic-chapter",
            "查看全部语言",
            "保留每个章节的语言标记",
            () => {
              elements.comicLanguage.value = "all";
              void mangaDexChapters(mangaId, title);
            }
          ));
        }
        return;
      }
      const series = await rememberSeries({
        key: `mangadex:${mangaId}:${language}`,
        provider: "mangadex",
        title,
        selectionBase: { provider: "mangadex", mangaId, title, language },
        meta: { mangaId, title },
        chapters
      });
      await renderSeries(series);
    } catch (error) {
      elements.comicMangaResults.replaceChildren(emptyState(error.message));
    }
  }

  const KOMIIC_SEARCH_QUERY = `
    query searchComicAndAuthorQuery($keyword: String!) {
      searchComicsAndAuthors(keyword: $keyword) {
        comics { id title status year imageUrl lastChapterUpdate lastBookUpdate }
      }
    }`;
  const KOMIIC_CHAPTER_QUERY = `
    query chapterByComicId($comicId: ID!) {
      chaptersByComicId(comicId: $comicId) { id serial type dateUpdated size }
    }`;

  async function komiicQuery(operationName, query, variables) {
    const response = await fetch("https://komiic.com/api/query", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationName, query, variables })
    });
    if (!response.ok) throw await responseFailure(response, "Komiic 接口请求失败");
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors[0].message || "Komiic 接口返回错误");
    return payload.data;
  }

  async function komiicSearch() {
    const query = elements.comicSearchInput.value.trim();
    if (!query) return;
    await saveUiState({ query, seriesKey: "" });
    elements.comicSearchButton.disabled = true;
    elements.comicMangaResults.replaceChildren(emptyState("正在搜索 Komiic 漫畫…"));
    try {
      const data = await komiicQuery("searchComicAndAuthorQuery", KOMIIC_SEARCH_QUERY, { keyword: query });
      elements.comicMangaResults.replaceChildren();
      for (const manga of data?.searchComicsAndAuthors?.comics || []) {
        const details = [
          manga.status === "ONGOING" ? "连载" : manga.status === "END" ? "完结" : manga.status,
          manga.year,
          manga.lastChapterUpdate ? `更新至 ${manga.lastChapterUpdate} 话` : ""
        ].filter(Boolean).join(" · ");
        elements.comicMangaResults.append(makeButton(
          "comic-result",
          manga.title || "未命名漫画",
          details || "查看卷/话",
          () => void komiicChapters(String(manga.id), manga.title || "未命名漫画"),
          manga.imageUrl || ""
        ));
      }
      if (!elements.comicMangaResults.childElementCount) elements.comicMangaResults.append(emptyState("没有找到漫画；Komiic 主要使用繁体中文标题，可尝试繁体字。"));
    } catch (error) {
      elements.comicMangaResults.replaceChildren(emptyState(error.message));
    } finally {
      elements.comicSearchButton.disabled = false;
    }
  }

  async function komiicChapters(comicId, title) {
    currentManga = { provider: "komiic", comicId, title };
    elements.comicMangaBack.hidden = false;
    elements.comicMangaResults.replaceChildren(emptyState("正在读取 Komiic 卷/话…"));
    try {
      const data = await komiicQuery("chapterByComicId", KOMIIC_CHAPTER_QUERY, { comicId });
      const chapters = Array.from(data?.chaptersByComicId || []).map((chapter) => {
        const kind = chapter.type === "book" ? "卷" : "话";
        const chapterTitle = `第 ${chapter.serial} ${kind}`;
        return {
          id: String(chapter.id),
          selectionId: `komiic:${chapter.id}`,
          title: chapterTitle,
          details: `${chapter.size || "?"} 页${chapter.dateUpdated ? ` · ${String(chapter.dateUpdated).slice(0, 10)}` : ""}`,
          number: Number.parseFloat(chapter.serial),
          extra: { chapterKind: chapter.type }
        };
      });
      if (!chapters.length) {
        elements.comicMangaResults.replaceChildren(emptyState("这部漫画暂时没有可读卷/话"));
        return;
      }
      const series = await rememberSeries({
        key: `komiic:${comicId}`,
        provider: "komiic",
        title,
        selectionBase: { provider: "komiic", comicId, title },
        meta: { comicId, title },
        chapters
      });
      await renderSeries(series);
    } catch (error) {
      elements.comicMangaResults.replaceChildren(emptyState(error.message));
    }
  }

  async function bridgeRequest(path, timeout = 35000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${BRIDGE_ENDPOINT}${path}`, { signal: controller.signal });
      if (!response.ok) throw await responseFailure(response, "DeskFish 本地引擎请求失败");
      return response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("DeskFish 本地引擎响应超时");
      if (error instanceof TypeError) throw new Error("未连接本地漫画引擎，请先运行 DeskFish.exe");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadBridgeSources(preferredId = uiState.bridgeSourceId) {
    elements.comicBridgeRefresh.disabled = true;
    elements.comicSearchButton.disabled = true;
    elements.comicBridgeSource.replaceChildren();
    const loading = document.createElement("option");
    loading.textContent = "正在检测…";
    loading.value = "";
    elements.comicBridgeSource.append(loading);
    try {
      const payload = await bridgeRequest("/api/v1/sources", 5000);
      elements.comicBridgeSource.replaceChildren();
      for (const source of payload.items || []) {
        const option = document.createElement("option");
        option.value = source.id;
        option.textContent = `${source.name}${source.language ? ` · ${source.language}` : ""}`;
        option.dataset.description = source.description || "";
        elements.comicBridgeSource.append(option);
      }
      if (!elements.comicBridgeSource.childElementCount) throw new Error("本地引擎没有可用漫画源");
      if (preferredId && Array.from(elements.comicBridgeSource.options).some((option) => option.value === preferredId)) {
        elements.comicBridgeSource.value = preferredId;
      }
      uiState = { ...uiState, bridgeSourceId: elements.comicBridgeSource.value };
      void chrome.storage.local.set({ comicUiState: uiState });
      elements.comicOnlineNote.textContent = "本地引擎已连接。搜索和图片解析在电脑上的 DeskFish 进程中完成，无需安装其他漫画插件。";
      elements.comicSearchButton.disabled = false;
    } catch (error) {
      elements.comicBridgeSource.replaceChildren();
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "本地引擎未运行";
      elements.comicBridgeSource.append(option);
      elements.comicOnlineNote.textContent = `${error.message}。运行一体包中的 DeskFish.exe 后点击“检测引擎”。`;
      elements.comicMangaResults.replaceChildren(emptyState("请先运行 DeskFish.exe，本地服务只监听 127.0.0.1。"));
    } finally {
      elements.comicBridgeRefresh.disabled = false;
    }
  }

  async function bridgeSearch() {
    const query = elements.comicSearchInput.value.trim();
    const sourceId = elements.comicBridgeSource.value;
    if (!query) return;
    if (!sourceId) {
      await loadBridgeSources();
      if (!elements.comicBridgeSource.value) return;
    }
    await saveUiState({
      query,
      bridgeSourceId: elements.comicBridgeSource.value,
      seriesKey: ""
    });
    elements.comicSearchButton.disabled = true;
    elements.comicMangaResults.replaceChildren(emptyState("正在通过本地引擎搜索…"));
    try {
      const params = new URLSearchParams({ source: elements.comicBridgeSource.value, q: query, page: "1" });
      const payload = await bridgeRequest(`/api/v1/search?${params}`);
      elements.comicMangaResults.replaceChildren();
      for (const manga of payload.items || []) {
        elements.comicMangaResults.append(makeButton(
          "comic-result",
          manga.title || "未命名漫画",
          manga.details || payload.source?.name || "查看章节",
          () => void bridgeChapters(payload.source?.id || elements.comicBridgeSource.value, manga.id, manga.title || "未命名漫画"),
          manga.cover || ""
        ));
      }
      if (!elements.comicMangaResults.childElementCount) elements.comicMangaResults.append(emptyState("本地漫画源没有找到结果"));
    } catch (error) {
      elements.comicMangaResults.replaceChildren(emptyState(error.message));
    } finally {
      elements.comicSearchButton.disabled = false;
    }
  }

  async function bridgeChapters(sourceId, mangaId, fallbackTitle) {
    currentManga = { provider: "bridge", sourceId, mangaId, title: fallbackTitle };
    elements.comicMangaBack.hidden = false;
    elements.comicMangaResults.replaceChildren(emptyState("正在由本地引擎解析章节…"));
    try {
      const params = new URLSearchParams({ source: sourceId, id: mangaId });
      const payload = await bridgeRequest(`/api/v1/manga?${params}`);
      const title = payload.title || fallbackTitle;
      const chapters = Array.from(payload.chapters || []).map((chapter, index) => ({
        id: chapter.id,
        selectionId: `bridge:${sourceId}:${mangaId}:${chapter.id}`,
        title: chapter.title ?? "",
        details: chapter.details || payload.source?.name || "本地漫画源",
        number: chapter.number,
        part: chapter.part,
        sequence: Number.isFinite(Number(chapter.sequence)) ? Number(chapter.sequence) : index
      }));
      if (!chapters.length) {
        elements.comicMangaResults.replaceChildren(emptyState("这部漫画没有解析到章节"));
        return;
      }
      const series = await rememberSeries({
        key: `bridge:${sourceId}:${mangaId}`,
        provider: "bridge",
        title,
        selectionBase: {
          provider: "bridge",
          bridgeEndpoint: BRIDGE_ENDPOINT,
          sourceId,
          sourceName: payload.source?.name || "本地漫画源",
          mangaId,
          title
        },
        meta: { sourceId, mangaId, title },
        chapters
      });
      await renderSeries(series);
    } catch (error) {
      elements.comicMangaResults.replaceChildren(emptyState(error.message));
    }
  }

  function onlineSearch() {
    if (elements.comicProvider.value === "komiic") return komiicSearch();
    if (elements.comicProvider.value === "bridge") return bridgeSearch();
    return mangaDexSearch();
  }

  function directChildren(element, localName) {
    return Array.from(element?.children || []).filter((child) => child.localName === localName);
  }

  function parseLink(link, baseUrl) {
    if (!link) return null;
    const href = link.getAttribute("href");
    if (!href) return null;
    return {
      href: new URL(href, baseUrl).href,
      rel: link.getAttribute("rel") || "",
      type: link.getAttribute("type") || "",
      count: Number.parseInt(Array.from(link.attributes).find((item) => item.localName === "count")?.value || "", 10)
    };
  }

  function parseOpds(xmlText, baseUrl) {
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("服务器返回的不是有效 OPDS XML");
    const feed = xml.documentElement;
    const title = directChildren(feed, "title")[0]?.textContent?.trim() || "OPDS 漫画库";
    const entries = directChildren(feed, "entry").map((entry) => {
      const entryTitle = directChildren(entry, "title")[0]?.textContent?.trim() || "未命名条目";
      const links = directChildren(entry, "link").map((link) => parseLink(link, baseUrl)).filter(Boolean);
      const stream = links.find((link) => link.rel === "http://vaemendis.net/opds-pse/stream");
      const acquisition = links.find((link) => link.rel.includes("http://opds-spec.org/acquisition") && /zip|cbz|octet-stream|comicbook/i.test(link.type));
      const navigation = links.find((link) => /atom\+xml|opds-catalog/i.test(link.type));
      return { title: entryTitle, stream, acquisition, navigation };
    });
    const feedLinks = directChildren(feed, "link").map((link) => parseLink(link, baseUrl)).filter(Boolean);
    return { title, entries, next: feedLinks.find((link) => /(?:^|\s)next(?:\s|$)/.test(link.rel)) };
  }

  function utf8Base64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function ensureOriginPermission(url) {
    if (!/^https?:$/.test(url.protocol)) throw new Error("OPDS 地址必须使用 http:// 或 https://");
    const origin = `${url.origin}/*`;
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error("未获得该漫画服务器的访问权限");
  }

  async function connectOpds(nextUrl = "", remember = true) {
    const rawUrl = nextUrl || elements.comicOpdsUrl.value.trim();
    if (!rawUrl) throw new Error("请填写 OPDS 地址");
    const url = new URL(rawUrl);
    await ensureOriginPermission(url);
    const headers = {};
    const username = elements.comicOpdsUsername.value;
    const password = elements.comicOpdsPassword.value;
    if (username || password) headers.Authorization = `Basic ${utf8Base64(`${username}:${password}`)}`;
    await chrome.storage.session.set({
      comicOpdsAuth: {
        origin: url.origin,
        provider: elements.comicProvider.value,
        headers: Object.entries(headers),
        savedAt: Date.now()
      }
    });
    elements.comicOpdsResults.replaceChildren(emptyState("正在连接 OPDS…"));
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`OPDS 连接失败（${response.status}）`);
    if (remember && opdsHistory.at(-1) !== response.url) opdsHistory.push(response.url);
    elements.comicOpdsUrl.value = response.url;
    renderOpdsFeed(parseOpds(await response.text(), response.url), response.url);
  }

  function renderOpdsFeed(feed, feedUrl) {
    elements.comicOpdsResults.replaceChildren();
    const heading = document.createElement("p");
    heading.className = "comic-feed-title";
    heading.textContent = feed.title;
    elements.comicOpdsResults.append(heading);
    const provider = elements.comicProvider.value;
    for (const entry of feed.entries) {
      const readable = (entry.stream && Number.isInteger(entry.stream.count) && entry.stream.count > 0) || entry.acquisition;
      const details = readable
        ? entry.stream?.count ? `${entry.stream.count} 页 · 点击阅读` : "压缩包 · 点击阅读"
        : "打开目录";
      elements.comicOpdsResults.append(makeButton("comic-result", entry.title, details, async () => {
        if (!readable && entry.navigation) {
          await connectOpds(entry.navigation.href);
          return;
        }
        if (!readable) {
          notify("这个条目没有可读取链接", true);
          return;
        }
        const stable = entry.stream?.href || entry.acquisition?.href || `${feedUrl}:${entry.title}`;
        await ensureOriginPermission(new URL(stable, feedUrl));
        await setSelection({
          provider: "opds",
          serverType: providerNames[provider],
          id: `opds:${provider}:${stable}`,
          title: entry.title,
          chapterTitle: feed.title,
          origin: new URL(feedUrl).origin,
          resourceOrigin: new URL(stable, feedUrl).origin,
          pageTemplate: entry.stream?.href || "",
          pageCount: Number.isInteger(entry.stream?.count) ? entry.stream.count : null,
          acquisitionUrl: entry.acquisition?.href || "",
          acquisitionType: entry.acquisition?.type || ""
        });
      }));
    }
    if (feed.next) {
      elements.comicOpdsResults.append(makeButton("comic-result comic-next-feed", "下一页目录", "继续浏览", () => void connectOpds(feed.next.href)));
    }
    if (!feed.entries.length) elements.comicOpdsResults.append(emptyState("这个目录里没有条目"));
    elements.comicOpdsBack.hidden = opdsHistory.length < 2;
  }

  function renderProvider(options = {}) {
    const reset = options.reset !== false;
    const detectBridge = options.detectBridge !== false;
    const provider = elements.comicProvider.value;
    elements.comicLocalPanel.hidden = provider !== "local";
    elements.comicMangaDexPanel.hidden = !["mangadex", "komiic", "bridge"].includes(provider);
    elements.comicOpdsPanel.hidden = !["komga", "kavita", "lanraragi", "suwayomi"].includes(provider);
    elements.comicLanguageRow.hidden = provider !== "mangadex";
    elements.comicBridgeRow.hidden = provider !== "bridge";
    if (provider === "mangadex") {
      elements.comicSearchInput.placeholder = "搜索漫画名";
      elements.comicOnlineNote.textContent = "在线内容由 MangaDex 与对应汉化组提供；如果所选语言没有章节，可切换为全部语言。";
    } else if (provider === "komiic") {
      elements.comicSearchInput.placeholder = "搜索繁体中文漫画名";
      elements.comicOnlineNote.textContent = "Komiic 提供繁体中文漫画；匿名用户有每日图片读取额度，登录或稍后再试可恢复更多额度。";
    } else if (provider === "bridge") {
      elements.comicSearchInput.placeholder = "搜索中文漫画名";
      elements.comicOnlineNote.textContent = "正在检测 DeskFish 本地漫画引擎…";
      if (detectBridge) void loadBridgeSources();
    }
    if (reset && ["mangadex", "komiic", "bridge"].includes(provider)) {
      currentManga = null;
      elements.comicMangaBack.hidden = true;
      elements.comicMangaResults.replaceChildren(emptyState(provider === "komiic"
        ? "搜索繁体中文标题，再选择卷或话"
        : provider === "bridge"
          ? "运行 DeskFish.exe 后，可直接搜索本地解析源"
          : "搜索后选择漫画，再选择要阅读的章节"));
    }
    if (!elements.comicOpdsPanel.hidden) {
      elements.comicOpdsUrl.placeholder = opdsExamples[provider];
      elements.comicOpdsHint.textContent = provider === "kavita"
        ? "Kavita：在用户设置 → 第三方客户端中复制个人 OPDS 地址；通常无需再填密码。"
        : `${providerNames[provider]} 建议地址：${opdsExamples[provider]}`;
      if (reset) {
        opdsHistory = [];
        elements.comicOpdsResults.replaceChildren(emptyState("连接后在这里浏览目录"));
      }
    }
  }

  function installListeners() {
    elements.comicProvider.addEventListener("change", async () => {
      await saveUiState({ provider: elements.comicProvider.value, seriesKey: "" });
      renderProvider();
    });
    elements.comicArchiveInput.addEventListener("change", async () => {
      try { await importArchives(elements.comicArchiveInput.files); }
      catch (error) { notify(error.message, true); }
      finally { elements.comicArchiveInput.value = ""; }
    });
    elements.comicFolderInput.addEventListener("change", async () => {
      try { await importFolder(elements.comicFolderInput.files); }
      catch (error) { notify(error.message, true); }
      finally { elements.comicFolderInput.value = ""; }
    });
    elements.comicSearchButton.addEventListener("click", () => void onlineSearch());
    elements.comicSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); void onlineSearch(); }
    });
    elements.comicMangaBack.addEventListener("click", async () => {
      currentManga = null;
      elements.comicMangaBack.hidden = true;
      await saveUiState({ seriesKey: "" });
      void onlineSearch();
    });
    elements.comicLanguage.addEventListener("change", async () => {
      await saveUiState({ language: elements.comicLanguage.value, seriesKey: "" });
      if (currentManga?.provider === "mangadex") void mangaDexChapters(currentManga.mangaId, currentManga.title);
    });
    elements.comicBridgeRefresh.addEventListener("click", () => void loadBridgeSources());
    elements.comicBridgeSource.addEventListener("change", async () => {
      currentManga = null;
      elements.comicMangaBack.hidden = true;
      await saveUiState({ bridgeSourceId: elements.comicBridgeSource.value, seriesKey: "" });
      elements.comicMangaResults.replaceChildren(emptyState("输入漫画名后搜索"));
    });
    elements.comicOpdsConnect.addEventListener("click", async () => {
      try { await connectOpds(); }
      catch (error) { elements.comicOpdsResults.replaceChildren(emptyState(error.message)); }
    });
    elements.comicOpdsBack.addEventListener("click", async () => {
      if (opdsHistory.length < 2) return;
      opdsHistory.pop();
      const previous = opdsHistory.pop();
      try { await connectOpds(previous); }
      catch (error) { elements.comicOpdsResults.replaceChildren(emptyState(error.message)); }
    });
  }

  async function initialize(options = {}) {
    notify = options.showStatus || notify;
    bindElements();
    installListeners();
    const stored = await chrome.storage.local.get(["comicSelection", "comicUiState", "comicSeriesCache"]);
    const selection = stored.comicSelection || null;
    const storedSeries = stored.comicSeriesCache && typeof stored.comicSeriesCache === "object"
      ? stored.comicSeriesCache
      : {};
    seriesCache = Object.fromEntries(Object.entries(storedSeries)
      .filter(([, series]) => series?.chapterOrderSchema === CHAPTER_ORDER_SCHEMA));
    if (Object.keys(seriesCache).length !== Object.keys(storedSeries).length) {
      void chrome.storage.local.set({ comicSeriesCache: seriesCache });
    }
    uiState = {
      provider: inferredProvider(selection),
      query: "",
      language: "zh",
      bridgeSourceId: "",
      seriesKey: selection?.seriesKey || "",
      ...(stored.comicUiState || {})
    };
    if (!Array.from(elements.comicProvider.options).some((option) => option.value === uiState.provider)) {
      uiState.provider = inferredProvider(selection);
    }
    elements.comicProvider.value = uiState.provider;
    elements.comicSearchInput.value = uiState.query || "";
    if (Array.from(elements.comicLanguage.options).some((option) => option.value === uiState.language)) {
      elements.comicLanguage.value = uiState.language;
    }
    renderSelection(selection);
    renderProvider({ reset: false, detectBridge: false });
    if (uiState.provider === "bridge") await loadBridgeSources(uiState.bridgeSourceId);
    const restoredSeries = seriesCache[uiState.seriesKey || selection?.seriesKey];
    if (restoredSeries && restoredSeries.provider === uiState.provider) {
      await renderSeries(restoredSeries);
    } else if (["mangadex", "komiic", "bridge"].includes(uiState.provider)) {
      elements.comicMangaResults.replaceChildren(emptyState(uiState.query
        ? "已恢复搜索词；点击搜索，或直接继续当前阅读"
        : "输入漫画名后搜索"));
    }
    await renderLocalBooks();
    return selection;
  }

  globalThis.DeskFrameComicManager = Object.freeze({ initialize });
})();
