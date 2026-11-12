// IndexedDB store for user-uploaded wallpapers and videos (kept on-device).

const DB_NAME = "netab-media-db";
const DB_VERSION = 1;
const STORE = "files";

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB failed to open"));
  });
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result ?? null);
        tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      }),
  );
}

export const MediaDB = {
  put: (record) => run("readwrite", (s) => s.put(record)),
  get: (id) => run("readonly", (s) => s.get(id)),
  remove: (id) => run("readwrite", (s) => s.delete(id)),
  clear: () => run("readwrite", (s) => s.clear()),
  keys: () => run("readonly", (s) => s.getAllKeys()),
};

const objectUrls = new Map();

export async function blobUrlFor(id) {
  if (objectUrls.has(id)) return objectUrls.get(id);
  const record = await MediaDB.get(id);
  if (!record?.blob) return "";
  const url = URL.createObjectURL(record.blob);
  objectUrls.set(id, url);
  return url;
}

export function revokeBlobUrl(id) {
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
}
