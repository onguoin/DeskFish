(() => {
  const storage = globalThis.DeskFrameComicStorage;
  const imagePattern = storage.IMAGE_PATTERN;
  const naturalOrder = storage.naturalOrder;
  const params = new URL(location.href).searchParams;
  const token = params.get("deskframe_token") || "";
  const PAGE_CACHE_RADIUS = 5;
  const PREFETCH_CONCURRENCY = 3;
  const elements = {
    reader: document.querySelector("#reader"),
    title: document.querySelector("#title"),
    chapter: document.querySelector("#chapter"),
    counter: document.querySelector("#pageCounter"),
    stage: document.querySelector("#pageStage"),
    image: document.querySelector("#pageImage"),
    loading: document.querySelector("#loading"),
    error: document.querySelector("#errorState"),
    credit: document.querySelector("#sourceCredit"),
    previous: document.querySelector("#previousButton"),
    next: document.querySelector("#nextButton"),
    previousChapter: document.querySelector("#previousChapterButton"),
    nextChapter: document.querySelector("#nextChapterButton"),
    previousZone: document.querySelector("#previousZone"),
    nextZone: document.querySelector("#nextZone"),
    fit: document.querySelector("#fitButton")
  };

  const state = {
    selection: null,
    page: 0,
    pageCount: 0,
    loader: null,
    archiveReader: null,
    objectUrls: new Map(),
    pageLoads: new Map(),
    cacheCenter: 0,
    cacheGeneration: 0,
    prefetchGeneration: 0,
    renderVersion: 0,
    fitMode: "contain",
    wheelTotal: 0,
    wheelTimer: 0,
    seriesCache: {},
    pendingPage: "",
    switchingChapter: false,
    visible: params.get("deskframe_visible") !== "0"
  };

  function storageGet(area, keys) {
    return new Promise((resolve) => chrome.storage[area].get(keys, resolve));
  }

  function currentSeries() {
    const key = state.selection?.seriesKey;
    return key ? state.seriesCache?.[key] || null : null;
  }

  function currentChapterIndex(series = currentSeries()) {
    if (!series?.chapters?.length) return -1;
    if (Number.isInteger(state.selection?.chapterIndex)
      && state.selection.chapterIndex >= 0
      && state.selection.chapterIndex < series.chapters.length) {
      return state.selection.chapterIndex;
    }
    return series.chapters.findIndex((chapter) => chapter.selectionId === state.selection?.id);
  }

  function adjacentSelection(delta) {
    const series = currentSeries();
    const index = currentChapterIndex(series);
    const nextIndex = index + delta;
    const chapter = series?.chapters?.[nextIndex];
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
      chapterIndex: nextIndex,
      chapterCount: series.chapters.length
    };
  }

  function hasAdjacentChapter(delta) {
    return Boolean(adjacentSelection(delta));
  }

  function mimeForName(name) {
    const extension = String(name).split(".").pop().toLowerCase();
    return ({ avif: "image/avif", bmp: "image/bmp", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp" })[extension] || "image/jpeg";
  }

  function archiveEntries(entries) {
    return entries
      .filter((entry) => !entry.directory && imagePattern.test(entry.filename || ""))
      .sort((left, right) => naturalOrder.compare(left.filename, right.filename));
  }

  function replaceTemplate(template, pageNumber) {
    let value = String(template || "");
    const replacements = {
      "{pageNumber}": String(pageNumber),
      "%7BpageNumber%7D": String(pageNumber),
      "%7bpageNumber%7d": String(pageNumber),
      "{maxWidth}": String(Math.max(640, Math.round(innerWidth * devicePixelRatio))),
      "%7BmaxWidth%7D": String(Math.max(640, Math.round(innerWidth * devicePixelRatio))),
      "%7bmaxWidth%7d": String(Math.max(640, Math.round(innerWidth * devicePixelRatio)))
    };
    for (const [pattern, replacement] of Object.entries(replacements)) value = value.split(pattern).join(replacement);
    return value;
  }

  async function sessionHeaders(selection) {
    const stored = await storageGet("session", "comicOpdsAuth");
    const auth = stored.comicOpdsAuth;
    if (!auth || auth.origin !== selection.origin) return {};
    return Object.fromEntries(Array.isArray(auth.headers) ? auth.headers : []);
  }

  async function openZip(reader) {
    const zipReader = new zip.ZipReader(reader, { useWebWorkers: false });
    const entries = archiveEntries(await zipReader.getEntries());
    if (!entries.length) {
      await zipReader.close();
      throw new Error("压缩包里没有找到漫画图片");
    }
    state.archiveReader = zipReader;
    return {
      count: entries.length,
      load: async (index) => {
        const entry = entries[index];
        if (!entry) throw new Error("漫画页不存在");
        return entry.getData(new zip.BlobWriter(mimeForName(entry.filename)), { useWebWorkers: false });
      }
    };
  }

  async function localLoader(selection) {
    const book = await storage.getBook(selection.localBookId);
    if (!book) throw new Error("本地漫画已被删除，请重新导入");
    if (book.kind === "images") {
      return {
        count: book.pageCount,
        load: async (index) => {
          const page = await storage.getPage(book.id, index);
          if (!page?.blob) throw new Error("本地漫画页缺失");
          return page.blob;
        }
      };
    }
    if (!book.archive) throw new Error("本地压缩包内容缺失");
    return openZip(new zip.BlobReader(book.archive));
  }

  async function mangadexLoader(selection) {
    const response = await fetch(`https://api.mangadex.org/at-home/server/${encodeURIComponent(selection.chapterId)}`);
    if (!response.ok) throw new Error(`MangaDex 图片服务器返回 ${response.status}`);
    const payload = await response.json();
    const chapter = payload.chapter || {};
    const saverFiles = Array.isArray(chapter.dataSaver) ? chapter.dataSaver : [];
    const originalFiles = Array.isArray(chapter.data) ? chapter.data : [];
    const useSaver = saverFiles.length > 0;
    const files = useSaver ? saverFiles : originalFiles;
    if (!payload.baseUrl || !chapter.hash || !files.length) throw new Error("MangaDex 章节暂无可读取页面");
    const folder = useSaver ? "data-saver" : "data";
    return {
      count: files.length,
      direct: true,
      load: async (index) => `${payload.baseUrl}/${folder}/${chapter.hash}/${files[index]}`
    };
  }

  const KOMIIC_IMAGES_QUERY = `
    query imagesByChapterId($chapterId: ID!) {
      imagesByChapterId(chapterId: $chapterId) { id kid height width }
    }`;

  async function komiicLoader(selection) {
    const ruleResponse = await chrome.runtime.sendMessage({
      type: "deskframe:komiic-referrer",
      comicId: selection.comicId,
      chapterId: selection.chapterId
    });
    if (!ruleResponse?.ok) throw new Error(ruleResponse?.error || "Komiic 图片访问规则设置失败");
    const response = await fetch("https://komiic.com/api/query", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationName: "imagesByChapterId",
        query: KOMIIC_IMAGES_QUERY,
        variables: { chapterId: selection.chapterId }
      })
    });
    if (!response.ok) throw new Error(`Komiic 页面列表读取失败（${response.status}）`);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors[0].message || "Komiic 页面列表返回错误");
    const images = payload.data?.imagesByChapterId || [];
    if (!images.length) throw new Error("这个 Komiic 卷/话暂时没有可读取页面");
    return {
      count: images.length,
      prefetch: false,
      load: async (index) => {
        const kid = images[index]?.kid;
        if (!kid) throw new Error("Komiic 漫画页不存在");
        const pageResponse = await fetch(`https://komiic.com/api/image/${encodeURIComponent(kid)}`, {
          credentials: "include"
        });
        if (!pageResponse.ok) {
          throw new Error(pageResponse.status === 400 || pageResponse.status === 429
            ? "Komiic 图片额度可能已用完，请登录 Komiic 或稍后再试"
            : `Komiic 漫画页读取失败（${pageResponse.status}）`);
        }
        return pageResponse.blob();
      }
    };
  }

  async function bridgeLoader(selection) {
    const endpoint = selection.bridgeEndpoint || "http://127.0.0.1:47653";
    const params = new URLSearchParams({
      source: selection.sourceId || "",
      mangaId: selection.mangaId || "",
      chapterId: selection.chapterId || ""
    });
    let response;
    try {
      response = await fetch(`${endpoint}/api/v1/chapter?${params}`);
    } catch {
      throw new Error("未连接本地漫画引擎，请先运行 DeskFish.exe");
    }
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json())?.error || ""; } catch { /* Status fallback. */ }
      throw new Error(detail || `本地漫画引擎返回 ${response.status}`);
    }
    const payload = await response.json();
    const pages = Array.isArray(payload.pages) ? payload.pages : [];
    if (!pages.length) throw new Error("本地漫画源没有返回页面");
    return {
      count: pages.length,
      prefetch: true,
      load: async (index) => {
        const pageUrl = pages[index];
        if (!pageUrl) throw new Error("本地漫画页不存在");
        const pageResponse = await fetch(pageUrl);
        if (!pageResponse.ok) {
          let detail = "";
          try { detail = (await pageResponse.json())?.error || ""; } catch { /* Status fallback. */ }
          throw new Error(detail || `本地漫画图片读取失败（${pageResponse.status}）`);
        }
        return pageResponse.blob();
      }
    };
  }

  async function opdsLoader(selection) {
    const headers = await sessionHeaders(selection);
    if (selection.pageTemplate && Number.isInteger(selection.pageCount) && selection.pageCount > 0) {
      return {
        count: selection.pageCount,
        load: async (index) => {
          const response = await fetch(replaceTemplate(selection.pageTemplate, index), { headers });
          if (!response.ok) throw new Error(`漫画页读取失败（${response.status}）`);
          return response.blob();
        }
      };
    }
    if (!selection.acquisitionUrl) throw new Error("这个 OPDS 条目没有页面流或可下载压缩包");
    const reader = new zip.HttpReader(selection.acquisitionUrl, {
      headers,
      useRangeHeader: true,
      preventHeadRequest: true
    });
    return openZip(reader);
  }

  async function buildLoader(selection) {
    if (selection.provider === "local") return localLoader(selection);
    if (selection.provider === "mangadex") return mangadexLoader(selection);
    if (selection.provider === "komiic") return komiicLoader(selection);
    if (selection.provider === "bridge") return bridgeLoader(selection);
    if (selection.provider === "opds") return opdsLoader(selection);
    throw new Error("尚未选择漫画来源");
  }

  function releaseObjectUrls() {
    for (const url of state.objectUrls.values()) URL.revokeObjectURL(url);
    state.objectUrls.clear();
  }

  async function closeLoader() {
    state.cacheGeneration += 1;
    state.prefetchGeneration += 1;
    state.pageLoads.clear();
    releaseObjectUrls();
    if (state.archiveReader) {
      await state.archiveReader.close().catch(() => {});
      state.archiveReader = null;
    }
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.image.hidden = true;
    elements.error.hidden = false;
    elements.error.textContent = message;
  }

  function updateHeader() {
    const selection = state.selection || {};
    elements.title.textContent = selection.title || "漫画";
    elements.chapter.textContent = selection.chapterTitle || "";
    elements.counter.textContent = state.pageCount ? `${state.page + 1} / ${state.pageCount}` : "0 / 0";
    const hasPreviousChapter = hasAdjacentChapter(-1);
    const hasNextChapter = hasAdjacentChapter(1);
    elements.previous.disabled = state.page <= 0 && !hasPreviousChapter;
    elements.next.disabled = state.page >= state.pageCount - 1 && !hasNextChapter;
    elements.previousChapter.disabled = !hasPreviousChapter;
    elements.nextChapter.disabled = !hasNextChapter;
    elements.previousChapter.title = hasPreviousChapter
      ? `上一话：${adjacentSelection(-1)?.chapterTitle || ""}`
      : "没有上一话";
    elements.nextChapter.title = hasNextChapter
      ? `下一话：${adjacentSelection(1)?.chapterTitle || ""}`
      : "没有下一话";
    elements.credit.textContent = selection.provider === "mangadex"
      ? `MangaDex${selection.groupName ? ` · ${selection.groupName}` : ""}`
      : selection.provider === "komiic"
        ? "Komiic 漫畫"
      : selection.provider === "bridge"
        ? `DeskFish 本地源${selection.sourceName ? ` · ${selection.sourceName}` : ""}`
      : selection.provider === "local"
        ? "本地漫画"
        : selection.serverType || "OPDS 漫画库";
  }

  function trimPageCache(center = state.cacheCenter) {
    for (const [page, oldUrl] of state.objectUrls) {
      if (Math.abs(page - center) <= PAGE_CACHE_RADIUS) continue;
      URL.revokeObjectURL(oldUrl);
      state.objectUrls.delete(page);
    }
  }

  async function pageSource(index) {
    if (state.objectUrls.has(index)) return state.objectUrls.get(index);
    if (state.pageLoads.has(index)) return state.pageLoads.get(index);
    const generation = state.cacheGeneration;
    const loader = state.loader;
    const loading = (async () => {
      const value = await loader.load(index);
      if (generation !== state.cacheGeneration || loader !== state.loader) throw new Error("漫画页请求已过期");
      if (typeof value === "string") return value;
      const url = URL.createObjectURL(value);
      if (Math.abs(index - state.cacheCenter) > PAGE_CACHE_RADIUS) {
        URL.revokeObjectURL(url);
        throw new Error("漫画页已离开预读窗口");
      }
      state.objectUrls.set(index, url);
      return url;
    })();
    state.pageLoads.set(index, loading);
    try {
      return await loading;
    } finally {
      if (state.pageLoads.get(index) === loading) state.pageLoads.delete(index);
    }
  }

  function prefetchWindow(center) {
    if (!state.visible || state.loader?.prefetch === false) return;
    const generation = ++state.prefetchGeneration;
    const targets = [];
    for (let distance = 1; distance <= PAGE_CACHE_RADIUS; distance += 1) {
      for (const index of [center + distance, center - distance]) {
        if (index >= 0 && index < state.pageCount) targets.push(index);
      }
    }
    const worker = async () => {
      while (targets.length && generation === state.prefetchGeneration && state.visible) {
        const index = targets.shift();
        await pageSource(index).catch(() => {});
      }
    };
    void Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, targets.length) }, worker))
      .finally(() => trimPageCache(state.cacheCenter));
  }

  async function persistProgress() {
    if (!state.selection?.id) return;
    const stored = await storageGet("local", "comicProgress");
    await chrome.storage.local.set({
      comicProgress: {
        ...(stored.comicProgress || {}),
        [state.selection.id]: { page: state.page, updatedAt: Date.now() }
      }
    });
  }

  async function renderPage(nextPage = state.page) {
    if (!state.loader || !state.pageCount) return;
    const index = Math.max(0, Math.min(state.pageCount - 1, nextPage));
    const version = ++state.renderVersion;
    state.page = index;
    state.cacheCenter = index;
    state.prefetchGeneration += 1;
    trimPageCache(index);
    updateHeader();
    elements.error.hidden = true;
    elements.loading.hidden = false;
    elements.loading.textContent = "正在读取漫画…";
    elements.image.hidden = true;
    try {
      const src = await pageSource(index);
      if (version !== state.renderVersion) return;
      await new Promise((resolve, reject) => {
        elements.image.onload = resolve;
        elements.image.onerror = () => reject(new Error("漫画图片解码失败"));
        elements.image.src = src;
      });
      if (version !== state.renderVersion) return;
      elements.image.hidden = false;
      elements.loading.hidden = true;
      void persistProgress();
      prefetchWindow(index);
    } catch (error) {
      if (version === state.renderVersion) showError(error.message || "漫画页读取失败");
    }
  }

  async function loadSelection() {
    ++state.renderVersion;
    await closeLoader();
    const stored = await storageGet("local", ["comicSelection", "comicProgress", "comicSettings", "comicSeriesCache"]);
    state.selection = stored.comicSelection || null;
    state.seriesCache = stored.comicSeriesCache && typeof stored.comicSeriesCache === "object"
      ? stored.comicSeriesCache
      : {};
    state.fitMode = stored.comicSettings?.fitMode === "width" ? "width" : "contain";
    elements.stage.classList.toggle("fit-width", state.fitMode === "width");
    elements.fit.textContent = state.fitMode === "width" ? "适页" : "适宽";
    if (!state.selection) {
      showError("请先在扩展面板里选择一本漫画或一个章节");
      updateHeader();
      return;
    }
    elements.loading.hidden = false;
    elements.loading.textContent = "正在读取漫画…";
    elements.error.hidden = true;
    try {
      state.loader = await buildLoader(state.selection);
      state.pageCount = Number(state.loader.count) || 0;
      if (!state.pageCount) throw new Error("这个章节没有漫画页");
      const remembered = stored.comicProgress?.[state.selection.id]?.page;
      if (state.pendingPage === "last") state.page = state.pageCount - 1;
      else if (state.pendingPage === "first") state.page = 0;
      else state.page = Number.isInteger(remembered) ? Math.min(remembered, state.pageCount - 1) : 0;
      state.pendingPage = "";
      state.switchingChapter = false;
      updateHeader();
      await renderPage();
    } catch (error) {
      state.pendingPage = "";
      state.switchingChapter = false;
      state.pageCount = 0;
      updateHeader();
      showError(error.message || "漫画加载失败");
    }
  }

  async function changeChapter(delta) {
    if (state.switchingChapter) return;
    const selection = adjacentSelection(delta);
    if (!selection) return;
    state.switchingChapter = true;
    state.pendingPage = delta < 0 ? "last" : "first";
    await persistProgress();
    elements.error.hidden = true;
    elements.image.hidden = true;
    elements.loading.hidden = false;
    elements.loading.textContent = delta < 0 ? "正在切换到上一话…" : "正在切换到下一话…";
    try {
      await chrome.storage.local.set({
        comicSelection: selection,
        comicReadingState: {
          seriesKey: selection.seriesKey,
          chapterIndex: selection.chapterIndex,
          selectionId: selection.id,
          updatedAt: Date.now()
        }
      });
    } catch (error) {
      state.pendingPage = "";
      state.switchingChapter = false;
      showError(error.message || "章节切换失败");
    }
  }

  function changePage(delta) {
    const target = state.page + delta;
    if (target >= state.pageCount && delta > 0) {
      void changeChapter(1);
      return;
    }
    if (target < 0 && delta < 0) {
      void changeChapter(-1);
      return;
    }
    void renderPage(target);
  }

  function handleKey(event) {
    if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      changePage(1);
    } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      changePage(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      void renderPage(0);
    } else if (event.key === "End") {
      event.preventDefault();
      void renderPage(state.pageCount - 1);
    }
  }

  function handleWheel(event) {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    state.wheelTotal += event.deltaY;
    clearTimeout(state.wheelTimer);
    state.wheelTimer = setTimeout(() => { state.wheelTotal = 0; }, 160);
    if (Math.abs(state.wheelTotal) < 45) return;
    changePage(state.wheelTotal > 0 ? 1 : -1);
    state.wheelTotal = 0;
  }

  elements.previous.addEventListener("click", () => changePage(-1));
  elements.next.addEventListener("click", () => changePage(1));
  elements.previousChapter.addEventListener("click", () => void changeChapter(-1));
  elements.nextChapter.addEventListener("click", () => void changeChapter(1));
  elements.previousZone.addEventListener("click", () => changePage(-1));
  elements.nextZone.addEventListener("click", () => changePage(1));
  elements.fit.addEventListener("click", async () => {
    state.fitMode = state.fitMode === "width" ? "contain" : "width";
    elements.stage.classList.toggle("fit-width", state.fitMode === "width");
    elements.fit.textContent = state.fitMode === "width" ? "适页" : "适宽";
    await chrome.storage.local.set({ comicSettings: { fitMode: state.fitMode } });
  });
  window.addEventListener("keydown", handleKey, true);
  elements.reader.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.token !== token) return;
    if (event.data.type === "deskframe:comic-page") changePage(Number(event.data.direction) < 0 ? -1 : 1);
    if (event.data.type === "deskframe:media-visibility") {
      state.visible = Boolean(event.data.visible);
      state.prefetchGeneration += 1;
      if (state.visible) prefetchWindow(state.page);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.comicSelection) void loadSelection();
  });
  window.addEventListener("pagehide", () => { void closeLoader(); }, { once: true });
  elements.reader.focus({ preventScroll: true });
  void loadSelection();
})();
