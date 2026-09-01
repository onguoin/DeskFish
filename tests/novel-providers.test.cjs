const test = require("node:test");
const assert = require("node:assert/strict");

globalThis.DeskFishEbookChapterParser = require("../edge-extension/ebook/chapter-parser.js");
const providers = require("../edge-extension/novel/providers.js");

test("exposes three direct official novel sources", () => {
  assert.deepEqual(providers.sources.map((source) => source.id), [
    "gutenberg-direct",
    "wikisource-zh",
    "wikisource-en"
  ]);
  assert.ok(providers.sources.every((source) => source.direct));
});

test("removes Gutenberg boilerplate and preserves readable English spaces", () => {
  const raw = "header\n*** START OF THE PROJECT GUTENBERG EBOOK DEMO ***\nCHAPTER I Start\nHello world.\n*** END OF THE PROJECT GUTENBERG EBOOK DEMO ***\nfooter";
  const split = providers.splitReadableText(providers.trimGutenbergBoilerplate(raw));
  assert.equal(split.text, "CHAPTER I Start Hello world.");
  assert.equal(split.chapters.length, 1);
  assert.equal(split.chapters[0].title, "CHAPTER I Start");
});

test("builds ordered chapter offsets from Wikisource page segments", () => {
  const result = providers.buildSegmentBook([
    { id: "one", title: "第一回 起始", text: "正文一。" },
    { id: "two", title: "第二回 继续", text: "正文二。" }
  ]);
  assert.deepEqual(result.chapters.map((chapter) => chapter.id), ["one", "two"]);
  assert.ok(result.chapters[1].offset > result.chapters[0].offset);
  assert.equal(result.chapters[1].offset + result.chapters[1].length, Array.from(result.text).length);
});

test("maps MediaWiki section titles back to full-text offsets", () => {
  const text = providers.normalizeReadableText("开头。\n第一节\n内容一。\n第二节\n内容二。");
  const chapters = providers.chaptersForTitles(text, ["第一节", "第二节"]);
  assert.deepEqual(chapters.map((chapter) => chapter.title), ["第一节", "第二节"]);
  assert.ok(chapters[0].offset > 0);
  assert.ok(chapters[1].offset > chapters[0].offset);
});
