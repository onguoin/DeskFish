(function exposeChapterParser(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeskFishEbookChapterParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MAX_HEADING_LENGTH = 80;
  const chineseNumber = "[0-9零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟两兩]+";
  const headingPatterns = [
    new RegExp(`^(?:正文\\s*)?第\\s*${chineseNumber}\\s*[章回节節卷部篇集幕](?:\\s*[-—_:：、.．]?\\s*.{0,48})?$`, "i"),
    new RegExp(`^(?:卷|篇|部)\\s*${chineseNumber}(?:\\s*[-—_:：、.．]?\\s*.{0,48})?$`, "i"),
    /^(?:序章|楔子|引子|前言|序言|正文|终章|終章|尾声|尾聲|后记|後記|完结感言|完結感言)(?:(?:\s*[-—_:：、.．]\s*|\s+).{1,48})?$/i,
    /^(?:番外|外传|外傳|特别篇|特別篇|附录|附錄)(?:(?:\s*[-—_:：、.．]\s*|\s+).{1,48})?$/i,
    /^(?:chapter|book|part)\s+(?:\d+|[ivxlcdm]+)(?:\s*[-—_:：.．]?\s*.{0,48})?$/i,
    /^(?:prologue|epilogue|preface|introduction)(?:\s*[-—_:：.．]?\s*.{0,48})?$/i
  ];

  function normalizeHeading(value) {
    return String(value || "").replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
  }

  function isChapterHeading(value) {
    const title = normalizeHeading(value);
    return Boolean(title)
      && Array.from(title).length <= MAX_HEADING_LENGTH
      && headingPatterns.some((pattern) => pattern.test(title));
  }

  function createDetector() {
    let remainder = "";
    let characterOffset = 0;
    let rawChapters = [];
    let finished = false;
    let firstBlock = true;

    function consumeLine(line) {
      let text = String(line || "");
      if (firstBlock) {
        text = text.replace(/^\uFEFF/, "");
        firstBlock = false;
      }
      const title = normalizeHeading(text);
      if (isChapterHeading(title)) {
        rawChapters.push({ title, offset: characterOffset });
      }
      const characters = Array.from(text.replace(/\s+/g, ""));
      characterOffset += characters.length;
      return characters;
    }

    function consumePlain(text) {
      let value = String(text || "");
      if (firstBlock) {
        value = value.replace(/^\uFEFF/, "");
        firstBlock = false;
      }
      const characters = Array.from(value.replace(/\s+/g, ""));
      characterOffset += characters.length;
      return characters;
    }

    function push(value) {
      if (finished) throw new Error("章节识别器已经结束");
      remainder += String(value || "");
      const output = [];
      const newline = /\r\n|\n|\r/g;
      let start = 0;
      let match;
      while ((match = newline.exec(remainder)) !== null) {
        output.push(...consumeLine(remainder.slice(start, match.index)));
        start = match.index + match[0].length;
      }
      remainder = remainder.slice(start);
      const buffered = Array.from(remainder);
      if (buffered.length > 8192) {
        const safeLength = buffered.length - 4096;
        output.push(...consumePlain(buffered.slice(0, safeLength).join("")));
        remainder = buffered.slice(safeLength).join("");
      }
      return output;
    }

    function finish() {
      if (finished) return { characters: [], chapters: finalizeChapters(), length: characterOffset };
      const characters = consumeLine(remainder);
      remainder = "";
      finished = true;
      return { characters, chapters: finalizeChapters(), length: characterOffset };
    }

    function finalizeChapters() {
      const chapters = [];
      const seenOffsets = new Set();
      for (const chapter of rawChapters) {
        if (seenOffsets.has(chapter.offset)) continue;
        seenOffsets.add(chapter.offset);
        chapters.push(chapter);
      }
      if (!chapters.length) chapters.push({ title: "全文", offset: 0 });
      else if (chapters[0].offset > 0) chapters.unshift({ title: "开头", offset: 0 });
      return chapters.map((chapter, index) => {
        const nextOffset = chapters[index + 1]?.offset ?? characterOffset;
        return {
          id: `local:${index}`,
          title: chapter.title,
          offset: chapter.offset,
          length: Math.max(0, nextOffset - chapter.offset),
          sequence: index
        };
      });
    }

    return { push, finish };
  }

  function parse(value) {
    const detector = createDetector();
    const characters = detector.push(value);
    const result = detector.finish();
    return {
      text: characters.concat(result.characters).join(""),
      chapters: result.chapters,
      length: result.length
    };
  }

  return { createDetector, isChapterHeading, parse };
});
