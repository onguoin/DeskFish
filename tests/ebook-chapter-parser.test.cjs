const test = require("node:test");
const assert = require("node:assert/strict");
const parser = require("../edge-extension/ebook/chapter-parser.js");

test("detects common Chinese and English chapter headings in source order", () => {
  const input = "书名\r\n作者\r\n第一章 初见\r\n正文一。\r\n第2章：重逢\r\n正文二。\r\n番外 小记\r\n尾声。\r\nCHAPTER III The End\r\nDone.";
  const result = parser.parse(input);
  assert.deepEqual(result.chapters.map((chapter) => chapter.title), [
    "开头",
    "第一章 初见",
    "第2章：重逢",
    "番外 小记",
    "CHAPTER III The End"
  ]);
  assert.equal(result.text, input.replace(/\s+/g, ""));
  assert.equal(result.length, Array.from(result.text).length);
  assert.ok(result.chapters.every((chapter, index) => chapter.sequence === index));
});

test("streaming boundaries do not change chapters or character offsets", () => {
  const input = "前言\n内容\n第一章 开始\nabcdef\n第二章 继续\n结束";
  const expected = parser.parse(input);
  const detector = parser.createDetector();
  const output = [];
  for (let index = 0; index < input.length; index += 3) {
    output.push(...detector.push(input.slice(index, index + 3)));
  }
  const final = detector.finish();
  output.push(...final.characters);
  assert.equal(output.join(""), expected.text);
  assert.deepEqual(final.chapters, expected.chapters);
});

test("books without recognizable headings fall back to one full-text chapter", () => {
  const result = parser.parse("这是一段普通文字。\n这里仍然不是章节标题。");
  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].title, "全文");
  assert.equal(result.chapters[0].offset, 0);
  assert.equal(result.chapters[0].length, result.length);
});

test("very long lines are streamed without retaining the whole book", () => {
  const input = "甲".repeat(20000);
  const detector = parser.createDetector();
  const first = detector.push(input);
  const final = detector.finish();
  assert.ok(first.length > 0);
  assert.equal(first.length + final.characters.length, 20000);
  assert.equal(final.chapters[0].title, "全文");
});
