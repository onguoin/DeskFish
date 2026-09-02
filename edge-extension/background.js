const DEFAULT_SETTINGS = Object.freeze({
  autoplay: true,
  muted: true,
  danmaku: false,
  hoverReveal: true,
  readerStepPercent: 50
});

const DEFAULT_MEDIA_CONFIG = Object.freeze({
  type: "bilibili",
  huyaRoom: "",
  bilibiliLiveRoom: ""
});

const AD_WINDOW_STORAGE_KEY = "deskframeAdWindowId";
const AD_WINDOW_WIDTH = 390;
const AD_WINDOW_HEIGHT = 270;
const KOMIIC_REFERRER_RULE_ID = 9107;
let adWindowPort = null;

async function setKomiicReferrerRule(comicId, chapterId) {
  const safeComicId = String(comicId || "").match(/^\d+$/)?.[0];
  const safeChapterId = String(chapterId || "").match(/^\d+$/)?.[0];
  if (!safeComicId || !safeChapterId) throw new Error("Komiic 卷/话编号无效");
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [KOMIIC_REFERRER_RULE_ID],
    addRules: [{
      id: KOMIIC_REFERRER_RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{
          header: "referer",
          operation: "set",
          value: `https://komiic.com/comic/${safeComicId}/chapter/${safeChapterId}/images/all`
        }]
      },
      condition: {
        urlFilter: "||komiic.com/api/image/",
        initiatorDomains: [chrome.runtime.id],
        resourceTypes: ["xmlhttprequest", "image"]
      }
    }]
  });
  return { updated: true };
}

function isSupportedEbook(book) {
  if (!book || typeof book !== "object") return false;
  if (typeof book.text === "string") return true;
  return (book.schemaVersion === 2 || book.schemaVersion === 3)
    && typeof book.id === "string"
    && Number.isInteger(book.length)
    && book.length >= 0
    && Number.isInteger(book.chunkSize)
    && book.chunkSize > 0
    && Number.isInteger(book.chunkCount)
    && book.chunkCount >= 0;
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get([
    "playlist",
    "currentIndex",
    "settings",
    "mediaConfig",
    "comicSelection",
    "comicProgress",
    "comicSettings",
    "comicUiState",
    "comicSeriesCache",
    "comicReadingState",
    "ebook",
    "ebookOffset"
  ]);
  await chrome.storage.local.set({
    playlist: Array.isArray(current.playlist) ? current.playlist : [],
    currentIndex: Number.isInteger(current.currentIndex) ? current.currentIndex : 0,
    settings: { ...DEFAULT_SETTINGS, ...(current.settings || {}) },
    mediaConfig: { ...DEFAULT_MEDIA_CONFIG, ...(current.mediaConfig || {}) },
    comicSelection: current.comicSelection || null,
    comicProgress: current.comicProgress && typeof current.comicProgress === "object" ? current.comicProgress : {},
    comicSettings: { fitMode: "contain", ...(current.comicSettings || {}) },
    comicUiState: current.comicUiState && typeof current.comicUiState === "object" ? current.comicUiState : {},
    comicSeriesCache: current.comicSeriesCache && typeof current.comicSeriesCache === "object" ? current.comicSeriesCache : {},
    comicReadingState: current.comicReadingState && typeof current.comicReadingState === "object" ? current.comicReadingState : null,
    ebook: isSupportedEbook(current.ebook) ? current.ebook : null,
    ebookOffset: Number.isInteger(current.ebookOffset) ? current.ebookOffset : 0
  });
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("没有找到当前标签页");
  }
  return tab;
}

function isRestrictedUrl(url = "") {
  return /^(edge|chrome|chrome-extension|about|view-source|devtools|extension):/i.test(url)
    || /^https:\/\/(microsoftedge\.microsoft\.com|chromewebstore\.google\.com)\//i.test(url);
}

async function getRememberedAdWindow() {
  const stored = await chrome.storage.local.get(AD_WINDOW_STORAGE_KEY);
  const windowId = stored[AD_WINDOW_STORAGE_KEY];
  if (!Number.isInteger(windowId)) return null;
  try {
    return await chrome.windows.get(windowId);
  } catch {
    await chrome.storage.local.remove(AD_WINDOW_STORAGE_KEY);
    return null;
  }
}

async function openAdWindow() {
  const existing = await getRememberedAdWindow();
  if (existing) {
    await chrome.windows.update(existing.id, { focused: true, state: "normal" });
    return { opened: true, reused: true, windowId: existing.id };
  }

  const owner = await chrome.windows.getLastFocused();
  const ownerLeft = Number.isFinite(owner.left) ? owner.left : 0;
  const ownerTop = Number.isFinite(owner.top) ? owner.top : 0;
  const ownerWidth = Number.isFinite(owner.width) ? owner.width : 1280;
  const ownerHeight = Number.isFinite(owner.height) ? owner.height : 800;
  const left = Math.max(ownerLeft, ownerLeft + ownerWidth - AD_WINDOW_WIDTH - 18);
  const top = Math.max(ownerTop, ownerTop + ownerHeight - AD_WINDOW_HEIGHT - 54);
  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("ad-window.html"),
    type: "popup",
    focused: true,
    width: AD_WINDOW_WIDTH,
    height: AD_WINDOW_HEIGHT,
    left,
    top
  });
  if (Number.isInteger(created?.id)) {
    await chrome.storage.local.set({ [AD_WINDOW_STORAGE_KEY]: created.id });
  }
  return { opened: true, reused: false, windowId: created?.id };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "deskframe-ad-window") return;
  adWindowPort = port;
  port.onDisconnect.addListener(() => {
    if (adWindowPort === port) adWindowPort = null;
  });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const stored = await chrome.storage.local.get(AD_WINDOW_STORAGE_KEY);
  if (stored[AD_WINDOW_STORAGE_KEY] === windowId) {
    await chrome.storage.local.remove(AD_WINDOW_STORAGE_KEY);
  }
});

