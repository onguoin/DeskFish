const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const chapterList = require(path.resolve(__dirname, "../edge-extension/comic/chapter-list.js"));

test("keeps source order and only removes duplicate chapter IDs", () => {
  const input = [
    { id: "event", title: "300話紀念活動第一彈！" },
    { id: "a", title: "尊敬的金龍公主殿下" },
    { id: "b", title: "尊敬的金龍公主殿下" },
    { id: "chapter-2", title: "罪惡星球" },
    { id: "chapter-1", title: "罪惡得手" },
    { id: "a", title: "重复 ID" },
    { title: "没有 ID 的原始条目" },
    { title: "没有 ID 的原始条目" }
  ];

  assert.deepEqual(chapterList.normalize(input).map((chapter) => chapter.title), [
    "300話紀念活動第一彈！",
    "尊敬的金龍公主殿下",
    "尊敬的金龍公主殿下",
    "罪惡星球",
    "罪惡得手",
    "没有 ID 的原始条目",
    "没有 ID 的原始条目"
  ]);
});

test("creates display-only one-based ordinals", () => {
  assert.equal(chapterList.ordinal(0), "001");
  assert.equal(chapterList.ordinal(8), "009");
  assert.equal(chapterList.ordinal(99), "100");
});

test("optionally sorts only explicit chapter numbers and source chapter slots", () => {
  const input = [
    { id: "/user/page_direct?chapter_slot=12", title: "第12话 继续" },
    { id: "/user/page_direct?chapter_slot=2", title: "第2话 开始" },
    { id: "/user/page_direct?chapter_slot=3", title: "特别番外" }
  ];
  const sourceOrder = chapterList.order(input, false);
  assert.deepEqual(sourceOrder.map((chapter) => chapter.title), ["第12话 继续", "第2话 开始", "特别番外"]);
  const numericOrder = chapterList.order(sourceOrder, true);
  assert.deepEqual(numericOrder.map((chapter) => chapter.title), ["第2话 开始", "特别番外", "第12话 继续"]);
  assert.deepEqual(chapterList.order(numericOrder, false).map((chapter) => chapter.title), [
    "第12话 继续", "第2话 开始", "特别番外"
  ]);
});

test("keeps unnumbered entries stable after numbered chapters", () => {
  const ordered = chapterList.order([
    { id: "event-a", title: "QQ飞车特别番外篇" },
    { id: "c10", title: "第10章 十" },
    { id: "event-b", title: "更新通知" },
    { id: "c1", title: "第1章 一" }
  ], true);
  assert.deepEqual(ordered.map((chapter) => chapter.title), ["第1章 一", "第10章 十", "QQ飞车特别番外篇", "更新通知"]);
});

test("manager does not reverse the chapter rows", () => {
  const manager = fs.readFileSync(path.resolve(__dirname, "../edge-extension/comic/manager.js"), "utf8");
  assert.doesNotMatch(manager, /series\.chapters[^;\n]*\.reverse\s*\(/);
});
