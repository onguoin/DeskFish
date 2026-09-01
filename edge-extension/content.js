(() => {
  if (globalThis.__deskFrameController) {
    return;
  }

  const SUPPORTED_BOOK_SCHEMA_VERSIONS = new Set([2, 3]);
  const BOOK_CHUNK_PREFIX = "ebookChunk:";

  const state = {
    pickerMode: null,
    hoveredTarget: null,
    wrapper: null,
    originalTarget: null,
    coverTarget: null,
    originalMediaPlayback: [],
    virtualZone: false,
    draggingZone: false,
    controlsVisible: false,
    mediaHovered: false,
    activeMediaType: null,
    mediaToken: null,
    playlist: [],
    currentIndex: 0,
    settings: {
      autoplay: true,
      muted: true,
      danmaku: false,
      hoverReveal: true,
      readerStepPercent: 50
    },
    mediaConfig: {
      type: "bilibili",
      huyaRoom: ""
    },
    comicSelection: null,
    ebook: null,
    ebookOffset: 0,
    reader: null,
    highlight: null,
    pickerBanner: null,
    toast: null
  };

  const controller = {
    pickMedia: () => startPicker("media"),
    pickReader: () => startPicker("reader"),
    restore: restoreAll,
    nextVideo: () => changeVideo(1),
    previousVideo: () => changeVideo(-1),
    toggleControls,
    nextReader: () => changeReader(1),
    previousReader: () => changeReader(-1),
    createZone: createVirtualZone
  };
  globalThis.__deskFrameController = controller;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function clampIndex(index) {
    if (!state.playlist.length) return 0;
    return ((index % state.playlist.length) + state.playlist.length) % state.playlist.length;
  }

  function readableCharacters(value) {
    return Array.from(String(value || "").replace(/\s+/g, ""));
  }

  function isChunkedBook(book) {
    return Boolean(book)
      && SUPPORTED_BOOK_SCHEMA_VERSIONS.has(book.schemaVersion)
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

  function getBookLength(book = state.ebook) {
    return isChunkedBook(book) ? book.length : readableCharacters(book?.text).length;
  }

  function bookChunkKey(bookId, index) {
    return `${BOOK_CHUNK_PREFIX}${bookId}:${index}`;
  }

  async function readBookSlice(book, offset, length) {
    if (!isChunkedBook(book)) {
      return readableCharacters(book?.text).slice(offset, offset + length).join("");
    }

    const start = clamp(offset, 0, book.length);
    const end = clamp(start + length, start, book.length);
    if (start >= end) return "";

    const firstChunk = Math.floor(start / book.chunkSize);
    const lastChunk = Math.floor((end - 1) / book.chunkSize);
    const keys = [];
    for (let index = firstChunk; index <= lastChunk; index += 1) {
      keys.push(bookChunkKey(book.id, index));
    }
    const stored = await chrome.storage.local.get(keys);
    if (keys.some((key) => typeof stored[key] !== "string")) {
      throw new Error("电子书分片缺失，请重新导入 TXT");
    }
    const joined = keys.map((key) => stored[key]).join("");
    const localOffset = start - firstChunk * book.chunkSize;
    return Array.from(joined).slice(localOffset, localOffset + (end - start)).join("");
  }

  async function loadLibrary() {
    const stored = await chrome.storage.local.get([
      "playlist",
      "currentIndex",
      "settings",
      "mediaConfig",
      "comicSelection",
      "ebook",
      "ebookOffset"
    ]);
    state.playlist = Array.isArray(stored.playlist) ? stored.playlist : [];
    state.currentIndex = clampIndex(Number.isInteger(stored.currentIndex) ? stored.currentIndex : 0);
    state.settings = { ...state.settings, ...(stored.settings || {}) };
    state.mediaConfig = { ...state.mediaConfig, ...(stored.mediaConfig || {}) };
    state.comicSelection = stored.comicSelection || null;
    state.ebook = isSupportedBook(stored.ebook) ? stored.ebook : null;
    state.ebookOffset = Number.isInteger(stored.ebookOffset) ? stored.ebookOffset : 0;
  }

  function isEditableTarget(target) {
    return target instanceof Element
      && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function isOwnedElement(target) {
    return target instanceof Element
      && Boolean(target.closest("[data-deskframe-owned], [data-deskframe-reader]"));
  }

  function usableRect(element) {
    if (!(element instanceof Element)) return null;
    const rect = element.getBoundingClientRect();
    return rect.width >= 24 && rect.height >= 18 ? rect : null;
  }

  function boundsAreMediaLike(containerRect, mediaRect) {
    if (!containerRect || !mediaRect) return false;
    const areaRatio = (mediaRect.width * mediaRect.height) / (containerRect.width * containerRect.height);
    const widthRatio = mediaRect.width / containerRect.width;
    const heightRatio = mediaRect.height / containerRect.height;
    return areaRatio >= 0.66 && widthRatio >= 0.76 && heightRatio >= 0.64
      && containerRect.width <= mediaRect.width * 1.28
      && containerRect.height <= mediaRect.height * 1.34;
  }

  function expandMediaSurface(media) {
    let surface = media.matches("img") && media.parentElement?.matches("picture")
      ? media.parentElement
      : media;
    const mediaRect = usableRect(surface) || usableRect(media);
    if (!mediaRect) return surface;

    for (let depth = 0; depth < 4; depth += 1) {
      const parent = surface.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement || isOwnedElement(parent)) break;
      const parentRect = usableRect(parent);
      if (!boundsAreMediaLike(parentRect, mediaRect)) break;
      surface = parent;
    }
    return surface;
  }

  function findMediaTarget(start) {
    if (!(start instanceof Element) || isOwnedElement(start)) return null;
    const directMedia = start.closest("picture, img, video");
    if (directMedia && !isOwnedElement(directMedia)) return expandMediaSurface(directMedia);

    let candidate = start;
    for (let depth = 0; depth < 6 && candidate && candidate !== document.body; depth += 1) {
      const media = Array.from(candidate.querySelectorAll("picture, img, video"))
        .filter((element) => !isOwnedElement(element) && usableRect(element))
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        })[0];
      if (media && boundsAreMediaLike(usableRect(candidate), usableRect(media))) {
        return expandMediaSurface(media);
      }
      candidate = candidate.parentElement;
    }
    return null;
  }

  function isTextCandidate(element) {
    if (!(element instanceof HTMLElement) || isOwnedElement(element)) return false;
    if (element.matches("body, html, input, textarea, select, button, nav, header, footer")) return false;
    const rect = element.getBoundingClientRect();
    const count = readableCharacters(element.innerText || element.textContent).length;
    return count >= 4 && count <= 2000 && rect.width >= 60 && rect.height >= 14 && rect.height <= 500;
  }

  function hasDirectText(element) {
    return Array.from(element.childNodes).some((node) => (
      node.nodeType === Node.TEXT_NODE && readableCharacters(node.textContent).length >= 4
    ));
  }

  function findTextTarget(start) {
    if (!(start instanceof Element) || isOwnedElement(start)) return null;
    const semantic = start.closest(
      "p, li, blockquote, figcaption, td, th, dd, dt, h1, h2, h3, h4, h5, h6"
    );
    if (isTextCandidate(semantic)) return semantic;

    let candidate = start;
    for (let depth = 0; depth < 6 && candidate && candidate !== document.body; depth += 1) {
      if (hasDirectText(candidate) && isTextCandidate(candidate)) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function currentPickerTarget(start) {
    return state.pickerMode === "reader" ? findTextTarget(start) : findMediaTarget(start);
  }

  function ensureHighlight() {
    if (state.highlight) return state.highlight;
    const highlight = document.createElement("div");
    highlight.className = "df-picker-highlight";
    highlight.dataset.deskframeOwned = "true";
    document.documentElement.appendChild(highlight);
    state.highlight = highlight;
    return highlight;
  }

  function positionHighlight(target) {
    const rect = target.getBoundingClientRect();
    const highlight = ensureHighlight();
    highlight.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
    highlight.style.width = `${Math.round(rect.width)}px`;
    highlight.style.height = `${Math.round(rect.height)}px`;
    highlight.hidden = rect.width < 2 || rect.height < 2;
  }

  function showPickerBanner() {
    if (state.pickerBanner) return;
    const banner = document.createElement("div");
    banner.className = "df-picker-banner";
    banner.dataset.deskframeOwned = "true";
    banner.textContent = state.pickerMode === "reader"
      ? "选择一段网页文字 · Esc 取消"
      : "选择一张图片或视频 · Esc 取消";
    document.documentElement.appendChild(banner);
    state.pickerBanner = banner;
  }

  function removePickerChrome() {
    state.highlight?.remove();
    state.pickerBanner?.remove();
    state.highlight = null;
    state.pickerBanner = null;
    state.hoveredTarget = null;
  }

  function stopPicker() {
    if (!state.pickerMode) return;
    state.pickerMode = null;
    document.removeEventListener("pointermove", onPickerMove, true);
    document.removeEventListener("pointerdown", onPickerClick, true);
    document.documentElement.classList.remove("df-is-picking");
    removePickerChrome();
  }

  async function startPicker(mode) {
    await loadLibrary();
    const configurationError = mode === "media" ? mediaConfigurationError() : "";
    if (configurationError) {
      showToast(configurationError);
      return { active: false, reason: "unconfigured-source" };
    }
    if (mode === "reader" && !getBookLength()) {
      showToast("还没有电子书，请先在扩展面板中导入 TXT");
      return { active: false, reason: "empty-ebook" };
    }
    if (mode === "media" && state.wrapper?.isConnected) {
      showToast("播放器已经在页面中；恢复后可以重新选择");
      return { active: true, reason: "already-active" };
    }
    if (mode === "reader" && state.reader?.target?.isConnected) {
      showToast("电子书文字已经在页面中；恢复后可以重新选择");
      return { active: true, reason: "already-active" };
    }

    stopPicker();
    state.pickerMode = mode;
    document.documentElement.classList.add("df-is-picking");
    showPickerBanner();
    document.addEventListener("pointermove", onPickerMove, true);
    document.addEventListener("pointerdown", onPickerClick, true);
    return { active: true, mode };
  }

  function onPickerMove(event) {
    const target = currentPickerTarget(event.target);
    state.hoveredTarget = target;
    if (!target) {
      if (state.highlight) state.highlight.hidden = true;
      return;
    }
    positionHighlight(target);
  }

  function onPickerClick(event) {
    const mode = state.pickerMode;
    const target = currentPickerTarget(event.target) || state.hoveredTarget;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopPicker();
    if (mode === "reader") {
      void mountReader(target).catch((error) => {
        restoreReader(false);
        showToast(error.message || "电子书内容读取失败");
      });
    } else {
      mountPlayer(target);
    }
  }

  function copyLayout(target, wrapper, rect) {
    const computed = getComputedStyle(target);
    const inlineLike = computed.display === "inline" || computed.display === "inline-block";
    const copied = [
      "marginTop", "marginRight", "marginBottom", "marginLeft",
      "verticalAlign", "alignSelf", "justifySelf",
      "gridArea", "gridColumn", "gridRow", "order",
      "top", "right", "bottom", "left", "zIndex"
    ];

    wrapper.style.display = inlineLike ? "inline-block" : computed.display === "none" ? "block" : computed.display;
    wrapper.style.boxSizing = "border-box";
    wrapper.style.width = `${Math.max(1, rect.width)}px`;
    wrapper.style.height = `${Math.max(1, rect.height)}px`;
    wrapper.style.maxWidth = computed.maxWidth;
    wrapper.style.minWidth = computed.minWidth;
    wrapper.style.maxHeight = computed.maxHeight;
    wrapper.style.minHeight = computed.minHeight;
    wrapper.style.position = ["absolute", "fixed", "sticky"].includes(computed.position)
      ? computed.position
      : "relative";
    wrapper.style.borderRadius = computed.borderRadius;
    wrapper.style.cssFloat = computed.cssFloat;
    copied.forEach((property) => {
      wrapper.style[property] = computed[property];
    });
  }

  function mediaConfigurationError() {
    if (state.mediaConfig.type === "bilibili" && !state.playlist.length) {
      return "播放列表还是空的，请先在扩展面板中添加视频";
    }
    if (state.mediaConfig.type === "huya" && !normalizeHuyaRoom(state.mediaConfig.huyaRoom)) {
      return "请先在扩展面板中填写虎牙房间号";
    }
    if (state.mediaConfig.type === "comic" && !state.comicSelection?.id) {
      return "请先在扩展面板中选择一本漫画或一个章节";
    }
    return "";
  }

  function virtualZoneSize() {
    const candidates = Array.from(document.querySelectorAll("article, main, [role='main']"))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.left >= 180 && rect.left <= window.innerWidth * 0.62
        && rect.width >= 420 && rect.height >= 260);
    const contentLeft = candidates.length
      ? Math.min(...candidates.map((rect) => rect.left))
      : 0;
    const availableMargin = contentLeft ? contentLeft - 32 : 0;
    let width = availableMargin >= 220
      ? clamp(availableMargin, 220, 420)
      : clamp(window.innerWidth * 0.26, 240, 360);
    let height = width * 9 / 16;
    const maximumHeight = Math.max(120, window.innerHeight - 140);
    if (height > maximumHeight) {
      height = maximumHeight;
      width = height * 16 / 9;
    }
    return {
      width: Math.round(width),
      height: Math.round(height),
      left: 16,
      top: clamp(96, 16, Math.max(16, window.innerHeight - height - 16))
    };
  }

  function createVirtualCover(size) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 640 360">
        <defs>
          <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#eef2f4"/>
            <stop offset="1" stop-color="#d8e1e6"/>
          </linearGradient>
          <linearGradient id="line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#8297a4"/>
            <stop offset="1" stop-color="#b7c5cd"/>
          </linearGradient>
        </defs>
        <rect width="640" height="360" rx="12" fill="url(#paper)"/>
        <g stroke="#c4d0d6" stroke-width="2" opacity=".75">
          <path d="M54 74H586M54 132H586M54 190H586M54 248H586M54 306H586"/>
        </g>
        <path d="M58 276L138 222L220 250L306 166L392 194L478 112L582 142" fill="none" stroke="url(#line)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
        <g fill="#7e949f">
          <circle cx="138" cy="222" r="9"/><circle cx="306" cy="166" r="9"/><circle cx="478" cy="112" r="9"/>
        </g>
      </svg>`;
    const image = document.createElement("img");
    image.alt = "网页数据概览图";
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    image.style.position = "fixed";
    image.style.left = `${size.left}px`;
    image.style.top = `${size.top}px`;
    image.style.width = `${size.width}px`;
    image.style.height = `${size.height}px`;
    image.style.zIndex = "2147482000";
    image.style.borderRadius = "8px";
    image.style.boxShadow = "0 8px 26px rgb(15 27 36 / 12%)";
    return image;
  }

  async function createVirtualZone() {
    await loadLibrary();
    const configurationError = mediaConfigurationError();
    if (configurationError) {
      showToast(configurationError);
      return { active: false, reason: "unconfigured-source" };
    }
    restoreMedia(false);
    const cover = createVirtualCover(virtualZoneSize());
    document.documentElement.appendChild(cover);
    mountPlayer(cover, { virtualZone: true });
    state.mediaHovered = false;
    setMediaReveal(false);
    showToast("已创建左侧独立区域 · Alt+Shift+H 后可拖动和缩放");
    return { active: true, virtualZone: true };
  }

  function createPlayerUrl(item) {
    const url = new URL("https://player.bilibili.com/player.html");
    url.searchParams.set("bvid", item.bvid);
    url.searchParams.set("autoplay", state.settings.autoplay ? "1" : "0");
    url.searchParams.set("muted", state.settings.muted ? "1" : "0");
    url.searchParams.set("danmaku", state.settings.danmaku ? "1" : "0");
    url.searchParams.set("poster", "1");
    url.searchParams.set("deskframe_token", state.mediaToken);
    url.searchParams.set("deskframe_visible", shouldRevealMedia() ? "1" : "0");
    return url.href;
  }

  function normalizeHuyaRoom(value) {
    const trimmed = String(value || "").trim();
    const pathMatch = trimmed.match(/(?:https?:\/\/)?(?:[^/]+\.)?huya\.com\/(?:iframe\/)?([^/?#]+)/i);
    const candidate = pathMatch?.[1] || trimmed;
    return /^[0-9A-Za-z_-]{2,40}$/.test(candidate) ? candidate : "";
  }

  function createHuyaUrl(room) {
    const url = new URL(`https://liveshare.huya.com/iframe/${encodeURIComponent(room)}`);
    url.searchParams.set("autoplay", state.settings.autoplay ? "1" : "0");
    url.searchParams.set("muted", state.settings.muted ? "1" : "0");
    url.searchParams.set("danmaku", state.settings.danmaku ? "1" : "0");
    url.searchParams.set("deskframe_token", state.mediaToken);
    url.searchParams.set("deskframe_visible", shouldRevealMedia() ? "1" : "0");
    return url.href;
  }

  function createGameUrl(type) {
    const url = new URL(chrome.runtime.getURL("games/index.html"));
    url.searchParams.set("game", type);
    url.searchParams.set("deskframe_token", state.mediaToken);
    url.searchParams.set("deskframe_visible", shouldRevealMedia() ? "1" : "0");
    return url.href;
  }

  function createComicUrl() {
    const url = new URL(chrome.runtime.getURL("comic/index.html"));
    url.searchParams.set("deskframe_token", state.mediaToken);
    url.searchParams.set("deskframe_visible", shouldRevealMedia() ? "1" : "0");
    return url.href;
  }

  function mediaDescriptor() {
    const type = state.activeMediaType || state.mediaConfig.type;
    if (type === "bilibili") {
      const item = state.playlist[clampIndex(state.currentIndex)];
      if (!item) return null;
      return {
        type,
        title: "Bilibili 横屏播放器",
        label: `${clampIndex(state.currentIndex) + 1} / ${state.playlist.length}`,
        detail: item.title || item.bvid,
        src: createPlayerUrl(item)
      };
    }
    if (type === "huya") {
      const room = normalizeHuyaRoom(state.mediaConfig.huyaRoom);
      if (!room) return null;
      return {
        type,
        title: `虎牙直播间 ${room}`,
        label: `虎牙 ${room}`,
        detail: `虎牙直播间 ${room}`,
        src: createHuyaUrl(room)
      };
    }
    const games = {
      gomoku: "五子棋",
      "2048": "2048",
      snake: "贪吃蛇"
    };
    if (games[type]) {
      return {
        type,
        title: `${games[type]}离线小游戏`,
        label: games[type],
        detail: `${games[type]} · 离线运行`,
        src: createGameUrl(type)
      };
    }
    if (type === "comic" && state.comicSelection?.id) {
      return {
        type,
        title: "DeskFish 漫画阅读器",
        label: "漫画",
        detail: `${state.comicSelection.title || "漫画"}${state.comicSelection.chapterTitle ? ` · ${state.comicSelection.chapterTitle}` : ""}`,
        src: createComicUrl()
      };
    }
    return null;
  }

  function makeControl(label, title, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "df-control";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return button;
  }

  function startZoneDrag(event) {
    if (!state.virtualZone || !state.wrapper?.isConnected || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const wrapper = state.wrapper;
    const rect = wrapper.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    state.draggingZone = true;
    state.mediaHovered = true;
    setMediaReveal(true);

    const move = (moveEvent) => {
      const maximumLeft = Math.max(0, window.innerWidth - wrapper.offsetWidth);
      const maximumTop = Math.max(0, window.innerHeight - wrapper.offsetHeight);
      wrapper.style.left = `${clamp(rect.left + moveEvent.clientX - startX, 0, maximumLeft)}px`;
      wrapper.style.top = `${clamp(rect.top + moveEvent.clientY - startY, 0, maximumTop)}px`;
      wrapper.style.right = "auto";
      wrapper.style.bottom = "auto";
    };
    const finish = () => {
      state.draggingZone = false;
      state.mediaHovered = wrapper.matches(":hover");
      setMediaReveal(state.mediaHovered);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
  }

  function mountPlayer(target, options = {}) {
    if (!target.parentNode) return;
    restoreMedia(false);

    const rect = target.getBoundingClientRect();
    const wrapper = document.createElement("div");
    wrapper.className = "df-player-shell";
    wrapper.classList.toggle("df-virtual-shell", Boolean(options.virtualZone));
    wrapper.dataset.deskframeOwned = "true";
    wrapper.tabIndex = 0;
    copyLayout(target, wrapper, rect);

    const iframe = document.createElement("iframe");
    iframe.className = "df-player-frame";
    iframe.title = "Bilibili 横屏播放器";
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.addEventListener("load", () => syncMediaVisibility(true));

    const toolbar = document.createElement("div");
    toolbar.className = "df-toolbar";
    toolbar.dataset.deskframeOwned = "true";

    const counter = document.createElement("span");
    counter.className = "df-counter";
    counter.dataset.role = "counter";
    const previousControl = makeControl("‹", "上一条（Alt+Shift+←）", () => changeVideo(-1));
    previousControl.dataset.role = "previous";
    const nextControl = makeControl("›", "下一条（Alt+Shift+→）", () => changeVideo(1));
    nextControl.dataset.role = "next";
    const dragControl = makeControl("⠿", "拖动独立区域", () => {});
    dragControl.dataset.role = "drag";
    dragControl.hidden = !options.virtualZone;
    dragControl.addEventListener("pointerdown", startZoneDrag);
    toolbar.append(
      counter,
      previousControl,
      nextControl,
      dragControl,
      makeControl("×", "恢复原内容", () => restoreMedia(true))
    );

    const originalParent = target.parentNode;
    const mediaElements = target.matches("video, audio")
      ? [target]
      : Array.from(target.querySelectorAll("video, audio"));
    state.originalMediaPlayback = mediaElements.map((element) => ({
      element,
      wasPlaying: !element.paused && !element.ended
    }));
    mediaElements.forEach((element) => element.pause());

    const coverTarget = target.cloneNode(true);
    coverTarget.classList.add("df-original-cover");
    const coverMediaElements = coverTarget.matches("video, audio")
      ? [coverTarget, ...coverTarget.querySelectorAll("video, audio")]
      : Array.from(coverTarget.querySelectorAll("video, audio"));
    coverMediaElements.forEach((element) => {
      element.removeAttribute("autoplay");
      element.muted = true;
      element.pause();
    });
    originalParent.replaceChild(wrapper, target);
    wrapper.append(iframe, coverTarget, toolbar);
    state.wrapper = wrapper;
    state.originalTarget = target;
    state.coverTarget = coverTarget;
    state.virtualZone = Boolean(options.virtualZone);
    state.controlsVisible = false;
    state.mediaHovered = true;
    state.activeMediaType = state.mediaConfig.type;
    renderCurrentMedia();
    wrapper.addEventListener("pointerenter", () => {
      state.mediaHovered = true;
      setMediaReveal(true);
    });
    wrapper.addEventListener("pointerleave", () => {
      state.mediaHovered = false;
      setMediaReveal(false);
    });
    wrapper.focus({ preventScroll: true });
    showToast(state.settings.hoverReveal
      ? "已替换 · 鼠标移开即恢复伪装，回来继续"
      : "已替换 · Alt+Shift+H 显示控件");
  }

  function shouldRevealMedia() {
    return !state.settings.hoverReveal || state.mediaHovered;
  }

  function syncMediaVisibility(retry = false) {
    if (!state.wrapper?.isConnected) return;
    const frame = state.wrapper.querySelector(".df-player-frame");
    if (!frame?.contentWindow || !state.mediaToken) return;
    const message = {
      type: "deskframe:media-visibility",
      token: state.mediaToken,
      visible: shouldRevealMedia()
    };
    frame.contentWindow.postMessage(message, "*");
    if (retry) {
      window.setTimeout(() => frame.contentWindow?.postMessage(message, "*"), 220);
      window.setTimeout(() => frame.contentWindow?.postMessage(message, "*"), 900);
    }
  }

  function setMediaReveal(forceVisible) {
    if (!state.wrapper?.isConnected) return;
    const visible = state.settings.hoverReveal
      ? Boolean(forceVisible) || state.draggingZone
      : true;
    state.wrapper.classList.toggle("is-revealed", visible);
    syncMediaVisibility();
  }

  function renderCurrentMedia() {
    if (!state.wrapper?.isConnected) return;
    state.currentIndex = clampIndex(state.currentIndex);
    state.mediaToken = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const descriptor = mediaDescriptor();
    if (!descriptor) {
      showToast("当前替换内容还没有配置好");
      return;
    }
    const frame = state.wrapper.querySelector(".df-player-frame");
    const counter = state.wrapper.querySelector("[data-role='counter']");
    const hasPaging = descriptor.type === "bilibili" || descriptor.type === "comic";
    if (frame) {
      frame.title = descriptor.title;
      frame.src = descriptor.src;
    }
    if (counter) {
      counter.textContent = descriptor.label;
      counter.title = descriptor.detail;
    }
    state.wrapper.querySelector("[data-role='previous']")?.toggleAttribute("hidden", !hasPaging);
    state.wrapper.querySelector("[data-role='next']")?.toggleAttribute("hidden", !hasPaging);
    setMediaReveal(shouldRevealMedia());
    if (descriptor.type === "bilibili") chrome.storage.local.set({ currentIndex: state.currentIndex });
  }

  function changeVideo(delta) {
    if (!state.wrapper?.isConnected) {
      showToast("页面中还没有播放器");
      return { active: false };
    }
    if (state.activeMediaType === "comic") {
      const frame = state.wrapper.querySelector(".df-player-frame");
      frame?.contentWindow?.postMessage({
        type: "deskframe:comic-page",
        token: state.mediaToken,
        direction: delta
      }, "*");
      return { active: true, comic: true };
    }
    if (state.activeMediaType !== "bilibili") {
      showToast("当前内容不支持上一条 / 下一条");
      return { active: true, unchanged: true };
    }
    state.currentIndex = clampIndex(state.currentIndex + delta);
    renderCurrentMedia();
    return { active: true, currentIndex: state.currentIndex };
  }

  function toggleControls(force) {
    if (!state.wrapper?.isConnected) {
      showToast("页面中还没有播放器");
      return { active: false };
    }
    state.controlsVisible = typeof force === "boolean" ? force : !state.controlsVisible;
    state.wrapper.querySelector(".df-toolbar")?.classList.toggle("is-visible", state.controlsVisible);
    state.wrapper.classList.toggle("is-controls-visible", state.controlsVisible);
    return { active: true, visible: state.controlsVisible };
  }

  function restoreMedia(notify = false) {
    if (!state.wrapper || !state.originalTarget) {
      return { restored: false };
    }
    const target = state.originalTarget;
    if (state.virtualZone) {
      state.wrapper.remove();
      target.remove();
    } else if (state.wrapper.parentNode) {
      state.wrapper.parentNode.replaceChild(target, state.wrapper);
    }
    state.originalMediaPlayback.forEach(({ element, wasPlaying }) => {
      if (wasPlaying && element.isConnected) element.play().catch(() => {});
    });
    state.wrapper = null;
    state.originalTarget = null;
    state.coverTarget = null;
    state.originalMediaPlayback = [];
    state.virtualZone = false;
    state.draggingZone = false;
    state.controlsVisible = false;
    state.mediaHovered = false;
    state.activeMediaType = null;
    state.mediaToken = null;
    if (notify) showToast("已恢复原图片或视频");
    return { restored: true };
  }

  function readerStepPercent() {
    return clamp(Number.parseInt(state.settings.readerStepPercent, 10) || 50, 1, 100);
  }

  function arrowStepFor(slotCount) {
    return Math.max(1, Math.floor(slotCount * readerStepPercent() / 100));
  }

  function measureFirstLineCharacters(target, text) {
    const textNode = target.firstChild;
    const characters = Array.from(text);
    if (!(textNode instanceof Text) || characters.length <= 1) return Math.max(1, characters.length);

    const codeUnitOffsets = [0];
    for (const character of characters) {
      codeUnitOffsets.push(codeUnitOffsets[codeUnitOffsets.length - 1] + character.length);
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, codeUnitOffsets[1]);
    const firstRect = range.getClientRects()[0];
    if (!firstRect) return Math.max(1, characters.length);

    const endsOnFirstLine = (count) => {
      range.setEnd(textNode, codeUnitOffsets[count]);
      const rects = range.getClientRects();
      const lastRect = rects[rects.length - 1];
      return Boolean(lastRect) && Math.abs(lastRect.top - firstRect.top) <= 1;
    };

    let low = 1;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (endsOnFirstLine(middle)) low = middle;
      else high = middle - 1;
    }
    range.detach?.();
    return Math.max(1, low);
  }

  async function mountReader(target) {
    const bookLength = getBookLength();
    const slotCount = readableCharacters(target.innerText || target.textContent).length;
    if (!bookLength || !slotCount) {
      showToast("这段文字不能用于电子书替换");
      return;
    }

    restoreReader(false);
    const rect = target.getBoundingClientRect();
    const originalFragment = document.createDocumentFragment();
    while (target.firstChild) originalFragment.appendChild(target.firstChild);

    const reader = {
      target,
      originalFragment,
      originalTabIndex: target.getAttribute("tabindex"),
      originalMinHeight: target.style.minHeight,
      slotCount,
      arrowStep: arrowStepFor(slotCount),
      lineStep: 1,
      book: state.ebook,
      bookLength,
      offset: state.ebookOffset,
      renderToken: 0,
      linkAncestor: target.closest("a[href]"),
      wheelEnabled: false,
      wheelAccumulator: 0,
      onPointerDown: null,
      onClick: null,
      onWheel: null
    };

    const activateWheelReading = (event) => {
      if (state.reader !== reader) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const wasEnabled = reader.wheelEnabled;
      reader.wheelEnabled = true;
      reader.target.focus({ preventScroll: true });
      if (!wasEnabled) showToast(`滚轮阅读已开启 · 每格约 ${reader.lineStep} 个字符`);
    };

    reader.onPointerDown = (event) => {
      if (event.button === 0) activateWheelReading(event);
    };
    reader.onClick = activateWheelReading;

    reader.onWheel = (event) => {
      if (state.reader !== reader || !reader.wheelEnabled || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? Math.max(40, reader.target.clientHeight)
          : 1;
      reader.wheelAccumulator += event.deltaY * unit;
      if (Math.abs(reader.wheelAccumulator) < 40) return;
      const direction = reader.wheelAccumulator > 0 ? 1 : -1;
      reader.wheelAccumulator = 0;
      void changeReaderByCharacters(direction, reader.lineStep).catch((error) => {
        showToast(error.message || "电子书翻页失败");
      });
    };

    state.reader = reader;
    target.dataset.deskframeReader = "true";
    target.setAttribute("tabindex", "0");
    target.style.minHeight = `${Math.ceil(rect.height)}px`;
    target.addEventListener("pointerdown", reader.onPointerDown, true);
    target.addEventListener("click", reader.onClick, true);
    target.addEventListener("wheel", reader.onWheel, { passive: false });
    if (reader.linkAncestor && reader.linkAncestor !== target) {
      reader.linkAncestor.addEventListener("pointerdown", reader.onPointerDown, true);
      reader.linkAncestor.addEventListener("click", reader.onClick, true);
    }

    await renderReader(true);
    if (state.reader !== reader) return;
    target.focus({ preventScroll: true });
    showToast(
      `已替换 ${slotCount} 个字符 · 方向键移动 ${reader.arrowStep} 个 · 点击后可滚轮逐行阅读`
    );
  }

  async function renderReader(persist = true) {
    const reader = state.reader;
    if (!reader?.target?.isConnected) return false;
    const maximum = Math.max(0, reader.bookLength - reader.slotCount);
    reader.offset = clamp(reader.offset, 0, maximum);
    const requestedOffset = reader.offset;
    const renderToken = ++reader.renderToken;
    const text = await readBookSlice(reader.book, requestedOffset, reader.slotCount);

    if (state.reader !== reader || renderToken !== reader.renderToken || !reader.target.isConnected) {
      return false;
    }
    if (!text && requestedOffset < reader.bookLength) {
      throw new Error("电子书分片缺失，请重新导入 TXT");
    }

    reader.target.textContent = text;
    reader.lineStep = measureFirstLineCharacters(reader.target, text);
    state.ebookOffset = requestedOffset;
    if (persist) await chrome.storage.local.set({ ebookOffset: requestedOffset });
    return true;
  }

  async function changeReaderByCharacters(direction, amount) {
    const reader = state.reader;
    if (!reader?.target?.isConnected) {
      showToast("页面中还没有电子书文字");
      return { active: false };
    }
    const maximum = Math.max(0, reader.bookLength - reader.slotCount);
    const step = Math.max(1, Math.floor(amount));
    const nextOffset = clamp(reader.offset + direction * step, 0, maximum);
    if (nextOffset === reader.offset) {
      showToast(direction > 0 ? "已经到电子书末尾" : "已经到电子书开头");
      return { active: true, offset: reader.offset };
    }
    reader.offset = nextOffset;
    await renderReader(true);
    if (state.reader === reader) reader.target.focus({ preventScroll: true });
    return { active: true, offset: reader.offset };
  }

  function changeReader(direction) {
    const reader = state.reader;
    return changeReaderByCharacters(direction, reader?.arrowStep || 1);
  }

  function restoreReader(notify = false) {
    const reader = state.reader;
    if (!reader) return { restored: false };
    const { target } = reader;
    reader.renderToken += 1;
    if (target?.isConnected) {
      if (reader.linkAncestor && reader.linkAncestor !== target) {
        reader.linkAncestor.removeEventListener("pointerdown", reader.onPointerDown, true);
        reader.linkAncestor.removeEventListener("click", reader.onClick, true);
      }
      target.removeEventListener("pointerdown", reader.onPointerDown, true);
      target.removeEventListener("click", reader.onClick, true);
      target.removeEventListener("wheel", reader.onWheel);
      target.replaceChildren(reader.originalFragment);
      target.style.minHeight = reader.originalMinHeight;
      target.removeAttribute("data-deskframe-reader");
      if (reader.originalTabIndex === null) target.removeAttribute("tabindex");
      else target.setAttribute("tabindex", reader.originalTabIndex);
    }
    state.reader = null;
    if (notify) showToast("已恢复原网页文字");
    return { restored: true };
  }

  function restoreAll() {
    stopPicker();
    const media = restoreMedia(false).restored;
    const reader = restoreReader(false).restored;
    if (media || reader) showToast("已恢复原网页内容");
    return { restored: media || reader };
  }

  function showToast(message) {
    state.toast?.remove();
    const toast = document.createElement("div");
    toast.className = "df-toast";
    toast.dataset.deskframeOwned = "true";
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    state.toast = toast;
    window.setTimeout(() => {
      if (state.toast === toast) state.toast = null;
      toast.remove();
    }, 2600);
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.pickerMode) {
      event.preventDefault();
      stopPicker();
      return;
    }
    if (isEditableTarget(event.target)) return;

    const key = event.key.toLowerCase();
    let handled = false;

    if (state.reader?.target?.isConnected && event.key === "ArrowRight") {
      void changeReader(1).catch((error) => showToast(error.message || "电子书翻页失败"));
      handled = true;
    } else if (state.reader?.target?.isConnected && event.key === "ArrowLeft") {
      void changeReader(-1).catch((error) => showToast(error.message || "电子书翻页失败"));
      handled = true;
    } else if (state.wrapper?.isConnected && (key === "j" || event.key === "ArrowDown")) {
      changeVideo(1);
      handled = true;
    } else if (state.wrapper?.isConnected && (key === "k" || event.key === "ArrowUp")) {
      changeVideo(-1);
      handled = true;
    } else if (state.wrapper?.isConnected && key === "h") {
      toggleControls();
      handled = true;
    } else if ((state.wrapper?.isConnected || state.reader?.target?.isConnected) && event.key === "Escape") {
      restoreAll();
      handled = true;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.playlist) {
      state.playlist = Array.isArray(changes.playlist.newValue) ? changes.playlist.newValue : [];
      state.currentIndex = clampIndex(state.currentIndex);
      if (!state.playlist.length && state.activeMediaType === "bilibili") restoreMedia(false);
      else if (state.wrapper?.isConnected && state.activeMediaType === "bilibili") renderCurrentMedia();
    }
    if (changes.settings) {
      const previousSettings = state.settings;
      state.settings = { ...state.settings, ...(changes.settings.newValue || {}) };
      const playerSettingsChanged = previousSettings.autoplay !== state.settings.autoplay
        || previousSettings.muted !== state.settings.muted
        || previousSettings.danmaku !== state.settings.danmaku;
      if (state.wrapper?.isConnected && playerSettingsChanged) renderCurrentMedia();
      else if (state.wrapper?.isConnected) setMediaReveal(state.mediaHovered);
      if (state.reader?.target?.isConnected) {
        state.reader.arrowStep = arrowStepFor(state.reader.slotCount);
      }
    }
    if (changes.mediaConfig) {
      state.mediaConfig = { ...state.mediaConfig, ...(changes.mediaConfig.newValue || {}) };
      if (state.wrapper?.isConnected) {
        state.activeMediaType = state.mediaConfig.type;
        renderCurrentMedia();
      }
    }
    if (changes.comicSelection) {
      state.comicSelection = changes.comicSelection.newValue || null;
      if (!state.comicSelection && state.activeMediaType === "comic") restoreMedia(false);
      else if (state.wrapper?.isConnected && state.activeMediaType === "comic") renderCurrentMedia();
    }
    if (changes.ebook) {
      state.ebook = isSupportedBook(changes.ebook.newValue) ? changes.ebook.newValue : null;
      if (!state.ebook) {
        restoreReader(false);
      } else if (state.reader?.target?.isConnected) {
        state.reader.book = state.ebook;
        state.reader.bookLength = getBookLength();
        state.reader.offset = 0;
        void renderReader(true).catch((error) => showToast(error.message || "电子书读取失败"));
      }
    }
    if (changes.ebookOffset && state.reader?.target?.isConnected) {
      const nextOffset = Number.isInteger(changes.ebookOffset.newValue) ? changes.ebookOffset.newValue : 0;
      if (nextOffset !== state.reader.offset) {
        state.reader.offset = nextOffset;
        void renderReader(false).catch((error) => showToast(error.message || "电子书读取失败"));
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const handle = async () => {
      switch (message?.type) {
        case "deskframe:ping":
          return { loaded: true };
        case "deskframe:pick":
          return startPicker("media");
        case "deskframe:create-zone":
          return createVirtualZone();
        case "deskframe:pick-reader":
          return startPicker("reader");
        case "deskframe:restore":
          return restoreAll();
        case "deskframe:next":
          await loadLibrary();
          return changeVideo(1);
        case "deskframe:previous":
          await loadLibrary();
          return changeVideo(-1);
        case "deskframe:toggle-controls":
          return toggleControls();
        case "deskframe:reader-next":
          await loadLibrary();
          return changeReader(1);
        case "deskframe:reader-previous":
          await loadLibrary();
          return changeReader(-1);
        default:
          return { ignored: true };
      }
    };

    handle()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });
})();
