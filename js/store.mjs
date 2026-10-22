import { clone } from "./clone.mjs";

export function memoryStore(initial = null) {
  let data = initial ? clone(initial) : null;
  return {
    async load() {
      return data ? clone(data) : null;
    },
    async save(state) {
      data = clone(state);
    },
  };
}

export function idbStore(name = "cattle-phone") {
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("kv")) {
          request.result.createObjectStore("kv");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function run(mode, fn) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction("kv", mode);
          const request = fn(tx.objectStore("kv"));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        })
    );
  }

  return {
    async load() {
      const value = await run("readonly", (store) => store.get("state"));
      return value || null;
    },
    async save(state) {
      await run("readwrite", (store) => store.put(state, "state"));
    },
  };
}

/**
 * Notes queued against the practice file must not be sent to the live book.
 * They stay in that older phone store, under setAside, and the queue is emptied.
 */
export async function setAsidePracticeQueue(store) {
  const saved = await store.load();
  if (!saved || typeof saved !== "object") return { count: 0, texts: [] };
  const pending = Array.isArray(saved.pending) ? saved.pending : [];
  const clashes = Array.isArray(saved.clashes) ? saved.clashes : [];
  if (!pending.length && !clashes.length) return { count: 0, texts: [] };
  const texts = pending.map((item) => String(item?.text || "A note")).filter(Boolean);
  saved.setAside = {
    pending,
    clashes,
    at: new Date().toISOString(),
    reason: "Left on this phone when it switched to the live book. Not sent.",
  };
  saved.pending = [];
  saved.clashes = [];
  saved.etag = null;
  await store.save(saved);
  return { count: pending.length + clashes.length, texts };
}
