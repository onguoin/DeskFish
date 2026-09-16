(() => {
  const parameters = new URL(location.href).searchParams;
  const token = parameters.get("deskframe_token");
  if (!token) return;

  let visible = parameters.get("deskframe_visible") === "1";
  let playbackActive = parameters.has("deskframe_playback")
    ? parameters.get("deskframe_playback") === "1"
    : visible;
  const shouldMute = parameters.get("muted") === "1" || parameters.get("mute") === "1";
  const resumeCandidates = new Set();
  const isBilibiliLive = location.hostname === "www.bilibili.com"
    && location.pathname.includes("/blackboard/live/");
  const isBilibili = location.hostname === "player.bilibili.com" || isBilibiliLive;
  const isLive = parameters.get("deskframe_live") === "1" || isBilibiliLive;
  let scrubScheduled = false;
  const scrubRoots = new Set();
  let liveMedia = null;
  let liveTime = -1;
  let liveProgressAt = Date.now();
  let liveReportedAt = 0;

  function installCleanPlayerStyle() {
    if (!isBilibili) return;
    const style = document.createElement("style");
    style.dataset.deskframeCleanPlayer = "true";
    style.textContent = `
      html, body { overflow: hidden !important; background: #000 !important; }
      video { max-width: 100% !important; max-height: 100% !important; }
      .bpx-player-control-wrap,
      .bpx-player-top-wrap,
      .bpx-player-relation-button,
      .bpx-player-loading-panel,
      .bpx-player-state-wrap,
      .bpx-player-mini-state,
      .bpx-player-toast-wrap,
      .bpx-player-dialog-wrap,
      .bpx-player-ending-wrap,
      .bpx-player-popular-panel,
      .bpx-player-video-info,
      .bilibili-player-video-control-wrap,
      .bilibili-player-video-top,
      .bilibili-player-video-toast-wrp,
      .bilibili-player-video-panel,
      [class*="recommend-panel"],
      [class*="ending-panel"],
      [class*="activity-entry"],
      [class*="room-entry"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function scrubPlatformChrome(roots = [document]) {
    if (!isBilibili) return;
    const phrases = [
      "进入直播间", "进入哔哩哔哩", "打开哔哩哔哩", "打开客户端", "登录后观看", "相关推荐"
    ];
    const nodes = new Set();
    for (const root of roots) {
      if (!(root instanceof Element) && root !== document) continue;
      const chromeSelector = "button, a, [role='button'], .bpx-player-relation-button";
      if (root instanceof Element && root.matches(chromeSelector)) nodes.add(root);
      root.querySelectorAll?.(chromeSelector).forEach((node) => nodes.add(node));
    }
    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || node.dataset.deskframeHidden === "true") continue;
      if (node.childElementCount > 4) continue;
      const value = String(node.textContent || "").replace(/\s+/g, "").trim();
      if (!value || !phrases.some((phrase) => value === phrase || value.startsWith(phrase))) continue;
      const clickable = node.closest("button, a, [role='button']") || node;
      const rect = clickable.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.94 && rect.height > window.innerHeight * 0.6) continue;
      clickable.dataset.deskframeHidden = "true";
      clickable.style.setProperty("display", "none", "important");
    }
  }

  function schedulePlatformScrub(root) {
    if (root && scrubRoots.size < 80) scrubRoots.add(root);
    if (scrubScheduled) return;
    scrubScheduled = true;
    window.setTimeout(() => {
      scrubScheduled = false;
      const roots = Array.from(scrubRoots);
      scrubRoots.clear();
      scrubPlatformChrome(roots.length ? roots : [document]);
    }, 180);
  }

  function mediaElements(root = document) {
    const elements = [];
    if (root instanceof HTMLMediaElement) elements.push(root);
    root.querySelectorAll?.("video, audio").forEach((element) => elements.push(element));
    return elements;
  }

  function pauseMedia(element, remember = true) {
    if (!(element instanceof HTMLMediaElement)) return;
    if (shouldMute) element.muted = true;
    if (remember && !element.paused && !element.ended) resumeCandidates.add(element);
    if (!element.paused) element.pause();
  }

  function playMedia(element) {
    if (!(element instanceof HTMLMediaElement) || !playbackActive) return;
    if (shouldMute) element.muted = true;
    if (!isLive && !resumeCandidates.has(element)) return;
    element.play()
      .then(() => resumeCandidates.delete(element))
      .catch(() => {
        if (!isLive) resumeCandidates.add(element);
      });
  }

  function applyPlayback() {
    if (!playbackActive) {
      mediaElements().forEach((element) => pauseMedia(element));
      return;
    }
    mediaElements().forEach((element) => playMedia(element));
  }

  function largestLiveMedia() {
    return mediaElements()
      .filter((element) => !element.ended)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;
  }

  function monitorLivePlayback() {
    if (!isLive || !playbackActive) {
      liveMedia = null;
      liveTime = -1;
      liveProgressAt = Date.now();
      return;
    }
    const media = largestLiveMedia();
    if (!media) return;
    const now = Date.now();
    const currentTime = Number(media.currentTime) || 0;
    if (media !== liveMedia || currentTime > liveTime + 0.08 || currentTime < liveTime - 0.5) {
      liveMedia = media;
      liveTime = currentTime;
      liveProgressAt = now;
      return;
    }
    if (media.paused || now - liveProgressAt > 8000) playMedia(media);
    if (now - liveProgressAt > 18000 && now - liveReportedAt > 30000) {
      liveReportedAt = now;
      window.parent.postMessage({ type: "deskframe:media-stalled", token }, "*");
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "deskframe:media-visibility") return;
    if (event.data.token !== token) return;
    visible = Boolean(event.data.visible);
    playbackActive = typeof event.data.playbackActive === "boolean"
      ? event.data.playbackActive
      : visible;
    applyPlayback();
  });

  document.addEventListener("play", (event) => {
    if (!playbackActive && event.target instanceof HTMLMediaElement) pauseMedia(event.target);
  }, true);

  for (const eventName of ["loadeddata", "canplay"]) {
    document.addEventListener(eventName, (event) => {
      if (isLive && playbackActive && event.target instanceof HTMLMediaElement) playMedia(event.target);
    }, true);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const addedMedia = mediaElements(node);
        if (!playbackActive) addedMedia.forEach((element) => pauseMedia(element));
        else if (isLive) addedMedia.forEach((element) => playMedia(element));
        schedulePlatformScrub(node);
      }
    }
  });

  const begin = () => {
    installCleanPlayerStyle();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scrubPlatformChrome();
    applyPlayback();
    if (isLive) window.setInterval(monitorLivePlayback, 4000);
  };

  if (document.documentElement) begin();
  else document.addEventListener("DOMContentLoaded", begin, { once: true });
})();
