const DEFAULT_SETTINGS = {
  autoplay: true,
  muted: true,
  danmaku: false,
  hoverReveal: true,
  readerStepPercent: 50
};

const DEFAULT_MEDIA_CONFIG = {
  type: "bilibili",
  huyaRoom: ""
};

const MEDIA_LABELS = {
  bilibili: "Bilibili · 横屏",
  huya: "虎牙直播 · 横屏",
  gomoku: "五子棋 · 离线",
  "2048": "2048 · 离线",
  snake: "贪吃蛇 · 离线",
  comic: "漫画 · 按页阅读"
};

const BOOK_SCHEMA_VERSION = 2;
const BOOK_CHUNK_CHARACTERS = 64 * 1024;
const FILE_READ_BYTES = 256 * 1024;
const STORAGE_BATCH_SIZE = 256;
const BOOK_CHUNK_PREFIX = "ebookChunk:";

const elements = {
  countBadge: document.querySelector("#countBadge"),
  sourceHint: document.querySelector("#sourceHint"),
  mediaTypeSelect: document.querySelector("#mediaTypeSelect"),
  huyaConfig: document.querySelector("#huyaConfig"),
  huyaRoomInput: document.querySelector("#huyaRoomInput"),
  comicSection: document.querySelector("#comicSection"),
  activateButton: document.querySelector("#activateButton"),
  activateLabel: document.querySelector("#activateLabel"),
  createZoneButton: document.querySelector("#createZoneButton"),
  adWindowButton: document.querySelector("#adWindowButton"),
  videoLibrarySection: document.querySelector("#videoLibrarySection"),
  readerButton: document.querySelector("#readerButton"),
  toggleControlsButton: document.querySelector("#toggleControlsButton"),
  restoreButton: document.querySelector("#restoreButton"),
  scanButton: document.querySelector("#scanButton"),
  clearButton: document.querySelector("#clearButton"),
  linkInput: document.querySelector("#linkInput"),
  addButton: document.querySelector("#addButton"),
  playlist: document.querySelector("#playlist"),
  bookInput: document.querySelector("#bookInput"),
  bookInfo: document.querySelector("#bookInfo"),
  clearBookButton: document.querySelector("#clearBookButton"),
  readerStepInput: document.querySelector("#readerStepInput"),
  autoplayToggle: document.querySelector("#autoplayToggle"),
  mutedToggle: document.querySelector("#mutedToggle"),
  danmakuToggle: document.querySelector("#danmakuToggle"),
  hoverRevealToggle: document.querySelector("#hoverRevealToggle"),
  shortcutsButton: document.querySelector("#shortcutsButton"),
  status: document.querySelector("#status")
};

let playlist = [];
let currentIndex = 0;
let settings = { ...DEFAULT_SETTINGS };
let mediaConfig = { ...DEFAULT_MEDIA_CONFIG };
let ebook = null;
let ebookOffset = 0;
let comicSelection = null;
let statusTimer = null;

function readableCharacterCount(value) {
  return Array.from(String(value || "").replace(/\s+/g, "")).length;
}

function isChunkedBook(book) {
  return Boolean(book)
    && book.schemaVersion === BOOK_SCHEMA_VERSION
    && typeof book.id === "string"
    && Number.isInteger(book.length)
    && book.length >= 0
    && Number.isInteger(book.chunkSize)
    && book.chunkSize > 0
    && Number.isInteger(book.chunkCount)
    && book.chunkCount >= 0;
}

function isSupportedBook(book) {
  return isChunkedBook(book) || Boolean(book && typeof book.text === "string");
}

function getBookLength(book) {
  return isChunkedBook(book) ? book.length : readableCharacterCount(book?.text);
}

