(function installChapterList(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DeskFishComicChapterList = api;
})(globalThis, () => {
  function stableChapterId(chapter) {
    return String(chapter?.id ?? chapter?.selectionId ?? "").trim();
  }

  function normalize(chapters) {
    const seenIds = new Set();
    return Array.from(chapters || []).filter((chapter) => {
      const id = stableChapterId(chapter);
      if (!id) return true;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  }

  function explicitChapterNumber(chapter) {
    const supplied = Number(chapter?.number);
    if (chapter?.number !== null && chapter?.number !== undefined && Number.isFinite(supplied)) return supplied;
    const title = String(chapter?.title || "");
    const titleMatch = title.match(/第\s*(\d+(?:\.\d+)?)\s*(?:话|話|章|回|卷)/i)
      || title.match(/^\s*(\d+(?:\.\d+)?)\s*(?:话|話|章|回|卷)(?:\s|[：:._-]|$)/i);
    if (titleMatch) return Number.parseFloat(titleMatch[1]);
    const id = stableChapterId(chapter);
    const slotMatch = id.match(/(?:[?&]|&amp;)chapter_slot=(\d+(?:\.\d+)?)/i);
    return slotMatch ? Number.parseFloat(slotMatch[1]) : null;
  }

  function order(chapters, automatic = false) {
    const hydrated = normalize(chapters).map((chapter, index) => ({
      ...chapter,
      sourceOrder: Number.isFinite(Number(chapter?.sourceOrder)) ? Number(chapter.sourceOrder) : index
    }));
    if (!automatic) return hydrated.sort((left, right) => left.sourceOrder - right.sourceOrder);
    return hydrated.sort((left, right) => {
      const leftNumber = explicitChapterNumber(left);
      const rightNumber = explicitChapterNumber(right);
      if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
      if (leftNumber !== null && rightNumber === null) return -1;
      if (leftNumber === null && rightNumber !== null) return 1;
      return left.sourceOrder - right.sourceOrder;
    });
  }

  function ordinal(index) {
    return String(Math.max(0, Number(index) || 0) + 1).padStart(3, "0");
  }

  return { normalize, explicitChapterNumber, order, ordinal };
});