async function ensurePageController(tab) {
  if (isRestrictedUrl(tab.url)) {
    throw new Error("Edge 内部页面和扩展商店页面不能被替换");
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "deskframe:ping" });
    return;
  } catch {
    // The controller has not been injected into this tab yet.
  }

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["content.css"]
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["media.js", "content.js"]
  });
}

async function sendToActivePage(type) {
  const tab = await getActiveTab();
  await ensurePageController(tab);
  return chrome.tabs.sendMessage(tab.id, { type });
}

function scanBilibiliDocument() {
  const found = new Map();
  const bvidPattern = /BV1[0-9A-Za-z]{9}/g;

  function addFrom(value, title = "") {
    if (!value) return;
    const matches = String(value).match(bvidPattern) || [];
    for (const bvid of matches) {
      const normalizedTitle = String(title).replace(/\s+/g, " ").trim().slice(0, 90) || bvid;
      const previous = found.get(bvid);
      if (!previous || (previous.title === bvid && normalizedTitle !== bvid)) {
        found.set(bvid, {
          bvid,
          title: normalizedTitle,
          source: "page"
        });
      }
    }
  }

  addFrom(location.href, document.title);
  document.querySelectorAll("a[href], [data-bvid]").forEach((element) => {
    const title = element.getAttribute("title")
      || element.getAttribute("aria-label")
      || element.querySelector("img[alt]")?.getAttribute("alt")
      || element.textContent;
    addFrom(element.getAttribute("href"), title);
    addFrom(element.getAttribute("data-bvid"), title);
  });

  return Array.from(found.values()).slice(0, 300);
}

async function scanCurrentPage() {
  const tab = await getActiveTab();
  if (!/^https:\/\/([^/]+\.)?bilibili\.com\//i.test(tab.url || "")) {
    throw new Error("请先打开一个 Bilibili 视频、合集、UP 主或搜索结果页面");
  }

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: scanBilibiliDocument
  });
  return Array.isArray(execution?.result) ? execution.result : [];
}

function extractBvid(value) {
  return String(value || "").match(/BV1[0-9A-Za-z]{9}/)?.[0] || null;
}

async function resolveShortLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "b23.tv") {
    return null;
  }

  try {
    const response = await fetch(url.href, {
      method: "HEAD",
      redirect: "follow",
      credentials: "omit"
    });
    const bvid = extractBvid(response.url);
    if (bvid) {
      return { bvid, title: bvid, source: "short-link" };
    }
  } catch {
    // Some short-link servers do not accept HEAD requests; GET is the fallback.
  }

  try {
    const response = await fetch(url.href, {
      method: "GET",
      redirect: "follow",
      credentials: "omit"
    });
    const bvid = extractBvid(response.url);
    return bvid ? { bvid, title: bvid, source: "short-link" } : null;
  } catch {
    return null;
  }
}

async function resolveShortLinks(values) {
  const unique = [...new Set(values)].slice(0, 30);
  const resolved = await Promise.allSettled(unique.map(resolveShortLink));
  return resolved
    .filter((item) => item.status === "fulfilled" && item.value)
    .map((item) => item.value);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handle = async () => {
    switch (message?.type) {
      case "deskframe:activate-picker":
        return sendToActivePage("deskframe:pick");
      case "deskframe:create-zone":
        return sendToActivePage("deskframe:create-zone");
      case "deskframe:open-ad-window":
        return openAdWindow();
      case "deskframe:activate-reader":
        return sendToActivePage("deskframe:pick-reader");
      case "deskframe:restore":
        return sendToActivePage("deskframe:restore");
      case "deskframe:toggle-controls":
        return sendToActivePage("deskframe:toggle-controls");
      case "deskframe:scan-current-page":
        return { items: await scanCurrentPage() };
      case "deskframe:resolve-short-links":
        return { items: await resolveShortLinks(message.urls || []) };
      case "deskframe:komiic-referrer":
        return setKomiicReferrerRule(message.comicId, message.chapterId);
      case "deskframe:open-shortcuts":
        await chrome.tabs.create({ url: "edge://extensions/shortcuts" });
        return { opened: true };
      default:
        throw new Error("未知操作");
    }
  };

  handle()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-ad-window") {
    try {
      await openAdWindow();
    } catch {
      // Browser-window creation failures are intentionally ignored for shortcuts.
    }
    return;
  }

  const commandToMessage = {
    "activate-picker": "deskframe:pick",
    "next-video": "deskframe:next",
    "previous-video": "deskframe:previous",
    "toggle-controls": "deskframe:toggle-controls",
    "restore-page": "deskframe:restore",
    "activate-reader": "deskframe:pick-reader",
    "reader-next": "deskframe:reader-next",
    "reader-previous": "deskframe:reader-previous"
  };
  const type = commandToMessage[command];
  if (!type) return;

  try {
    const result = await sendToActivePage(type);
    if (!result?.active && adWindowPort && (command === "next-video" || command === "previous-video")) {
      adWindowPort.postMessage({ type: command === "next-video" ? "next" : "previous" });
    }
  } catch {
    if (adWindowPort && (command === "next-video" || command === "previous-video")) {
      adWindowPort.postMessage({ type: command === "next-video" ? "next" : "previous" });
    }
  }
});