function bookChunkKey(bookId, index) {
  return `${BOOK_CHUNK_PREFIX}${bookId}:${index}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / (1024 ** exponent);
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function normalizeHuyaRoom(value) {
  const trimmed = String(value || "").trim();
  const pathMatch = trimmed.match(/(?:https?:\/\/)?(?:[^/]+\.)?huya\.com\/(?:iframe\/)?([^/?#]+)/i);
  const candidate = pathMatch?.[1] || trimmed;
  return /^[0-9A-Za-z_-]{2,40}$/.test(candidate) ? candidate : "";
}

function mediaSourceReady() {
  if (mediaConfig.type === "bilibili") return playlist.length > 0;
  if (mediaConfig.type === "huya") return Boolean(normalizeHuyaRoom(mediaConfig.huyaRoom));
  if (mediaConfig.type === "comic") return Boolean(comicSelection?.id);
  return Object.hasOwn(MEDIA_LABELS, mediaConfig.type);
}

function updateActivationAvailability() {
  elements.activateButton.disabled = !mediaSourceReady();
  elements.createZoneButton.disabled = !mediaSourceReady();
  elements.adWindowButton.disabled = !mediaSourceReady();
}

function renderMediaConfig() {
  const type = Object.hasOwn(MEDIA_LABELS, mediaConfig.type) ? mediaConfig.type : "bilibili";
  mediaConfig.type = type;
  elements.mediaTypeSelect.value = type;
  elements.huyaConfig.hidden = type !== "huya";
  elements.videoLibrarySection.hidden = type !== "bilibili";
  elements.comicSection.hidden = type !== "comic";
  elements.huyaRoomInput.value = mediaConfig.huyaRoom || "";
  elements.sourceHint.textContent = MEDIA_LABELS[type];
  elements.activateLabel.textContent = type === "bilibili"
    ? "选择图片或视频"
    : type === "huya"
      ? "用直播替换图片或视频"
      : type === "comic"
        ? "用漫画替换图片或视频"
        : "用小游戏替换图片或视频";
  elements.countBadge.hidden = type !== "bilibili";
  updateActivationAvailability();
}

function normalizeItem(item) {
  const bvid = String(item?.bvid || "").match(/BV1[0-9A-Za-z]{9}/)?.[0];
  if (!bvid) return null;
  return {
    bvid,
    title: String(item.title || bvid).replace(/\s+/g, " ").trim().slice(0, 90) || bvid,
    source: item.source || "manual"
  };
}

function mergeItems(existing, additions) {
  const byId = new Map();
  [...existing, ...additions].forEach((item) => {
    const normalized = normalizeItem(item);
    if (!normalized) return;
    const previous = byId.get(normalized.bvid);
    if (!previous || previous.title === previous.bvid) {
      byId.set(normalized.bvid, normalized);
    }
  });
  return Array.from(byId.values());
}

function showStatus(message, isError = false) {
  window.clearTimeout(statusTimer);
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
  elements.status.hidden = false;
  statusTimer = window.setTimeout(() => {
    elements.status.hidden = true;
  }, 3200);
}

async function saveLibrary() {
  currentIndex = playlist.length ? Math.min(currentIndex, playlist.length - 1) : 0;
  await chrome.storage.local.set({ playlist, currentIndex });
  renderPlaylist();
}

function renderPlaylist() {
  elements.playlist.replaceChildren();
  elements.countBadge.textContent = String(playlist.length);
  elements.clearButton.disabled = playlist.length === 0;
  updateActivationAvailability();

  if (!playlist.length) {
    const empty = document.createElement("p");
    empty.className = "playlist-empty";
    empty.textContent = "先收集一个页面，或粘贴视频链接";
    elements.playlist.append(empty);
    return;
  }

  playlist.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "playlist-item";

    const copy = document.createElement("div");
    copy.className = "playlist-copy";

    const title = document.createElement("span");
    title.className = "playlist-title";
    title.textContent = item.title || item.bvid;
    title.title = item.title || item.bvid;

    const id = document.createElement("span");
    id.className = "playlist-id";
    id.textContent = item.bvid;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-item";
    remove.textContent = "×";
    remove.title = "从队列移除";
    remove.setAttribute("aria-label", `移除 ${item.title || item.bvid}`);
    remove.addEventListener("click", async () => {
      playlist.splice(index, 1);
      await saveLibrary();
    });

    copy.append(title, id);
    row.append(copy, remove);
    elements.playlist.append(row);
  });
}

function renderBook() {
  elements.bookInfo.replaceChildren();
  const count = getBookLength(ebook);
  elements.readerButton.disabled = count === 0;
  elements.clearBookButton.disabled = count === 0;

  if (!count) {
    elements.bookInfo.textContent = "尚未导入电子书";
    return;
  }

  const name = document.createElement("span");
  name.className = "book-name";
  name.textContent = ebook.name || "未命名电子书.txt";
  name.title = name.textContent;

  const progress = document.createElement("span");
  progress.className = "book-progress";
  const boundedOffset = Math.min(count, Math.max(0, ebookOffset));
  const rawPercent = Math.min(100, (boundedOffset / Math.max(1, count)) * 100);
  const percent = rawPercent > 0 && rawPercent < 1 ? rawPercent.toFixed(2) : Math.round(rawPercent);
  const details = [];
  if (Number.isFinite(ebook.fileSize)) details.push(formatBytes(ebook.fileSize));
  details.push(`${count.toLocaleString()} 字符`);
  if (isChunkedBook(ebook)) details.push(`${ebook.chunkCount.toLocaleString()} 个分片`);
  details.push(`阅读位置 ${boundedOffset.toLocaleString()} · ${percent}%`);
  progress.textContent = details.join(" · ");
  elements.bookInfo.append(name, progress);
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "操作没有完成");
  }
  return response;
}

function parseInput(value) {
  const direct = [];
  const shortLinks = [];
  const lines = String(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const matches = line.match(/BV1[0-9A-Za-z]{9}/g) || [];
    matches.forEach((bvid) => direct.push({ bvid, title: bvid, source: "manual" }));
    const urls = line.match(/https:\/\/b23\.tv\/[0-9A-Za-z_-]+/g) || [];
    shortLinks.push(...urls);
  }

  return { direct, shortLinks };
}

async function addFromInput() {
  const { direct, shortLinks } = parseInput(elements.linkInput.value);
  let resolved = [];
  elements.addButton.disabled = true;
  elements.addButton.textContent = shortLinks.length ? "正在解析短链…" : "正在加入…";
  try {
    if (shortLinks.length) {
      const response = await sendMessage({ type: "deskframe:resolve-short-links", urls: shortLinks });
      resolved = response.items || [];
    }
    const before = playlist.length;
    playlist = mergeItems(playlist, [...direct, ...resolved]);
    await saveLibrary();
    elements.linkInput.value = "";
    const added = playlist.length - before;
    showStatus(added ? `已加入 ${added} 条视频` : "没有发现新的 BV 视频");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    elements.addButton.disabled = false;
    elements.addButton.textContent = "加入队列";
  }
}

async function scanCurrentPage() {
  elements.scanButton.disabled = true;
  try {
    const response = await sendMessage({ type: "deskframe:scan-current-page" });
    const before = playlist.length;
    playlist = mergeItems(playlist, response.items || []);
    await saveLibrary();
    const added = playlist.length - before;
    showStatus(added ? `从当前页面收集了 ${added} 条视频` : "当前页面没有发现新的 BV 视频");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    elements.scanButton.disabled = false;
  }
}

async function saveSettings() {
  const readerStepPercent = Math.min(
    100,
    Math.max(1, Number.parseInt(elements.readerStepInput.value, 10) || 50)
  );
  elements.readerStepInput.value = String(readerStepPercent);
  settings = {
    autoplay: elements.autoplayToggle.checked,
    muted: elements.mutedToggle.checked,
    danmaku: elements.danmakuToggle.checked,
    hoverReveal: elements.hoverRevealToggle.checked,
    readerStepPercent
  };
  await chrome.storage.local.set({ settings });
}

async function removeChunkRange(bookId, chunkCount) {
  if (typeof bookId !== "string" || !Number.isInteger(chunkCount) || chunkCount <= 0) return;
  for (let start = 0; start < chunkCount; start += STORAGE_BATCH_SIZE) {
    const end = Math.min(chunkCount, start + STORAGE_BATCH_SIZE);
    const keys = [];
    for (let index = start; index < end; index += 1) {
      keys.push(bookChunkKey(bookId, index));
    }
    await chrome.storage.local.remove(keys);
  }
}

async function removeBookChunks(book) {
  if (!isChunkedBook(book)) return;
  await removeChunkRange(book.id, book.chunkCount);
}

async function cleanupInterruptedStorage() {
  const stored = await chrome.storage.local.get(["ebookImport", "ebookCleanup"]);
  const candidates = [
    ["ebookImport", stored.ebookImport],
    ["ebookCleanup", stored.ebookCleanup]
  ];
  for (const [markerKey, candidate] of candidates) {
    try {
      if (candidate && typeof candidate.id === "string" && Number.isInteger(candidate.chunkCount)) {
        await removeChunkRange(candidate.id, candidate.chunkCount);
      }
      await chrome.storage.local.remove(markerKey);
    } catch {
      // Keep a failed marker so the next popup session can retry cleanup.
    }
  }
}

async function detectTextEncoding(file) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let offset = 0; offset < file.size; offset += FILE_READ_BYTES) {
    const end = Math.min(file.size, offset + FILE_READ_BYTES);
    const buffer = await file.slice(offset, end).arrayBuffer();
    try {
      decoder.decode(buffer, { stream: true });
    } catch {
      return "gb18030";
    }
    const percent = Math.round((end / Math.max(1, file.size)) * 100);
    showStatus(`正在检测文本编码… ${percent}%`);
  }
  try {
    decoder.decode();
    return "utf-8";
  } catch {
    return "gb18030";
  }
}

async function writeBookChunks(file, encoding) {
  const bookId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const decoder = new TextDecoder(encoding, { fatal: encoding === "utf-8" });
  let pendingCharacters = [];
  let chunkCount = 0;
  let characterCount = 0;
  let isFirstDecodedBlock = true;

  const writeChunk = async (characters) => {
    const text = characters.join("");
    const nextChunkCount = chunkCount + 1;
    await chrome.storage.local.set({
      ebookImport: { id: bookId, chunkCount: nextChunkCount },
      [bookChunkKey(bookId, chunkCount)]: text
    });
    chunkCount = nextChunkCount;
    characterCount += characters.length;
  };

  const appendDecodedText = async (decodedText) => {
    let text = decodedText;
    if (isFirstDecodedBlock) {
      text = text.replace(/^\uFEFF/, "");
      isFirstDecodedBlock = false;
    }
    if (!text) return;
    pendingCharacters = pendingCharacters.concat(Array.from(text.replace(/\s+/g, "")));
    while (pendingCharacters.length >= BOOK_CHUNK_CHARACTERS) {
      const chunk = pendingCharacters.slice(0, BOOK_CHUNK_CHARACTERS);
      pendingCharacters = pendingCharacters.slice(BOOK_CHUNK_CHARACTERS);
      await writeChunk(chunk);
    }
  };

  await chrome.storage.local.set({ ebookImport: { id: bookId, chunkCount: 0 } });

  try {
    for (let offset = 0; offset < file.size; offset += FILE_READ_BYTES) {
      const end = Math.min(file.size, offset + FILE_READ_BYTES);
      const buffer = await file.slice(offset, end).arrayBuffer();
      await appendDecodedText(decoder.decode(buffer, { stream: true }));
      const percent = Math.round((end / Math.max(1, file.size)) * 100);
      showStatus(`正在自动分片… ${percent}% · ${chunkCount.toLocaleString()} 片`);
    }
    await appendDecodedText(decoder.decode());
    if (pendingCharacters.length) await writeChunk(pendingCharacters);
    if (!characterCount) throw new Error("这个 TXT 文件没有可阅读文字");

    return {
      schemaVersion: BOOK_SCHEMA_VERSION,
      id: bookId,
      name: file.name || "未命名电子书.txt",
      length: characterCount,
      chunkSize: BOOK_CHUNK_CHARACTERS,
      chunkCount,
      fileSize: file.size,
      encoding,
      importedAt: Date.now()
    };
  } catch (error) {
    await removeChunkRange(bookId, chunkCount).catch(() => {});
    await chrome.storage.local.remove("ebookImport").catch(() => {});
    throw error;
  }
}

async function importBook(file) {
  const previousBook = ebook;
  elements.bookInput.disabled = true;
  elements.readerButton.disabled = true;
  elements.clearBookButton.disabled = true;

  try {
    const encoding = await detectTextEncoding(file);
    const nextBook = await writeBookChunks(file, encoding);
    const cleanupMarker = isChunkedBook(previousBook)
      ? { id: previousBook.id, chunkCount: previousBook.chunkCount }
      : null;

    await chrome.storage.local.set({
      ebook: nextBook,
      ebookOffset: 0,
      ebookImport: null,
      ebookCleanup: cleanupMarker
    });

    ebook = nextBook;
    ebookOffset = 0;
    renderBook();

    try {
      await removeBookChunks(previousBook);
      await chrome.storage.local.remove(["ebookImport", "ebookCleanup"]);
    } catch {
      // The cleanup marker lets the next popup session finish removing old chunks.
    }

    showStatus(
      `已导入 ${nextBook.length.toLocaleString()} 个字符，自动分成 ${nextBook.chunkCount.toLocaleString()} 片`
    );
  } finally {
    elements.bookInput.disabled = false;
    renderBook();
  }
}

async function initialize() {
  await cleanupInterruptedStorage();
  const stored = await chrome.storage.local.get([
    "playlist",
    "currentIndex",
    "settings",
    "mediaConfig",
    "comicSelection",
    "ebook",
    "ebookOffset"
  ]);
  playlist = mergeItems([], Array.isArray(stored.playlist) ? stored.playlist : []);
  currentIndex = Number.isInteger(stored.currentIndex) ? stored.currentIndex : 0;
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  mediaConfig = { ...DEFAULT_MEDIA_CONFIG, ...(stored.mediaConfig || {}) };
  comicSelection = stored.comicSelection || null;
  ebook = isSupportedBook(stored.ebook) ? stored.ebook : null;
  ebookOffset = Number.isInteger(stored.ebookOffset) ? stored.ebookOffset : 0;
  elements.autoplayToggle.checked = settings.autoplay;
  elements.mutedToggle.checked = settings.muted;
  elements.danmakuToggle.checked = settings.danmaku;
  elements.hoverRevealToggle.checked = settings.hoverReveal;
  elements.readerStepInput.value = String(
    Math.min(100, Math.max(1, Number.parseInt(settings.readerStepPercent, 10) || 50))
  );
  renderPlaylist();
  renderMediaConfig();
  renderBook();
  comicSelection = await globalThis.DeskFrameComicManager.initialize({ showStatus });
  updateActivationAvailability();
}

elements.activateButton.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "deskframe:activate-picker" });
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

elements.createZoneButton.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "deskframe:create-zone" });
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

elements.adWindowButton.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "deskframe:open-ad-window" });
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

elements.readerButton.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "deskframe:activate-reader" });
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

elements.toggleControlsButton.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "deskframe:toggle-controls" });
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

elements.restoreButton.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "deskframe:restore" });
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

elements.scanButton.addEventListener("click", scanCurrentPage);
elements.addButton.addEventListener("click", addFromInput);
elements.mediaTypeSelect.addEventListener("change", async () => {
  mediaConfig.type = elements.mediaTypeSelect.value;
  await chrome.storage.local.set({ mediaConfig });
  renderMediaConfig();
});
document.addEventListener("deskframe:comic-selection-changed", (event) => {
  comicSelection = event.detail || null;
  updateActivationAvailability();
});
elements.huyaRoomInput.addEventListener("input", async () => {
  mediaConfig.huyaRoom = elements.huyaRoomInput.value.trim();
  updateActivationAvailability();
  await chrome.storage.local.set({ mediaConfig });
});
elements.bookInput.addEventListener("change", async () => {
  const [file] = elements.bookInput.files || [];
  if (!file) return;
  try {
    await importBook(file);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    elements.bookInput.value = "";
  }
});
elements.clearButton.addEventListener("click", async () => {
  playlist = [];
  await saveLibrary();
  showStatus("播放队列已清空");
});
elements.clearBookButton.addEventListener("click", async () => {
  const previousBook = ebook;
  ebook = null;
  ebookOffset = 0;
  const cleanupMarker = isChunkedBook(previousBook)
    ? { id: previousBook.id, chunkCount: previousBook.chunkCount }
    : null;
  await chrome.storage.local.set({ ebook: null, ebookOffset: 0, ebookCleanup: cleanupMarker });
  renderBook();
  try {
    await removeBookChunks(previousBook);
    await chrome.storage.local.remove(["ebook", "ebookOffset", "ebookCleanup"]);
  } catch {
    // The marker lets the next popup session resume cleanup without blocking the UI.
  }
  showStatus("电子书已清除");
});
elements.shortcutsButton.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "deskframe:open-shortcuts" });
    window.close();
  } catch (error) {
    showStatus(error.message, true);
  }
});

[elements.autoplayToggle, elements.mutedToggle, elements.danmakuToggle, elements.hoverRevealToggle]
  .forEach((toggle) => toggle.addEventListener("change", saveSettings));
elements.readerStepInput.addEventListener("change", saveSettings);

initialize().catch((error) => showStatus(error.message, true));
