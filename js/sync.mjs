import { clone } from "./clone.mjs";
import { emptyBook, normalizeBook } from "./book.mjs";
import { logCalving, logCount, logMovement, logTreatment } from "./book.mjs";
import { mergeBook } from "./merge.mjs";
import { createIdFactory } from "./clone.mjs";
import { indexPlaces } from "./find-filter.mjs";
import { activeAnimals } from "./rules.mjs";

function withholdGroups(merged, pending, remoteBook) {
  const clashIds = new Set(merged.clashes.map((clash) => clash.id));
  const withhold = new Set();
  const groups = [];
  for (const action of pending) {
    const hit = merged.clashes.filter((clash) => action.recordIds.includes(clash.id));
    if (!hit.length && !action.recordIds.some((id) => clashIds.has(id))) continue;
    for (const id of action.recordIds) withhold.add(id);
    groups.push({ ...clone(action), clashes: hit });
  }
  const remoteCattle = new Set((remoteBook.cattle || []).map((animal) => animal.id));
  const remoteEvents = new Set((remoteBook.events || []).map((event) => event.id));
  const remoteCounts = new Set((remoteBook.paddockCounts || []).map((count) => count.id));
  const book = clone(merged.book);
  book.cattle = book.cattle.filter((animal) => !withhold.has(animal.id) || remoteCattle.has(animal.id));
  book.events = book.events.filter((event) => !withhold.has(event.id) || remoteEvents.has(event.id));
  book.paddockCounts = book.paddockCounts.filter(
    (count) => !withhold.has(count.id) || remoteCounts.has(count.id)
  );
  return { book, groups };
}

function reapplyGroup(book, group, iso) {
  const next = normalizeBook(book);
  for (const animal of group.localCattle || []) {
    const copy = { ...clone(animal), updatedAt: iso, source: "phone" };
    const index = next.cattle.findIndex((item) => item.id === animal.id);
    if (index >= 0) next.cattle[index] = { ...next.cattle[index], ...copy };
    else next.cattle.push(copy);
  }
  for (const event of group.localEvents || []) {
    const copy = { ...clone(event), updatedAt: iso, source: "phone" };
    const index = next.events.findIndex((item) => item.id === event.id);
    if (index >= 0) next.events[index] = copy;
    else next.events.push(copy);
  }
  for (const count of group.localCounts || []) {
    const copy = { ...clone(count), at: iso, source: "phone" };
    const index = next.paddockCounts.findIndex((item) => item.id === count.id);
    if (index >= 0) next.paddockCounts[index] = copy;
    else next.paddockCounts.push(copy);
  }
  return next;
}

