(() => {
  const params = new URL(location.href).searchParams;
  const token = params.get("deskframe_token") || "";
  const room = params.get("room") || "";
  const platform = params.get("platform") || "huya";
  const video = document.querySelector("#liveVideo");
  const status = document.querySelector("#status");
  let playbackActive = params.get("deskframe_playback") !== "0";
  let generation = 0;
  let requestController = null;
  let hls = null;
  let lastTime = -1;
  let lastProgressAt = Date.now();
  let lastReconnectAt = 0;

  video.muted = params.get("muted") !== "0";

  function showStatus(message) {
    status.textContent = message;
    status.hidden = false;
  }

  async function connect() {
    const currentGeneration = ++generation;
    requestController?.abort();
    requestController = new AbortController();
    showStatus("正在连接 DeskFish 本地直播引擎…");
    try {
      if (platform !== "huya") throw new Error("暂不支持这个直播平台");
      const endpoint = new URL("http://127.0.0.1:47653/api/v1/live/huya");
      endpoint.searchParams.set("room", room);
      const response = await fetch(endpoint, { cache: "no-store", signal: requestController.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `本地直播引擎返回 ${response.status}`);
      if (currentGeneration !== generation) return;
      document.title = [payload.anchor, payload.title].filter(Boolean).join(" · ") || "DeskFish 虎牙直播";
      hls?.destroy();
      hls = null;
      video.removeAttribute("src");
      video.load();
      if (globalThis.Hls?.isSupported()) {
        hls = new globalThis.Hls({
          debug: false,
          enableWorker: false,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5,
          manifestLoadingMaxRetry: 3,
          fragLoadingMaxRetry: 4
        });
        hls.attachMedia(video);
        hls.loadSource(payload.streamUrl);
        hls.on(globalThis.Hls.Events.MANIFEST_PARSED, () => {
          if (playbackActive) video.play().catch(() => {});
        });
        hls.on(globalThis.Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === globalThis.Hls.ErrorTypes.NETWORK_ERROR) {
            hls?.startLoad();
          } else if (data.type === globalThis.Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else if (Date.now() - lastReconnectAt > 5000) {
            lastReconnectAt = Date.now();
            void connect();
          }
        });
      } else {
        video.src = payload.streamUrl;
        video.load();
        if (playbackActive) await video.play().catch(() => {});
      }
      lastTime = -1;
      lastProgressAt = Date.now();
    } catch (error) {
      if (error?.name === "AbortError") return;
      showStatus(`${error.message || "虎牙直播连接失败"}\n请确认 DeskFish.exe 正在运行`);
    }
  }

  function setPlayback(next) {
    playbackActive = Boolean(next);
    if (!playbackActive) {
      video.pause();
      return;
    }
    video.play().catch(() => {});
  }

  video.addEventListener("playing", () => {
    status.hidden = true;
    lastProgressAt = Date.now();
  });
  video.addEventListener("waiting", () => {
    status.textContent = "直播缓冲中…";
    status.hidden = false;
  });
  video.addEventListener("error", () => {
    if (hls) return;
    if (Date.now() - lastReconnectAt < 5000) return;
    lastReconnectAt = Date.now();
    void connect();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "deskframe:media-visibility") return;
    if (event.data.token !== token) return;
    setPlayback(typeof event.data.playbackActive === "boolean" ? event.data.playbackActive : event.data.visible);
  });

  window.setInterval(() => {
    if (!playbackActive || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const now = Date.now();
    if (video.currentTime > lastTime + 0.08 || video.currentTime < lastTime - 0.5) {
      lastTime = video.currentTime;
      lastProgressAt = now;
      return;
    }
    if (video.paused) video.play().catch(() => {});
    if (now - lastProgressAt > 12000 && now - lastReconnectAt > 15000) {
      lastReconnectAt = now;
      void connect();
    }
  }, 4000);

  window.addEventListener("beforeunload", () => {
    requestController?.abort();
    hls?.destroy();
  }, { once: true });
  void connect();
})();
