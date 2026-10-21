import { clone } from "./clone.mjs";

/**
 * Practice book kept in the phone's own storage.
 * Used only while Microsoft sign-in is not set up, and in tests.
 * It is not OneDrive and it is not the real herd file.
 */
export function createLocalDrive({
  storage,
  key = "cattle-logbook-phone-practice-demo-v1",
  hooks = {},
} = {}) {
  let serial = 1;

  function read() {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.etag || !parsed.body) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function write(body) {
    serial += 1;
    const etag = `W/"demo-${serial}"`;
    storage.setItem(key, JSON.stringify({ etag, body }));
    return etag;
  }

  return {
    kind: "local",
    async stat() {
      const file = read();
      if (!file) return { ok: false, status: 404 };
      return { ok: true, status: 200, etag: file.etag };
    },
    async get() {
      const file = read();
      if (!file) return { ok: false, status: 404 };
      return { ok: true, status: 200, etag: file.etag, body: clone(file.body) };
    },
    async put(body, etag) {
      if (hooks.failPuts > 0) {
        hooks.failPuts -= 1;
        return { ok: false, status: 412 };
      }
      const file = read();
      if (!file) return { ok: false, status: 404 };
      if (etag !== file.etag) return { ok: false, status: 412, etag: file.etag };
      const next = clone(body);
      const newEtag = write(next);
      return { ok: true, status: 200, etag: newEtag, body: clone(next) };
    },
    async create(body) {
      if (read()) return { ok: false, status: 412 };
      const next = clone(body);
      const newEtag = write(next);
      return { ok: true, status: 200, etag: newEtag, body: clone(next) };
    },
    async listNames() {
      return ["cattle-logbook-data.json"];
    },
  };
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}
