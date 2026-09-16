const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const bridge = fs.readFileSync(
  path.join(__dirname, "..", "edge-extension", "frame-bridge.js"),
  "utf8"
);

assert.match(bridge, /\.bpx-player-relation-button,/);
assert.match(bridge, /\.bpx-player-loading-panel,/);
assert.match(bridge, /\.bpx-player-state-wrap,/);
assert.match(bridge, /\.bpx-player-mini-state,/);
assert.match(
  bridge,
  /button, a, \[role='button'\], \.bpx-player-relation-button/
);

console.log("Bilibili player chrome cleanup regression: PASS");
