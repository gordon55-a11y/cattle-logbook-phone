import { clone } from "./clone.mjs";
import { findDuplicateTag } from "./rules.mjs";

export function emptyBook() {
  return {
    app: "Cattle Logbook",
    version: 1,
    cattle: [],
    events: [],
    map: { view: null, paddocks: [] },
    botChangeLog: [],
    paddockCounts: [],
    updatedAt: null,
  };
}

export function normalizeBook(raw) {
  const book = raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : {};
  if (!book.app) book.app = "Cattle Logbook";
  if (!book.version) book.version = 1;
  if (!Array.isArray(book.cattle)) book.cattle = [];
  if (!Array.isArray(book.events)) book.events = [];
  if (!Array.isArray(book.paddockCounts)) book.paddockCounts = [];
  if (!Array.isArray(book.botChangeLog)) book.botChangeLog = [];
  if (!book.map || typeof book.map !== "object") book.map = { view: null, paddocks: [] };
  return book;
}

function fail(error) {
  return { ok: false, error };
}

function findAnimal(book, id) {
  return book.cattle.find((animal) => animal.id === id) || null;
}

function snapshots(book, recordIds) {
  const ids = new Set(recordIds);
  return {
    localCattle: book.cattle.filter((animal) => ids.has(animal.id)).map(clone),
    localEvents: book.events.filter((event) => ids.has(event.id)).map(clone),
    localCounts: book.paddockCounts.filter((count) => ids.has(count.id)).map(clone),
  };
}

function ok(book, summary, recordIds) {
  return { ok: true, book, summary, recordIds, ...snapshots(book, recordIds) };
}

export function logCalving(inputBook, input, ctx) {
  const book = normalizeBook(inputBook);
  const mother = findAnimal(book, input.motherId);
  if (!mother) return fail("Choose the mother.");
  const sex = String(mother.sex || "").toLowerCase();
  if (sex !== "cow" && sex !== "heifer") return fail("Calving is logged on a cow or a heifer.");
  const calfTag = String(input.calfTag || "").trim().replace(/\s+/g, " ");
  if (!calfTag) return fail("Enter a tag for the new calf.");
  const calfSex = String(input.calfSex || "calf").toLowerCase();
  if (!["heifer", "bull", "calf"].includes(calfSex)) return fail("Choose heifer calf, bull calf, or calf.");
  const date = String(input.date || "").slice(0, 10);
  if (!date) return fail("Enter the date.");
  const duplicate = findDuplicateTag(book.cattle, calfTag, mother.paddock || "", mother.farm || "", calfSex);
  if (duplicate) {
    return fail(`Tag ${calfTag} is already used for that sex in the same paddock.`);
  }
  const iso = ctx.now.toISOString();
  const calfId = ctx.id();
  const eventId = ctx.id();
  const recordIds = [calfId, eventId];
  if (sex === "heifer") {
    mother.sex = "cow";
    mother.updatedAt = iso;
    recordIds.push(mother.id);
  }
  book.cattle.push({
    id: calfId,
    tag: calfTag,
    sex: calfSex,
    breed: mother.breed || "",
    farm: mother.farm || "",
    paddock: mother.paddock || "",
    dob: date,
    status: "active",
    deathDate: "",
    motherId: mother.id,
    notes: `Calf of ${mother.tag}`,
    createdAt: iso,
    updatedAt: iso,
  });
  book.events.push({
    id: eventId,
    cattleId: mother.id,
    date,
    type: "calving",
    value: null,
    details: `Calf ${calfTag} added to herd`,
    calfId,
    calfTag,
    calfSex,
    createdAt: iso,
    updatedAt: iso,
  });
  return ok(book, `Calving for ${mother.tag} · calf ${calfTag}`, recordIds);
}

export function logTreatment(inputBook, input, ctx) {
  const book = normalizeBook(inputBook);
  const animal = findAnimal(book, input.animalId);
  if (!animal) return fail("Choose an animal.");
  const date = String(input.date || "").slice(0, 10);
  if (!date) return fail("Enter the date.");
  const what = String(input.what || "").trim();
  if (!what) return fail("Write what you gave.");
  const note = String(input.note || "").trim();
  const iso = ctx.now.toISOString();
  const eventId = ctx.id();
  book.events.push({
    id: eventId,
    cattleId: animal.id,
    date,
    type: "treatment",
    value: null,
    details: [what, note].filter(Boolean).join(" · "),
    createdAt: iso,
    updatedAt: iso,
  });
  return ok(book, `Treatment for ${animal.tag} · ${what}`, [eventId]);
}

export function logMovement(inputBook, input, ctx) {
  const book = normalizeBook(inputBook);
  const animal = findAnimal(book, input.animalId);
  if (!animal) return fail("Choose an animal.");
  const date = String(input.date || "").slice(0, 10);
  if (!date) return fail("Enter the date.");
  const farm = String(input.farm || "").trim();
  const paddock = String(input.paddock || "").trim();
  if (!farm || !paddock) return fail("Enter the farm and the paddock.");
  const oldFarm = String(animal.farm || "").trim();
  const oldPaddock = String(animal.paddock || "").trim();
  if (oldFarm.toLowerCase() === farm.toLowerCase() && oldPaddock.toLowerCase() === paddock.toLowerCase()) {
    return fail(`${animal.tag} is already in ${farm} · ${paddock}.`);
  }
  const iso = ctx.now.toISOString();
  const eventId = ctx.id();
  const fromLabel = [oldFarm, oldPaddock].filter(Boolean).join(" · ") || "unset";
  const toLabel = [farm, paddock].filter(Boolean).join(" · ");
  animal.farm = farm;
  animal.paddock = paddock;
  animal.updatedAt = iso;
  book.events.push({
    id: eventId,
    cattleId: animal.id,
    date,
    type: "movement",
    value: null,
    details: `Moved from ${fromLabel} to ${toLabel}`,
    fromFarm: oldFarm,
    toFarm: farm,
    fromPaddock: oldPaddock,
    toPaddock: paddock,
    createdAt: iso,
    updatedAt: iso,
  });
  return ok(book, `Move ${animal.tag} to ${toLabel}`, [animal.id, eventId]);
}

export function logCount(inputBook, input, ctx) {
  const book = normalizeBook(inputBook);
  const farm = String(input.farm || "").trim();
  const paddock = String(input.paddock || "").trim();
  if (!farm || !paddock) return fail("Enter the farm and the paddock.");
  const date = String(input.date || "").slice(0, 10);
  if (!date) return fail("Enter the date.");
  const cows = whole(input.cows);
  const calves = whole(input.calves);
  const bulls = whole(input.bulls);
  if (cows == null || calves == null || bulls == null) return fail("Use whole numbers, zero or more.");
  const iso = ctx.now.toISOString();
  const countId = ctx.id();
  const note = String(input.note || "").trim().slice(0, 200);
  book.paddockCounts.push({
    id: countId,
    farm,
    paddock,
    date,
    total: cows + calves + bulls,
    breakdown: { cows, calves, bulls },
    note,
    by: "Gordon",
    at: iso,
  });
  return ok(book, `Count ${farm} · ${paddock} · ${cows + calves + bulls}`, [countId]);
}

function whole(value) {
  if (value === "" || value == null) return 0;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}