export function createSync({
  drive,
  store,
  now = () => new Date(),
  online = () => true,
  ids = createIdFactory(),
}) {
  let state = {
    base: null,
    local: null,
    etag: null,
    pending: [],
    clashes: [],
    warning: "",
  };

  function stamp(book) {
    const copy = normalizeBook(book);
    copy.updatedAt = now().toISOString();
    return copy;
  }

  function rememberPlaces() {
    const indexed = indexPlaces(activeAnimals(state.local || emptyBook()));
    const byFarm = {};
    for (const farm of indexed.farms) byFarm[farm] = indexed.paddocksFor(farm);
    state.placeLists = { farms: indexed.farms, paddocks: indexed.paddocks, byFarm };
  }

  async function persist() {
    rememberPlaces();
    await store.save(clone(state));
  }

  function view() {
    return {
      book: state.local ? clone(state.local) : emptyBook(),
      pending: clone(state.pending),
      clashes: clone(state.clashes),
      warning: state.warning || "",
      etag: state.etag,
      offline: !online(),
      ready: Boolean(state.local),
      needsSignIn: Boolean(state.needsSignIn),
      placeLists: clone(state.placeLists || { farms: [], paddocks: [], byFarm: {} }),
    };
  }

  function noteReachError(error) {
    if (error?.name === "PracticeOnlyError" || error?.name === "UnreadableBookError") throw error;
    if (error?.name === "SignInNeededError" || error?.code === "auth") {
      state.needsSignIn = true;
      return;
    }
    state.warning = "Could not reach the herd file. Your notes are still on this phone.";
  }

  function takeSaved(result) {
    const book = normalizeBook(result.body);
    state.base = clone(book);
    state.local = clone(book);
    state.etag = result.etag || state.etag;
    state.pending = [];
    state.needsSignIn = false;
  }

  async function namesWarning() {
    if (!drive.listNames) return "";
    try {
      const names = await drive.listNames();
      const extras = (names || []).filter(
        (name) => /cattle-logbook-data/i.test(name) && name !== "cattle-logbook-data.json"
      );
      if (extras.length) {
        return "OneDrive made a spare copy of the herd file. Leave that spare file where it is.";
      }
    } catch (error) {
      if (error.name === "PracticeOnlyError") throw error;
    }
    return "";
  }

  async function loadFromDrive() {
    const stat = await drive.stat();
    if (stat.status === 404) {
      throw new Error("The live book was not found. Nothing new was created.");
    }
    if (!stat.ok) throw new Error("Could not open the herd file.");
    const got = await drive.get();
    if (!got.ok) throw new Error("Could not read the herd file.");
    takeSaved({ body: got.body, etag: got.etag || stat.etag });
    state.warning = await namesWarning();
    await persist();
  }

  async function init() {
    const saved = await store.load();
    if (saved && saved.local) {
      state = saved;
      if (!Array.isArray(state.pending)) state.pending = [];
      if (!Array.isArray(state.clashes)) state.clashes = [];
      if (!state.warning) state.warning = "";
      if (!state.placeLists) rememberPlaces();
    }
    if (!state.local) {
      if (!online()) {
        state.local = emptyBook();
        state.base = null;
        state.etag = null;
        state.pending = [];
        state.clashes = [];
        state.warning =
          "No signal, and this phone does not have the herd file yet. Connect once, then the yards will work offline.";
        await persist();
        return view();
      }
      try {
        await loadFromDrive();
      } catch (error) {
        if (error?.name === "PracticeOnlyError") throw error;
        state.local = emptyBook();
        if (error?.name === "UnreadableBookError") state.warning = error.message;
        else if (error?.name === "SignInNeededError" || error?.code === "auth") state.needsSignIn = true;
        else state.warning = error?.message || "Could not open the herd file.";
        await persist();
        return view();
      }
      return view();
    }
    if (!state.placeLists?.farms) {
      rememberPlaces();
      await persist();
    }
    if (online()) {
      try {
        if (state.pending.length) await flush();
        else await pull();
      } catch (error) {
        noteReachError(error);
        await persist();
      }
    }
    return view();
  }

  async function pull() {
    if (!online()) return view();
    if (state.pending.length) return flush();
    let stat;
    try {
      stat = await drive.stat();
    } catch (error) {
      noteReachError(error);
      await persist();
      return view();
    }
    if (stat.status === 404) return view();
    if (!stat.ok) return view();
    if (stat.etag === state.etag) {
      state.needsSignIn = false;
      const spare = await namesWarning();
      if (spare) state.warning = spare;
      await persist();
      return view();
    }
    let got;
    try {
      got = await drive.get();
    } catch (error) {
      noteReachError(error);
      await persist();
      return view();
    }
    if (!got.ok) return view();
    takeSaved({ body: got.body, etag: got.etag || stat.etag });
    state.warning = await namesWarning();
    await persist();
    return view();
  }

  async function flush() {
    if (!online()) return view();
    if (!state.pending.length) return pull();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let stat;
      try {
        stat = await drive.stat();
      } catch (error) {
        noteReachError(error);
        await persist();
        return view();
      }
      if (stat.status === 404) {
        throw new Error("The live book was not found. Nothing new was created.");
      }
      if (!stat.ok) {
        state.warning = "Could not reach the herd file. Your notes are still on this phone.";
        await persist();
        return view();
      }
      if (stat.etag === state.etag) {
        let put;
        try {
          put = await drive.put(stamp(state.local), stat.etag);
        } catch (error) {
          noteReachError(error);
          await persist();
          return view();
        }
        if (put.ok) {
          takeSaved(put);
          state.warning = await namesWarning();
          await persist();
          return view();
        }
        if (put.status === 412) continue;
        state.warning = "Could not save. Your notes are still on this phone.";
        await persist();
        return view();
      }
      let got;
      try {
        got = await drive.get();
      } catch (error) {
        if (error.name === "UnreadableBookError") {
          state.warning = error.message;
          await persist();
          return view();
        }
        noteReachError(error);
        await persist();
        return view();
      }
      if (!got.ok) continue;
      const remoteBook = normalizeBook(got.body);
      const baseBook = state.base ? normalizeBook(state.base) : emptyBook();
      const merged = mergeBook(baseBook, state.local, remoteBook);
      const outcome = withholdGroups(merged, state.pending, remoteBook);
      let put;
      try {
        put = await drive.put(stamp(outcome.book), got.etag);
      } catch (error) {
        noteReachError(error);
        await persist();
        return view();
      }
      if (put.ok) {
        takeSaved(put);
        state.clashes = [...state.clashes, ...outcome.groups];
        const spare = await namesWarning();
        if (outcome.groups.length) {
          state.warning = "Some notes need a look. The rest were saved to the live book.";
        } else {
          state.warning = spare;
        }
        await persist();
        return view();
      }
      if (put.status === 412) continue;
      state.warning = "Could not save. Your notes are still on this phone.";
      await persist();
      return view();
    }
    state.warning = "The herd file kept changing. Your notes are still on this phone. Try Send again.";
    await persist();
    return view();
  }

  async function mutate(runner) {
    if (!state.local) await init();
    const result = runner(state.local, { id: ids, now: now() });
    if (!result.ok) return { ...view(), ok: false, error: result.error };
    state.local = result.book;
    state.pending.push({
      id: ids(),
      text: result.summary,
      recordIds: result.recordIds,
      localCattle: result.localCattle,
      localEvents: result.localEvents,
      localCounts: result.localCounts,
      at: now().toISOString(),
    });
    await persist();
    if (!online()) return { ...view(), ok: true, waiting: true };
    await flush();
    return { ...view(), ok: true, waiting: state.pending.length > 0 && !state.clashes.length };
  }

  async function dropClash(groupId) {
    state.clashes = state.clashes.filter((group) => group.id !== groupId);
    if (!state.clashes.length && String(state.warning).startsWith("Some notes")) state.warning = "";
    await persist();
    return view();
  }

  async function reapplyClash(groupId) {
    const group = state.clashes.find((item) => item.id === groupId);
    if (!group) return { ...view(), ok: false, error: "That note is already gone." };
    state.local = reapplyGroup(state.local, group, now().toISOString());
    state.clashes = state.clashes.filter((item) => item.id !== groupId);
    state.pending.push({
      id: ids(),
      text: group.text,
      recordIds: group.recordIds,
      localCattle: group.localCattle,
      localEvents: group.localEvents,
      localCounts: group.localCounts,
      at: now().toISOString(),
    });
    await persist();
    if (!online()) return { ...view(), ok: true, waiting: true };
    await flush();
    return { ...view(), ok: true, waiting: false };
  }

  return {
    init,
    view,
    pull,
    flush,
    dropClash,
    reapplyClash,
    logCalving: (input) => mutate((book, ctx) => logCalving(book, input, ctx)),
    logTreatment: (input) => mutate((book, ctx) => logTreatment(book, input, ctx)),
    logMovement: (input) => mutate((book, ctx) => logMovement(book, input, ctx)),
    logCount: (input) => mutate((book, ctx) => logCount(book, input, ctx)),
  };
}
