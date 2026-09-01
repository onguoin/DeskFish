(() => {
  const parameters = new URL(location.href).searchParams;
  const token = parameters.get("deskframe_token");
  if (!token) return;

  let visible = parameters.get("deskframe_visible") === "1";
  const shouldMute = parameters.get("muted") === "1";
  const shouldShowDanmaku = parameters.get("danmaku") === "1";
  const resumeCandidates = new Set();
  const isBilibili = location.hostname === "player.bilibili.com";
  const isHuya = location.hostname === "liveshare.huya.com";
  let scrubScheduled = false;
  const scrubRoots = new Set();

  function syncHuyaDanmaku() {
    if (!isHuya) return;
    const toggle = document.querySelector("#player-danmu-btn, .danmu-show-btn, [title*='弹幕']");
    if (!(toggle instanceof HTMLElement)) return;
    const title = String(toggle.title || toggle.getAttribute("aria-label") || "");
    const isEnabled = title.includes("关闭弹幕");
    const isDisabled = title.includes("开启弹幕");
    if (!isEnabled && !isDisabled) return;
    const desired = shouldShowDanmaku ? "on" : "off";
    if (toggle.dataset.deskframeDanmaku === desired) return;
    toggle.dataset.deskframeDanmaku = desired;
    if (isEnabled !== shouldShowDanmaku) toggle.click();
  }

  function installCleanPlayerStyle() {
    if (!isBilibili && !isHuya) return;
    const style = document.createElement("style");
    style.dataset.deskframeCleanPlayer = "true";
    style.textContent = `
      html, body { overflow: hidden !important; background: #000 !important; }
      video { max-width: 100% !important; max-height: 100% !important; }
      ${isBilibili ? `
        .bpx-player-control-wrap,
        .bpx-player-top-wrap,
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
        [class*="ending-panel"] { display: none !important; }
      ` : ""}
      ${isHuya ? `
        #player-ctrl-wrap,
        .player-ctrl-wrap,
        .player-ctrl-btn,
        .activity-enter,
        [class*="room-jump"],
        [class*="go-room"],
        [class*="player-control"],
        [class*="playerControl"],
        [class*="player_ctrl"],
        [class*="control-wrap"],
        [class*="enter-room"],
        [class*="enterRoom"],
        [class*="room-enter"],
        [class*="quality-panel"],
        [class*="danmu-switch"],
        [class*="barrage-switch"] { display: none !important; }
        #app,
        #video_container,
        #player-wrap,
        .player-wrap,
        #player-video,
        .player-video { width: 100% !important; height: 100% !important; }
      ` : ""}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function scrubPlatformChrome(roots = [document]) {
    if (!isBilibili && !isHuya) return;
    const phrases = isHuya
      ? ["进入直播间", "打开虎牙", "超清", "高清", "流畅", "弹幕"]
      : ["进入哔哩哔哩", "打开客户端", "登录后观看", "相关推荐"];
    const nodes = new Set();
    for (const root of roots) {
      if (!(root instanceof Element) && root !== document) continue;
      if (root instanceof Element && root.matches("button, a, [role='button']")) nodes.add(root);
      root.querySelectorAll?.("button, a, [role='button']").forEach((node) => nodes.add(node));
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
      syncHuyaDanmaku();
    }, 180);
  }

  function mediaElements() {
    return Array.from(document.querySelectorAll("video, audio"));
  }

  function pauseMedia(element, remember = true) {
    if (!(element instanceof HTMLMediaElement)) return;
    if (shouldMute) element.muted = true;
    if (remember && !element.paused && !element.ended) resumeCandidates.add(element);
    if (!element.paused) element.pause();
  }

  function applyVisibility() {
    if (!visible) {
      mediaElements().forEach((element) => pauseMedia(element));
      return;
    }

    for (const element of Array.from(resumeCandidates)) {
      if (!element.isConnected) {
        resumeCandidates.delete(element);
        continue;
      }
      if (shouldMute) element.muted = true;
      element.play()
        .then(() => resumeCandidates.delete(element))
        .catch(() => {
          // Keep it queued: some embeds reject play until their own initialization finishes.
        });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type !== "deskframe:media-visibility") return;
    if (event.data.token !== token) return;
    visible = Boolean(event.data.visible);
    applyVisibility();
  });

  document.addEventListener("play", (event) => {
    if (!visible && event.target instanceof HTMLMediaElement) {
      pauseMedia(event.target);
    }
  }, true);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (!visible) {
          if (node.matches("video, audio")) pauseMedia(node);
          node.querySelectorAll("video, audio").forEach((element) => pauseMedia(element));
        }
        schedulePlatformScrub(node);
      }
    }
  });

  const begin = () => {
    installCleanPlayerStyle();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scrubPlatformChrome();
    syncHuyaDanmaku();
    window.setTimeout(syncHuyaDanmaku, 350);
    window.setTimeout(syncHuyaDanmaku, 1000);
    window.setTimeout(syncHuyaDanmaku, 2200);
    applyVisibility();
  };

  if (document.documentElement) begin();
  else document.addEventListener("DOMContentLoaded", begin, { once: true });
})();
