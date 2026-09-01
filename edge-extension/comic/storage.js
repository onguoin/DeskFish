(() => {
  const DATABASE_NAME = "deskframe-comics";
  const DATABASE_VERSION = 1;
  const IMAGE_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;
  const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("books")) {
          database.createObjectStore("books", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("pages")) {
          const pages = database.createObjectStore("pages", { keyPath: ["bookId", "index"] });
          pages.createIndex("byBook", "bookId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("漫画数据库打开失败"));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("漫画数据库操作失败"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("漫画数据库写入失败"));
      transaction.onabort = () => reject(transaction.error || new Error("漫画数据库写入被中止"));
    });
  }

  function makeId(prefix) {
    const suffix = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  function cleanTitle(value, fallback = "本地漫画") {
    return String(value || fallback)
      .replace(/\.(?:cbz|zip)$/i, "")
      .replace(/[_]+/g, " ")
      .trim() || fallback;
  }

  function imageFiles(files) {
    return Array.from(files || [])
      .filter((file) => file instanceof Blob && (file.type.startsWith("image/") || IMAGE_PATTERN.test(file.name || "")))
      .sort((left, right) => naturalOrder.compare(
        left.webkitRelativePath || left.name || "",
        right.webkitRelativePath || right.name || ""
      ));
  }

  async function importArchive(file) {
    if (!(file instanceof Blob)) throw new Error("没有选择 CBZ/ZIP 文件");
    const id = makeId("archive");
    const record = {
      id,
      kind: "archive",
      title: cleanTitle(file.name),
      archive: file,
      pageCount: null,
      byteLength: file.size,
      createdAt: Date.now()
    };
    const database = await openDatabase();
    const transaction = database.transaction("books", "readwrite");
    transaction.objectStore("books").put(record);
    await transactionDone(transaction);
    database.close();
    return { ...record, archive: undefined };
  }

  async function importImages(files) {
    const images = imageFiles(files);
    if (!images.length) throw new Error("所选文件夹中没有可用图片");
    const firstPath = images[0].webkitRelativePath || images[0].name || "本地漫画";
    const folderTitle = firstPath.includes("/") ? firstPath.split("/")[0] : "图片漫画";
    const id = makeId("images");
    const record = {
      id,
      kind: "images",
      title: cleanTitle(folderTitle),
      pageCount: images.length,
      byteLength: images.reduce((total, file) => total + file.size, 0),
      createdAt: Date.now()
    };
    const database = await openDatabase();
    const bookTransaction = database.transaction("books", "readwrite");
    bookTransaction.objectStore("books").put(record);
    await transactionDone(bookTransaction);

    const batchSize = 80;
    for (let offset = 0; offset < images.length; offset += batchSize) {
      const transaction = database.transaction("pages", "readwrite");
      const store = transaction.objectStore("pages");
      images.slice(offset, offset + batchSize).forEach((file, batchIndex) => {
        store.put({
          bookId: id,
          index: offset + batchIndex,
          name: file.webkitRelativePath || file.name || `page-${offset + batchIndex + 1}`,
          mimeType: file.type || "image/jpeg",
          blob: file
        });
      });
      await transactionDone(transaction);
    }
    database.close();
    return record;
  }

  async function listBooks() {
    const database = await openDatabase();
    const transaction = database.transaction("books", "readonly");
    const done = transactionDone(transaction);
    const books = await requestResult(transaction.objectStore("books").getAll());
    await done;
    database.close();
    return books
      .map(({ archive: _archive, ...book }) => book)
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  async function getBook(id) {
    const database = await openDatabase();
    const transaction = database.transaction("books", "readonly");
    const done = transactionDone(transaction);
    const book = await requestResult(transaction.objectStore("books").get(id));
    await done;
    database.close();
    return book || null;
  }

  async function getPage(bookId, index) {
    const database = await openDatabase();
    const transaction = database.transaction("pages", "readonly");
    const done = transactionDone(transaction);
    const page = await requestResult(transaction.objectStore("pages").get([bookId, index]));
    await done;
    database.close();
    return page || null;
  }

  async function deleteBook(id) {
    const database = await openDatabase();
    const transaction = database.transaction(["books", "pages"], "readwrite");
    transaction.objectStore("books").delete(id);
    const pages = transaction.objectStore("pages").index("byBook");
    const cursorRequest = pages.openKeyCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      transaction.objectStore("pages").delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionDone(transaction);
    database.close();
  }

  globalThis.DeskFrameComicStorage = Object.freeze({
    IMAGE_PATTERN,
    naturalOrder,
    importArchive,
    importImages,
    listBooks,
    getBook,
    getPage,
    deleteBook
  });
})();
