const assert = require("node:assert/strict");
const media = require("../edge-extension/media.js");

assert.equal(media.normalizeHuyaRoom("https://www.huya.com/660000?from=deskfish"), "660000");
assert.equal(media.normalizeHuyaRoom("bad room"), "");
assert.equal(media.normalizeBilibiliLiveRoom("https://live.bilibili.com/1735947155?live_from=deskfish"), "1735947155");
assert.equal(media.normalizeBilibiliLiveRoom("BV1invalid"), "");

assert.equal(media.isLiveMediaType("huya"), true);
assert.equal(media.isLiveMediaType("bilibili-live"), true);
assert.equal(media.isLiveMediaType("bilibili"), false);
assert.equal(media.shouldKeepPlaying("huya", false), true);
assert.equal(media.shouldKeepPlaying("bilibili-live", false), true);
assert.equal(media.shouldKeepPlaying("bilibili", false), false);
assert.equal(media.shouldKeepPlaying("bilibili", true), true);

const liveUrl = new URL(media.createBilibiliLivePlayerUrl(
  "https://live.bilibili.com/1735947155",
  { danmaku: false, muted: true },
  { token: "test-token", revealed: false }
));
assert.equal(liveUrl.hostname, "www.bilibili.com");
assert.equal(liveUrl.searchParams.get("cid"), "1735947155");
assert.equal(liveUrl.searchParams.get("entrance"), "0");
assert.equal(liveUrl.searchParams.get("sendpanel"), "0");
assert.equal(liveUrl.searchParams.get("danmaku"), "0");
assert.equal(liveUrl.searchParams.get("enableCtrlUI"), "0");
assert.equal(liveUrl.searchParams.get("deskframe_visible"), "0");
assert.equal(liveUrl.searchParams.get("deskframe_playback"), "1");
assert.equal(liveUrl.searchParams.get("deskframe_live"), "1");

console.log("Live media configuration regression: PASS");
