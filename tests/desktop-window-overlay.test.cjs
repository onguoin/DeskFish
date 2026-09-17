const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const media = require("../edge-extension/media.js");

const bounds = media.calculateDesktopOverlayBounds(
  { left: 100, top: 50, right: 500, bottom: 275 },
  {
    innerWidth: 1200,
    innerHeight: 700,
    outerWidth: 1216,
    outerHeight: 808,
    screenX: -1280,
    screenY: 0,
    devicePixelRatio: 1.25
  }
);
assert.deepEqual(bounds, { left: -1465, top: 188, width: 500, height: 281 });

const clipped = media.calculateDesktopOverlayBounds(
  { left: -20, top: 10, right: 80, bottom: 70 },
  { innerWidth: 100, innerHeight: 80, outerWidth: 100, outerHeight: 80, devicePixelRatio: 1 }
);
assert.deepEqual(clipped, { left: 0, top: 10, width: 80, height: 60 });
assert.equal(media.calculateDesktopOverlayBounds(
  { left: 0, top: 0, right: 20, bottom: 20 },
  { innerWidth: 100, innerHeight: 100 }
), null);

const controller = fs.readFileSync(
  path.join(__dirname, "..", "windows-host", "DesktopWindowOverlayController.cs"),
  "utf8"
);
const content = fs.readFileSync(
  path.join(__dirname, "..", "edge-extension", "content.js"),
  "utf8"
);
assert.match(controller, /SwpNoActivate/);
assert.match(controller, /HideOverlayAndReturnFocus/);
assert.match(controller, /RestoreWindowLocked\(\)/);
assert.match(content, /deskframe:desktop-window-overlay/);
assert.match(content, /stopDesktopOverlayTracking\(true\)/);
assert.match(content, /document\.addEventListener\("visibilitychange"/);

console.log("Desktop window overlay regression: PASS");
