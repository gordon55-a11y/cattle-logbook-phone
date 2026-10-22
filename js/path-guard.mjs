/** The herd file the computer uses. */
export const LIVE_PATH = "/Cattle Logbook/cattle-logbook-data.json";

/**
 * Practice copy. Not used while BOOK_PATH is the live file.
 * To switch the phone back to practice, set BOOK_PATH to PRACTICE_PATH and publish again.
 */
export const PRACTICE_PATH = "/Cattle Logbook/phone-practice/cattle-logbook-data.json";

/** The only file this phone may open or save. */
export const BOOK_PATH = LIVE_PATH;

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0/me/drive/root:";

export class PracticeOnlyError extends Error {
  constructor(message) {
    super(message);
    this.name = "PracticeOnlyError";
  }
}

export function normalizeDrivePath(input) {
  let text = String(input || "").trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  text = text.replace(/\\/g, "/");
  const parts = [];
  for (const part of text.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

/** Accept only BOOK_PATH. Every other file, including the practice copy, is refused. */
export function assertBookFile(input) {
  const path = normalizeDrivePath(input);
  if (path.toLowerCase() !== BOOK_PATH.toLowerCase()) {
    throw new PracticeOnlyError("This phone only opens the live book.");
  }
  return BOOK_PATH;
}

function encodePath(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function bookItemUrl() {
  return `${GRAPH_ROOT}/${encodePath(assertBookFile(BOOK_PATH))}`;
}

export function bookContentUrl() {
  return `${bookItemUrl()}:/content`;
}

/** Reject any Graph address that is not the one herd file. */
export function assertGraphUrl(url) {
  const decoded = (() => {
    try {
      return decodeURIComponent(String(url));
    } catch {
      return String(url);
    }
  })();
  if (!decoded.startsWith("https://graph.microsoft.com/")) {
    throw new PracticeOnlyError("Unexpected address.");
  }
  const marker = "root:";
  const at = decoded.indexOf(marker);
  if (at < 0) throw new PracticeOnlyError("Unexpected address.");
  let rest = decoded.slice(at + marker.length);
  if (rest.startsWith("/")) rest = rest.slice(1);
  const pathPart = rest.split(":/")[0].split("?")[0];
  const normalized = normalizeDrivePath(`/${pathPart}`);
  if (normalized.toLowerCase() !== BOOK_PATH.toLowerCase()) {
    throw new PracticeOnlyError("This phone only opens the live book.");
  }
  return String(url);
}
