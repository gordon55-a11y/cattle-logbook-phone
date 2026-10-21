import { clone } from "./clone.mjs";
import {
  PracticeOnlyError,
  assertGraphUrl,
  assertPracticeFile,
  practiceContentUrl,
  practiceFolderChildrenUrl,
  practiceItemUrl,
} from "./path-guard.mjs";

export class UnreadableBookError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnreadableBookError";
  }
}

const MAX_BYTES = 3_500_000;

/**
 * Microsoft Graph for the practice file only.
 * Every address is checked before fetch. The live herd file is refused.
 */
export function createGraphDrive({ fetch: fetchImpl, getToken, path }) {
  assertPracticeFile(path);
  const fetchFn = fetchImpl;

  async function request(url, options = {}) {
    assertGraphUrl(url);
    const token = await getToken();
    if (!token) {
      const error = new Error("Sign in to Microsoft first.");
      error.code = "auth";
      throw error;
    }
    return fetchFn(url, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(options.headers || {}),
      },
      body: options.body,
      cache: "no-store",
    });
  }

  function encodeBody(body) {
    const text = `${JSON.stringify(body, null, 2)}\n`;
    if (text.length > MAX_BYTES) {
      throw new Error("The practice book is too big to save from the phone.");
    }
    return text;
  }

  return {
    kind: "graph",
    async stat() {
      const response = await request(practiceItemUrl());
      if (response.status === 404) return { ok: false, status: 404 };
      if (!response.ok) return { ok: false, status: response.status };
      const item = await response.json();
      return { ok: true, status: 200, etag: item.eTag || item.etag || "" };
    },
    async get() {
      const response = await request(practiceContentUrl());
      if (response.status === 404) return { ok: false, status: 404 };
      if (!response.ok) return { ok: false, status: response.status };
      const text = await response.text();
      try {
        const body = JSON.parse(text);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new Error("not an object");
        }
        return { ok: true, status: 200, etag: response.headers.get("ETag") || "", body };
      } catch (error) {
        if (error instanceof UnreadableBookError) throw error;
        throw new UnreadableBookError("The practice book could not be read, so nothing was saved over it.");
      }
    },
    async put(body, etag) {
      if (!etag) throw new PracticeOnlyError("Refusing to save without a version check.");
      const response = await request(practiceContentUrl(), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": etag,
        },
        body: encodeBody(body),
      });
      if (response.status === 412) return { ok: false, status: 412 };
      if (!response.ok) return { ok: false, status: response.status };
      const item = await response.json().catch(() => ({}));
      return {
        ok: true,
        status: 200,
        etag: item.eTag || item.etag || etag,
        body: clone(body),
      };
    },
    async create(body) {
      const response = await request(practiceContentUrl(), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-None-Match": "*",
        },
        body: encodeBody(body),
      });
      if (response.status === 412) return { ok: false, status: 412 };
      if (!response.ok) return { ok: false, status: response.status };
      const item = await response.json().catch(() => ({}));
      return {
        ok: true,
        status: response.status,
        etag: item.eTag || item.etag || "",
        body: clone(body),
      };
    },
    async listNames() {
      const response = await request(practiceFolderChildrenUrl());
      if (response.status === 404) return [];
      if (!response.ok) return [];
      const data = await response.json();
      return (data.value || []).map((item) => item && item.name).filter(Boolean);
    },
  };
}
