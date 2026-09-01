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

  function ordinal(index) {
    return String(Math.max(0, Number(index) || 0) + 1).padStart(3, "0");
  }

  return { normalize, ordinal };
});
