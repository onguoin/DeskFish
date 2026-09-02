(function initializeDeskFishMedia(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }
  root.DeskFishMedia = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const LIVE_MEDIA_TYPES = new Set(["huya", "bilibili-live"]);

  function normalizeHuyaRoom(value) {
    const trimmed = String(value || "").trim();
    const pathMatch = trimmed.match(/(?:https?:\/\/)?(?:[^/]+\.)?huya\.com\/(?:iframe\/)?([^/?#]+)/i);
    const candidate = pathMatch?.[1] || trimmed;
    return /^[0-9A-Za-z_-]{2,40}$/.test(candidate) ? candidate : "";
  }

  function normalizeBilibiliLiveRoom(value) {
    const trimmed = String(value || "").trim();
    const pathMatch = trimmed.match(/(?:https?:\/\/)?live\.bilibili\.com\/(?:blanc\/)?(\d+)/i);
    const candidate = pathMatch?.[1] || trimmed;
    return /^\d{1,20}$/.test(candidate) ? candidate : "";
  }

  function isLiveMediaType(type) {
    return LIVE_MEDIA_TYPES.has(String(type || ""));
  }

  function shouldKeepPlaying(type, revealed) {
    return isLiveMediaType(type) || Boolean(revealed);
  }

  function createBilibiliLivePlayerUrl(roomValue, settings = {}, bridge = {}) {
    const room = normalizeBilibiliLiveRoom(roomValue);
    if (!room) return "";

    const url = new URL("https://www.bilibili.com/blackboard/live/live-activity-player.html");
    url.searchParams.set("cid", room);
    url.searchParams.set("sendpanel", "0");
    url.searchParams.set("quality", "0");
    url.searchParams.set("entrance", "0");
    url.searchParams.set("reload", "0");
    url.searchParams.set("danmaku", settings.danmaku ? "1" : "0");
    url.searchParams.set("fullscreen", "0");
    url.searchParams.set("send", "0");
    url.searchParams.set("recommend", "0");
    url.searchParams.set("logo", "0");
    url.searchParams.set("mute", settings.muted === false ? "0" : "1");
    url.searchParams.set("enableCtrlUI", "0");
    url.searchParams.set("enableAutoPlayTips", "0");
    if (bridge.token) url.searchParams.set("deskframe_token", bridge.token);
    url.searchParams.set("deskframe_visible", bridge.revealed ? "1" : "0");
    url.searchParams.set("deskframe_playback", "1");
    url.searchParams.set("deskframe_live", "1");
    return url.href;
  }

  return Object.freeze({
    normalizeHuyaRoom,
    normalizeBilibiliLiveRoom,
    isLiveMediaType,
    shouldKeepPlaying,
    createBilibiliLivePlayerUrl
  });
});
