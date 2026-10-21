/** The only file this phone may open or save. */
export const PRACTICE_PATH = "/Cattle Logbook/phone-practice/cattle-logbook-data.json";

/** The real herd file. Never requested. */
export const LIVE_PATH = "/Cattle Logbook/cattle-logbook-data.json";

export const PRACTICE_FOLDER = "/Cattle Logbook/phone-practice";

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

export function assertPracticeFile(input) {
  const path = normalizeDrivePath(input);
  if (path.toLowerCase() === LIVE_PATH.toLowerCase()) {
    throw new PracticeOnlyError("Refusing the live herd file.");
  }
  if (path.toLowerCase() !== PRACTICE_PATH.toLowerCase()) {
    throw new PracticeOnlyError("This phone only opens the practice copy.");
  }
  return PRACTICE_PATH;
}

export function assertPracticeFolder(input) {
  const path = normalizeDrivePath(input);
  if (path.toLowerCase() !== PRACTICE_FOLDER.toLowerCase()) {
    throw new PracticeOnlyError("This phone only looks in the practice folder.");
  }
  return PRACTICE_FOLDER;
}

function encodePath(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function practiceItemUrl() {
  return `${GRAPH_ROOT}/${encodePath(assertPracticeFile(PRACTICE_PATH))}`;
}

export function practiceContentUrl() {
  return `${practiceItemUrl()}:/content`;
}

export function practiceFolderChildrenUrl() {
  return `${GRAPH_ROOT}/${encodePath(assertPracticeFolder(PRACTICE_FOLDER))}:/children`;
}

/** Reject any Graph address that is not the practice file or the practice folder. */
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
  const allowed = [PRACTICE_PATH.toLowerCase(), PRACTICE_FOLDER.toLowerCase()];
  if (!allowed.includes(normalized.toLowerCase())) {
    throw new PracticeOnlyError("This phone only opens the practice copy.");
  }
  if (normalized.toLowerCase() === LIVE_PATH.toLowerCase()) {
    throw new PracticeOnlyError("Refusing the live herd file.");
  }
  return String(url);
}
