export const CALF_MAX_DAYS = 300;
const CALF_SEXES = new Set(["bull", "heifer"]);

export function normalizeTag(tag) {
  return String(tag ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function findDuplicateTag(cattle, tag, paddock, farm = "", sex = "", excludeId = null) {
  const wanted = normalizeTag(tag);
  const pad = String(paddock || "").trim().toLowerCase();
  const frm = String(farm || "").trim().toLowerCase();
  const sx = String(sex || "").trim().toLowerCase();
  return (cattle || []).find((animal) => {
    if (excludeId && animal.id === excludeId) return false;
    if (normalizeTag(animal.tag) !== wanted) return false;
    if (String(animal.sex || "").trim().toLowerCase() !== sx) return false;
    if (String(animal.paddock || "").trim().toLowerCase() !== pad) return false;
    const otherFarm = String(animal.farm || "").trim().toLowerCase();
    if (frm && otherFarm && frm !== otherFarm) return false;
    return true;
  });
}

export function isUnweanedCalf(animal, events = [], now = new Date()) {
  if (!animal) return false;
  const sex = String(animal.sex || "").trim().toLowerCase();
  if (sex === "calf") return true;
  if (!CALF_SEXES.has(sex)) return false;
  if (animal.weaned || animal.weanedAt) return false;
  const dob = Date.parse(animal.dob || "");
  if (!Number.isFinite(dob)) return false;
  const ageDays = (now.getTime() - dob) / 86400000;
  if (ageDays < 0 || ageDays >= CALF_MAX_DAYS) return false;
  return !(events || []).some(
    (event) => event && event.cattleId === animal.id && String(event.type || "").toLowerCase() === "weaning"
  );
}

export function categoryOf(animal, events = [], now = new Date()) {
  if (isUnweanedCalf(animal, events, now)) return "calf";
  return String(animal?.sex || "other").trim().toLowerCase() || "other";
}

export function categoryLabel(animal, events = [], now = new Date()) {
  const category = categoryOf(animal, events, now);
  const sex = String(animal?.sex || "").trim().toLowerCase();
  if (category === "calf" && CALF_SEXES.has(sex)) return `Calf (${sex})`;
  const raw = String(animal?.sex || category).trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Other";
}

export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDay(iso) {
  if (!iso) return "—";
  const day = String(iso).slice(0, 10);
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export function activeAnimals(book) {
  return (book?.cattle || []).filter((animal) => (animal.status || "active") === "active");
}

export function compareTags(a, b) {
  return String(a?.tag || "").localeCompare(String(b?.tag || ""), undefined, { numeric: true });
}

/** Field count groups: heifers with cows, steers with bulls. */
export function logbookHeadcount(book, farm, paddock, now = new Date()) {
  const out = { cows: 0, calves: 0, bulls: 0, other: 0 };
  const wantFarm = String(farm || "").trim().toLowerCase();
  const wantPad = String(paddock || "").trim().toLowerCase();
  for (const animal of activeAnimals(book)) {
    if (String(animal.farm || "").trim().toLowerCase() !== wantFarm) continue;
    if (String(animal.paddock || "").trim().toLowerCase() !== wantPad) continue;
    const category = categoryOf(animal, book.events, now);
    if (category === "cow" || category === "heifer") out.cows += 1;
    else if (category === "calf") out.calves += 1;
    else if (category === "bull" || category === "steer") out.bulls += 1;
    else out.other += 1;
  }
  return out;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
