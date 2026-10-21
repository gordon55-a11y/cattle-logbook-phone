import { clone, stableEqual } from "./clone.mjs";
import { normalizeBook } from "./book.mjs";

function indexById(list) {
  const map = new Map();
  for (const item of list || []) {
    if (!item || !String(item.id || "").trim()) continue;
    map.set(String(item.id), item);
  }
  return map;
}

function orderIds(remoteList, localList, baseList) {
  const order = [];
  const seen = new Set();
  for (const list of [remoteList, localList, baseList]) {
    for (const item of list || []) {
      const id = item && String(item.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}

export function mergeRecords(baseList, localList, remoteList, kind) {
  const base = indexById(baseList);
  const local = indexById(localList);
  const remote = indexById(remoteList);
  const records = [];
  const clashes = [];
  for (const id of orderIds(remoteList, localList, baseList)) {
    const b = base.has(id) ? base.get(id) : null;
    const l = local.has(id) ? local.get(id) : null;
    const r = remote.has(id) ? remote.get(id) : null;
    if (stableEqual(l, r)) {
      if (l) records.push(clone(l));
      continue;
    }
    if (stableEqual(l, b)) {
      if (r) records.push(clone(r));
      continue;
    }
    if (stableEqual(r, b)) {
      if (l) records.push(clone(l));
      continue;
    }
    if (r) records.push(clone(r));
    clashes.push({ id, kind, local: l ? clone(l) : null, remote: r ? clone(r) : null });
  }
  return { records, clashes };
}

export function mergeCounts(baseList, localList, remoteList) {
  const merged = mergeRecords(baseList, localList, remoteList, "count");
  const local = indexById(localList);
  const remote = indexById(remoteList);
  const base = indexById(baseList);
  for (const record of merged.records) {
    const deleted =
      Boolean(local.get(record.id)?.deleted) ||
      Boolean(remote.get(record.id)?.deleted) ||
      Boolean(base.get(record.id)?.deleted);
    if (deleted) record.deleted = true;
  }
  return merged;
}

export function mergeBook(base, local, remote) {
  const baseBook = normalizeBook(base);
  const localBook = normalizeBook(local);
  const remoteBook = normalizeBook(remote);
  const cattle = mergeRecords(baseBook.cattle, localBook.cattle, remoteBook.cattle, "cattle");
  const events = mergeRecords(baseBook.events, localBook.events, remoteBook.events, "event");
  const counts = mergeCounts(baseBook.paddockCounts, localBook.paddockCounts, remoteBook.paddockCounts);
  const book = clone(remoteBook);
  book.cattle = cattle.records;
  book.events = events.records;
  book.paddockCounts = counts.records;
  book.map = remoteBook.map;
  book.botChangeLog = remoteBook.botChangeLog;
  return {
    book,
    clashes: [...cattle.clashes, ...events.clashes, ...counts.clashes],
  };
}
