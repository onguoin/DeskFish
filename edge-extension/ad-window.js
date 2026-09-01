const DEFAULT_SETTINGS = {
  autoplay: true,
  muted: true,
  danmaku: false
};

const DEFAULT_MEDIA_CONFIG = {
  type: "bilibili",
  huyaRoom: ""
};

const shell = document.querySelector("#adShell");
const frame = document.querySelector("#mediaFrame");
const emptyState = document.querySelector("#emptyState");
const port = chrome.runtime.connect({ name: "deskframe-ad-window" });

let playlist = [];
let currentIndex = 0;
let settings = { ...DEFAULT_SETTINGS };
let mediaConfig = { ...DEFAULT_MEDIA_CONFIG };
let mediaToken = "";
let revealed = false;

function clampIndex(value) {
  if (!playlist.length) return 0;
  return (value % playlist.length + playlist.length) % playlist.length;
}

function normalizeHuyaRoom(value) {
  const trimmed = String(value || "").trim();
  const pathMatch = trimmed.match(/(?:https?:\/\/)?(?:[^/]+\.)?huya\.com\/(?:iframe\/)?([^/?#]+)/i);
  const candidate = pathMatch?.[1] || trimmed;
  return /^[0-9A-Za-z_-]{2,40}$/.test(candidate) ? candidate : "";
}

function newToken() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function playerParameters(url) {
  url.searchParams.set("autoplay", settings.autoplay ? "1" : "0");
  url.searchParams.set("muted", settings.muted ? "1" : "0");
  url.searchParams.set("deskframe_token", mediaToken);
  url.searchParams.set("deskframe_visible", revealed ? "1" : "0");
  return url;
}

function mediaUrl() {
  if (mediaConfig.type === "bilibili") {
    const item = playlist[clampIndex(currentIndex)];
    if (!item?.bvid) return "";
    const url = playerParameters(new URL("https://player.bilibili.com/player.html"));
    url.searchParams.set("bvid", item.bvid);
    url.searchParams.set("danmaku", settings.danmaku ? "1" : "0");
    url.searchParams.set("poster", "1");
    return url.href;
  }
  if (mediaConfig.type === "huya") {
    const room = normalizeHuyaRoom(mediaConfig.huyaRoom);
    if (!room) return "";
    const url = playerParameters(new URL(`https://liveshare.huya.com/iframe/${encodeURIComponent(room)}`));
    url.searchParams.set("danmaku", settings.danmaku ? "1" : "0");
    return url.href;
  }
  if (["gomoku", "2048", "snake"].includes(mediaConfig.type)) {
    const url = playerParameters(new URL(chrome.runtime.getURL("games/index.html")));
    url.searchParams.set("game", mediaConfig.type);
    return url.href;
  }
  if (mediaConfig.type === "comic") {
    return playerParameters(new URL(chrome.runtime.getURL("comic/index.html"))).href;
  }
  return "";
}

function syncVisibility(retry = false) {
  if (!frame.contentWindow || !mediaToken) return;
  const message = {
    type: "deskframe:media-visibility",
    token: mediaToken,
    visible: revealed
  };
  frame.contentWindow.postMessage(message, "*");
  if (retry) {
    window.setTimeout(() => frame.contentWindow?.postMessage(message, "*"), 220);
    window.setTimeout(() => frame.contentWindow?.postMessage(message, "*"), 900);
  }
}

function setReveal(next) {
  revealed = Boolean(next) && Boolean(frame.src);
  shell.classList.toggle("is-revealed", revealed);
  syncVisibility();
}

function renderMedia() {
  currentIndex = clampIndex(currentIndex);
  mediaToken = newToken();
  const src = mediaUrl();
  emptyState.hidden = true;
  frame.hidden = !src;
  if (!src) {
    frame.removeAttribute("src");
    setReveal(false);
    return;
  }
  frame.src = src;
  setReveal(false);
}

async function changeVideo(delta) {
  if (mediaConfig.type === "comic") {
    frame.contentWindow?.postMessage({
      type: "deskframe:comic-page",
      token: mediaToken,
      direction: delta
    }, "*");
    return;
  }
  if (mediaConfig.type !== "bilibili" || !playlist.length) return;
  currentIndex = clampIndex(currentIndex + delta);
  await chrome.storage.local.set({ currentIndex });
  renderMedia();
}

shell.addEventListener("pointerenter", () => setReveal(true));
shell.addEventListener("pointerleave", () => setReveal(false));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setReveal(false);
});
frame.addEventListener("load", () => syncVisibility(true));

port.onMessage.addListener((message) => {
  if (message?.type === "next") void changeVideo(1);
  if (message?.type === "previous") void changeVideo(-1);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let shouldRender = false;
  if (changes.playlist) {
    playlist = Array.isArray(changes.playlist.newValue) ? changes.playlist.newValue : [];
    shouldRender = true;
  }
  if (changes.currentIndex) {
    currentIndex = Number.isInteger(changes.currentIndex.newValue) ? changes.currentIndex.newValue : 0;
    shouldRender = true;
  }
  if (changes.settings) {
    settings = { ...settings, ...(changes.settings.newValue || {}) };
    shouldRender = true;
  }
  if (changes.mediaConfig) {
    mediaConfig = { ...mediaConfig, ...(changes.mediaConfig.newValue || {}) };
    shouldRender = true;
  }
  if (shouldRender) renderMedia();
});

async function initialize() {
  const stored = await chrome.storage.local.get(["playlist", "currentIndex", "settings", "mediaConfig"]);
  playlist = Array.isArray(stored.playlist) ? stored.playlist : [];
  currentIndex = Number.isInteger(stored.currentIndex) ? stored.currentIndex : 0;
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  mediaConfig = { ...DEFAULT_MEDIA_CONFIG, ...(stored.mediaConfig || {}) };
  renderMedia();
}

void initialize();
