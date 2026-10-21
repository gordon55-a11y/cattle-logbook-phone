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
