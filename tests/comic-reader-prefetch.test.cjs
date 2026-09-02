const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor(isImage = false) {
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.title = "";
    this.listeners = new Map();
    this.classList = { toggle() {} };
    if (isImage) {
      Object.defineProperty(this, "src", {
        get: () => this._src || "",
        set: (value) => {
          this._src = value;
          queueMicrotask(() => this.onload?.());
        }
      });
    }
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  focus() {}
}

function chapterSelection(index) {
  const id = `c${index + 1}`;
  return {
    provider: "bridge",
    id: `bridge:baozimh:manga:${id}`,
    title: "测试漫画",
    chapterId: id,
    chapterTitle: `章节 ${id}`,
    seriesKey: "bridge:baozimh:manga",
    chapterIndex: index,
    chapterCount: 3,
    bridgeEndpoint: "http://127.0.0.1:47653",
    sourceId: "baozimh",
    sourceName: "包子漫画",
    mangaId: "/comic/test"
  };
}

async function waitFor(predicate, message, timeout = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("reuses next-chapter prefetch and releases it when hidden", async () => {
  const elements = new Map();
  for (const id of [
    "reader", "title", "chapter", "pageCounter", "pageStage", "pageImage", "loading", "errorState",
    "sourceCredit", "previousButton", "nextButton", "previousChapterButton", "nextChapterButton",
    "previousZone", "nextZone", "fitButton"
  ]) elements.set(`#${id}`, new FakeElement(id === "pageImage"));

  const series = {
    key: "bridge:baozimh:manga",
    provider: "bridge",
    title: "测试漫画",
    chapterOrderSchema: 3,
    selectionBase: {
      provider: "bridge",
      bridgeEndpoint: "http://127.0.0.1:47653",
      sourceId: "baozimh",
      sourceName: "包子漫画",
      mangaId: "/comic/test",
      title: "测试漫画"
    },
    chapters: [0, 1, 2].map((index) => ({
      id: `c${index + 1}`,
      selectionId: `bridge:baozimh:manga:c${index + 1}`,
      title: `章节 c${index + 1}`
    }))
  };
  const localState = {
    comicSelection: chapterSelection(0),
    comicProgress: {},
    comicSettings: { fitMode: "contain" },
    comicSeriesCache: { [series.key]: series }
  };
  const storageListeners = [];
  const windowListeners = new Map();
  const calls = { lists: new Map(), images: new Map(), revoked: 0 };

  const notifyStorage = (changes) => queueMicrotask(() => {
    for (const listener of storageListeners) listener(changes, "local");
  });
  const storageArea = {
    get(keys, callback) {
      const names = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(names.map((key) => [key, localState[key]])));
    },
    async set(patch) {
      const changes = {};
      for (const [key, value] of Object.entries(patch)) {
        changes[key] = { oldValue: localState[key], newValue: value };
        localState[key] = value;
      }
      notifyStorage(changes);
    }
  };

  class MockURL extends URL {}
  MockURL.createObjectURL = () => `blob:test-${Math.random()}`;
  MockURL.revokeObjectURL = () => { calls.revoked += 1; };

  const fetchMock = async (input, options = {}) => {
    if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/chapter") {
      const chapterId = url.searchParams.get("chapterId");
      calls.lists.set(chapterId, (calls.lists.get(chapterId) || 0) + 1);
      return {
        ok: true,
        status: 200,
        async json() {
          return { pages: [0, 1, 2].map((page) => `https://images.test/${chapterId}/${page}`) };
        }
      };
    }
    if (url.hostname === "images.test") {
      const key = url.pathname;
      calls.images.set(key, (calls.images.get(key) || 0) + 1);
      return {
        ok: true,
        status: 200,
        async blob() { return new Blob([`image:${key}`], { type: "image/jpeg" }); },
        async json() { return {}; }
      };
    }
    throw new Error(`Unexpected fetch: ${url.href}`);
  };

  const parentWindow = {};
  const fakeWindow = {
    parent: parentWindow,
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    }
  };
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Blob,
    AbortController,
    DOMException,
    URL: MockURL,
    URLSearchParams,
    location: { href: "chrome-extension://deskfish/comic/index.html?deskframe_token=test-token&deskframe_visible=1" },
    innerWidth: 800,
    devicePixelRatio: 1,
    window: fakeWindow,
    document: { querySelector: (selector) => elements.get(selector) },
    fetch: fetchMock,
    zip: {},
    chrome: {
      storage: {
        local: storageArea,
        session: { get: (_keys, callback) => callback({}) },
        onChanged: { addListener: (listener) => storageListeners.push(listener) }
      },
      runtime: { sendMessage: async () => ({ ok: true }) }
    },
    DeskFrameComicStorage: {
      IMAGE_PATTERN: /\.(?:png|jpe?g|webp)$/i,
      naturalOrder: new Intl.Collator(undefined, { numeric: true })
    }
  });
  context.globalThis = context;

  const readerSource = fs.readFileSync(path.resolve(__dirname, "../edge-extension/comic/reader.js"), "utf8");
  vm.runInContext(readerSource, context, { filename: "reader.js" });

  await waitFor(() => calls.images.get("/c2/0") === 1, "下一话没有完成图片预读");
  assert.equal(calls.lists.get("c2"), 1, "下一话页面列表应只请求一次");

  elements.get("#nextChapterButton").dispatch("click");
  await waitFor(() => elements.get("#chapter").textContent === "章节 c2", "没有切换到预读章节");
  assert.equal(calls.lists.get("c2"), 1, "切换下一话时不应重新请求页面列表");
  assert.equal(calls.images.get("/c2/0"), 1, "切换下一话时不应重新下载首页");

  await waitFor(() => calls.lists.get("c3") === 1, "没有继续预读后续章节");
  const messageListener = (windowListeners.get("message") || [])[0];
  messageListener({ source: parentWindow, data: { token: "test-token", type: "deskframe:media-visibility", visible: false } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  messageListener({ source: parentWindow, data: { token: "test-token", type: "deskframe:media-visibility", visible: true } });
  await waitFor(() => calls.lists.get("c3") === 2, "隐藏后没有释放并重建下一话缓存");

  for (const listener of windowListeners.get("pagehide") || []) listener();
  await waitFor(() => calls.revoked > 0, "关闭阅读器后没有释放 Object URL");
});
