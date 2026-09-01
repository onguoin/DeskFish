(function exposeNovelManager(root, factory) {
  root.DeskFishNovelManager = factory(root.DeskFishNovelProviders);
})(globalThis, (providers) => {
  const endpoint = "http://127.0.0.1:47653";
  const UI_STATE_VERSION = 2;
  const AUTO_SOURCE = {
    id: "auto",
    name: "智能搜索 · 中文网文优先",
    language: "自动",
    description: "中文关键词优先搜索 DeskFish EXE 内置网络小说解析器，并同时补充中文维基文库结果。"
  };
  const elements = {};
  const state = {
    sources: [], source: "auto", query: "", items: [], novel: null,
    view: "search", request: null, options: null
  };

  function abortRequest() {
    state.request?.abort();
    state.request = null;
  }

  async function runRequest(operation) {
    abortRequest();
    const controller = new AbortController();
    state.request = controller;
    try {
      return await operation(controller.signal);
    } finally {
      if (state.request === controller) state.request = null;
    }
  }

  async function bridgeRequest(path, signal) {
    try {
      const response = await fetch(`${endpoint}${path}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `本地小说引擎返回 ${response.status}`);
      return payload;
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (error instanceof TypeError) throw new Error("DeskFish 本地引擎未运行");
      throw error;
    }
  }

  function isDirectSource(sourceId = state.source) {
    return Boolean(providers?.sourceById(sourceId));
  }

  async function saveUiState() {
    await chrome.storage.local.set({
      novelUiState: {
        schemaVersion: UI_STATE_VERSION,
        source: state.source, query: state.query, items: state.items,
        novel: state.novel, view: state.view
      }
    });
  }

  function empty(message) {
    const node = document.createElement("p");
    node.className = "novel-empty";
    node.textContent = message;
    elements.results.replaceChildren(node);
  }

  function resultCopy(titleText, detailsText) {
    const copy = document.createElement("span");
    copy.className = "novel-result-copy";
    const title = document.createElement("strong");
    title.textContent = titleText || "未命名";
    title.title = title.textContent;
    const details = document.createElement("small");
    details.textContent = detailsText || "";
    copy.append(title, details);
    return copy;
  }

  function renderSearchResults() {
    state.view = "search";
    elements.back.hidden = true;
    elements.results.replaceChildren();
    if (!state.items.length) {
      empty(state.query ? "没有找到匹配的小说；可切换具体来源后重试" : "输入书名或作者开始搜索");
      return;
    }
    state.items.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "novel-result";
      if (item.cover) {
        const cover = document.createElement("img");
        cover.src = item.cover;
        cover.alt = "";
        cover.loading = "lazy";
        row.append(cover);
      }
      row.append(resultCopy(item.title, [item.author, item.sourceName, item.details].filter(Boolean).join(" · ")));
      row.addEventListener("click", () => void loadDetails(item));
      elements.results.append(row);
    });
  }

  function renderDetails() {
    const novel = state.novel;
    state.view = "details";
    elements.back.hidden = false;
    elements.results.replaceChildren();
    if (!novel?.chapters?.length) {
      empty("这本书没有可用目录");
      return;
    }
    const title = document.createElement("p");
    title.className = "comic-feed-title";
    const readableCount = novel.chapters.filter((chapter) => chapter.isReadable !== false).length;
    title.textContent = readableCount === novel.chapters.length
      ? `${novel.title} · ${novel.chapters.length} 章`
      : `${novel.title} · ${novel.chapters.length} 项 · ${readableCount} 项可读`;
    elements.results.append(title);
    novel.chapters.forEach((chapter, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "novel-result novel-chapter";
      const readable = chapter.isReadable !== false;
      row.disabled = !readable;
      const ordinal = document.createElement("span");
      ordinal.className = "novel-chapter-ordinal";
      ordinal.textContent = `#${String(index + 1).padStart(3, "0")}`;
      const details = chapter.details || (chapter.length > 0 ? `${chapter.length.toLocaleString()} 字符` : "选择后下载并缓存");
      row.append(ordinal, resultCopy(chapter.title, details));
      if (readable) row.addEventListener("click", () => void importChapter(index, row));
      elements.results.append(row);
    });
  }

  async function loadSources() {
    state.sources = [AUTO_SOURCE, ...Array.from(providers?.sources || [])];
    try {
      const payload = await runRequest((signal) => bridgeRequest("/api/v1/novel/sources", signal));
      const localSources = (Array.isArray(payload.items) ? payload.items : []).map((source) => ({
        ...source, name: `DeskFish EXE · ${source.name}`, direct: false
      }));
      state.sources.push(...localSources.filter((source) => !state.sources.some((item) => item.id === source.id)));
    } catch (error) {
      if (error.name === "AbortError") throw error;
      // Direct official APIs remain available when the companion app is closed.
    }
    if (!state.sources.length) throw new Error("没有可用的免费小说接口");
    if (!state.sources.some((source) => source.id === state.source)) {
      state.source = state.sources[0].id;
      state.items = [];
      state.novel = null;
      state.view = "search";
    }
    elements.source.replaceChildren();
    state.sources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.name;
      option.title = source.description || source.name;
      elements.source.append(option);
    });
    elements.source.value = state.source;
    elements.source.disabled = false;
  }

  function sourceInfo(sourceId) {
    return state.sources.find((source) => source.id === sourceId) || null;
  }

  async function searchSource(sourceId, query, signal) {
    let items;
    if (isDirectSource(sourceId)) {
      items = await providers.search(sourceId, query, 1, signal);
    } else {
      const params = new URLSearchParams({ source: sourceId, q: query, page: "1" });
      const payload = await bridgeRequest(`/api/v1/novel/search?${params}`, signal);
      items = payload.items;
    }
    const source = sourceInfo(sourceId);
    return (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      sourceId,
      sourceName: source?.name?.replace(/^DeskFish EXE · /, "") || sourceId
    }));
  }

  async function smartSearch(query, signal) {
    const hasHan = /[\u3400-\u9fff]/u.test(query);
    const preferred = hasHan
      ? ["qidian-public", "wikisource-zh"]
      : ["gutenberg-direct", "wikisource-en"];
    const available = preferred.filter((id) => state.sources.some((source) => source.id === id));
    const settled = await Promise.allSettled(available.map((id) => searchSource(id, query, signal)));
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const output = [];
    const seen = new Set();
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        const key = `${item.sourceId}:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          output.push(item);
        }
      }
    }
    if (!output.length && settled.some((result) => result.status === "rejected")) {
      const reason = settled.find((result) => result.status === "rejected")?.reason;
      throw reason instanceof Error ? reason : new Error("智能小说来源暂时不可用");
    }
    return output;
  }

  async function search() {
    const query = elements.query.value.trim();
    if (!query) {
      state.options.showStatus("请输入书名或作者", true);
      return;
    }
    elements.search.disabled = true;
    elements.search.textContent = "搜索中";
    try {
      let items;
       if (state.source === AUTO_SOURCE.id) {
         items = await runRequest((signal) => smartSearch(query, signal));
       } else if (isDirectSource()) {
         items = await runRequest((signal) => searchSource(state.source, query, signal));
       } else {
         items = await runRequest((signal) => searchSource(state.source, query, signal));
      }
      state.query = query;
      state.items = Array.isArray(items) ? items : [];
      state.novel = null;
      renderSearchResults();
      await saveUiState();
       state.options.showStatus(`找到 ${state.items.length} 本小说`);
    } catch (error) {
      if (error.name !== "AbortError") state.options.showStatus(error.message || "免费接口连接失败", true);
    } finally {
      elements.search.disabled = false;
      elements.search.textContent = "搜索";
    }
  }

  async function loadDetails(item) {
    empty("正在读取目录并自动识别章节…");
    try {
      let payload;
      const sourceId = item.sourceId || state.source;
      if (isDirectSource(sourceId)) {
        payload = await runRequest((signal) => providers.details(sourceId, item, signal));
      } else {
        const params = new URLSearchParams({ source: sourceId, id: item.id });
        payload = await runRequest((signal) => bridgeRequest(`/api/v1/novel/details?${params}`, signal));
      }
      state.novel = {
        id: payload.id,
        title: payload.title,
        author: payload.author,
        cover: payload.cover,
        description: payload.description,
        chapters: Array.isArray(payload.chapters) ? payload.chapters : [],
        providerData: payload.providerData || null,
        sourceId
      };
      renderDetails();
      await saveUiState();
    } catch (error) {
      if (error.name === "AbortError") return;
      empty("目录读取失败，可以返回后重试");
      state.options.showStatus(error.message || "免费接口连接失败", true);
    }
  }

  async function importChapter(index, button) {
    if (!state.novel) return;
    const selectedChapter = state.novel.chapters[index];
    if (!selectedChapter || selectedChapter.isReadable === false) return;
    const sourceId = state.novel.sourceId || state.source;
    const previousText = button.querySelector("small")?.textContent || "";
    button.disabled = true;
    const small = button.querySelector("small");
    if (small) small.textContent = isDirectSource(sourceId)
      ? "正在从官方免费接口读取并分片保存…"
      : "正在由 DeskFish EXE 解析并缓存公开章节…";
    try {
      let payload;
      if (isDirectSource(sourceId)) {
        payload = await runRequest((signal) => providers.book(sourceId, state.novel, signal));
      } else {
        const params = new URLSearchParams({ source: sourceId, id: state.novel.id });
        payload = await runRequest((signal) => bridgeRequest(`/api/v1/novel/book?${params}`, signal));
      }
      const payloadIndex = Math.max(0, (payload.chapters || []).findIndex((chapter) => String(chapter.id) === String(selectedChapter.id)));
      await state.options.importBookText(payload, payloadIndex);
      if (small) small.textContent = `已导入 · ${payload.chapters?.[payloadIndex]?.length?.toLocaleString?.() || ""} 字符`;
    } catch (error) {
      if (error.name !== "AbortError") state.options.showStatus(error.message || "免费接口连接失败", true);
      if (small) small.textContent = previousText;
    } finally {
      button.disabled = false;
    }
  }

  async function initialize(options) {
    if (!providers) throw new Error("在线小说接口模块没有加载");
    state.options = options;
    elements.source = document.querySelector("#novelSourceSelect");
    elements.query = document.querySelector("#novelSearchInput");
    elements.search = document.querySelector("#novelSearchButton");
    elements.back = document.querySelector("#novelBackButton");
    elements.results = document.querySelector("#novelResults");
    const stored = await chrome.storage.local.get("novelUiState");
    const remembered = stored.novelUiState || {};
    const currentSchema = Number(remembered.schemaVersion || 0);
    state.source = currentSchema >= UI_STATE_VERSION && typeof remembered.source === "string"
      ? remembered.source
      : AUTO_SOURCE.id;
    state.query = typeof remembered.query === "string" ? remembered.query : "";
    state.items = currentSchema >= UI_STATE_VERSION && Array.isArray(remembered.items) ? remembered.items : [];
    state.novel = currentSchema >= UI_STATE_VERSION && remembered.novel && typeof remembered.novel === "object" ? remembered.novel : null;
    state.view = remembered.view === "details" && state.novel ? "details" : "search";
    elements.query.value = state.query;
    elements.search.addEventListener("click", () => void search());
    elements.query.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void search();
      }
    });
    elements.source.addEventListener("change", async () => {
      abortRequest();
      state.source = elements.source.value;
      state.items = [];
      state.novel = null;
      state.view = "search";
      renderSearchResults();
      await saveUiState();
    });
    elements.back.addEventListener("click", async () => {
      abortRequest();
      state.novel = null;
      renderSearchResults();
      await saveUiState();
    });

    await loadSources();
    if (state.view === "details") renderDetails();
    else renderSearchResults();
  }

  return { initialize };
});
