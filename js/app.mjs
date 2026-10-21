import { createAuth } from "./auth.mjs";
import { clientIdIsPlaceholder } from "./config.mjs";
import { createGraphDrive } from "./graph.mjs";
import { createLocalDrive } from "./local-drive.mjs";
import { PRACTICE_PATH } from "./path-guard.mjs";
import {
  activeAnimals,
  categoryLabel,
  categoryOf,
  compareTags,
  escapeHtml,
  formatDay,
  localToday,
  logbookHeadcount,
} from "./rules.mjs";
import { sampleBook } from "./sample.mjs";
import { idbStore } from "./store.mjs";
import { createSync } from "./sync.mjs";

const main = document.querySelector("#main");
const titleEl = document.querySelector("#title");
const subtitleEl = document.querySelector("#subtitle");
const backEl = document.querySelector("#back");
const toastEl = document.querySelector("#toast");

const TITLES = {
  home: "Cattle Logbook",
  find: "Find an animal",
  animal: "Animal",
  calving: "Calving",
  treatment: "Treatment",
  movement: "Move cattle",
  count: "Paddock count",
  clash: "Needs a look",
  signin: "Cattle Logbook",
};

let mode = "practice";
let sync = null;
let auth = null;
let view = null;
let busy = false;
let toastTimer = 0;
const stack = [];

function book() {
  return view?.book || { cattle: [], events: [], paddockCounts: [] };
}

function animalById(id) {
  return book().cattle.find((animal) => animal.id === id) || null;
}

function place(animal) {
  return [animal?.farm, animal?.paddock].filter(Boolean).join(" · ");
}

function farms() {
  return [...new Set(book().cattle.map((animal) => String(animal.farm || "").trim()).filter(Boolean))].sort();
}

function paddocks() {
  return [...new Set(book().cattle.map((animal) => String(animal.paddock || "").trim()).filter(Boolean))].sort();
}

function mothers() {
  return activeAnimals(book())
    .filter((animal) => {
      const category = categoryOf(animal, book().events);
      return category === "cow" || category === "heifer";
    })
    .sort(compareTags);
}

function sortedActive() {
  return activeAnimals(book()).slice().sort(compareTags);
}

function matchesFind(animal, params) {
  const category = categoryOf(animal, book().events);
  const filter = params.filter || "all";
  if (filter === "cows" && category !== "cow" && category !== "heifer") return false;
  if (filter === "calves" && category !== "calf") return false;
  if (filter === "bulls" && category !== "bull" && category !== "steer") return false;
  const q = String(params.q || "").trim().toLowerCase();
  if (!q) return true;
  return [animal.tag, animal.farm, animal.paddock, animal.breed, categoryLabel(animal, book().events)]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function datalists() {
  const farmOptions = farms().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  const paddockOptions = paddocks().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  return `<datalist id="farm-names">${farmOptions}</datalist><datalist id="paddock-names">${paddockOptions}</datalist>`;
}

function animalOptions(selected, list = sortedActive()) {
  const options = list
    .map((animal) => {
      const label = `${animal.tag} · ${categoryLabel(animal, book().events)} · ${place(animal)}`;
      const sel = animal.id === selected ? " selected" : "";
      return `<option value="${escapeHtml(animal.id)}"${sel}>${escapeHtml(label)}</option>`;
    })
    .join("");
  return `<option value="">Choose</option>${options}`;
}

function banner() {
  if (mode === "practice") {
    return `<p class="ribbon">Sample animals on this phone. Not your herd. Not OneDrive. <a href="./setup.html">How to connect</a></p>`;
  }
  return `<p class="ribbon">Practice folder only. The real book is not used.</p>`;
}

function warningBlock() {
  if (!view?.warning) return "";
  return `<p class="warn">${escapeHtml(view.warning)}</p>`;
}

function syncBlock() {
  if (!view) return "";
  const offline = view.offline || navigator.onLine === false;
  if (offline) {
    const lines = view.pending.map((item) => `<span class="pending-item">${escapeHtml(item.text)}</span>`).join("");
    return `<div class="sync"><i class="dot off"></i><div><b>No signal</b>${lines || "<span>Notes stay on this phone.</span>"}</div></div>`;
  }
  if (view.pending.length) {
    const lines = view.pending.map((item) => `<span class="pending-item">${escapeHtml(item.text)}</span>`).join("");
    const where = mode === "practice" ? "Still on this phone" : "Still on this phone. The real book is not used.";
    return `<div class="sync"><i class="dot wait"></i><div><b>${escapeHtml(where)}</b>${lines}</div></div>`;
  }
  const text = mode === "practice" ? "On this phone only" : "Practice copy is up to date. The real book is not used.";
  return `<div class="sync"><i class="dot"></i><div><b>${escapeHtml(text)}</b></div></div>`;
}

function recentEvents() {
  const events = book().events
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, 4);
  if (!events.length) return `<p class="hint empty-note">No notes yet.</p>`;
  return events
    .map((event) => {
      const animal = animalById(event.cattleId);
      const tag = animal?.tag || "—";
      let heading = String(event.type || "note");
      heading = heading.charAt(0).toUpperCase() + heading.slice(1);
      if (event.type === "calving" && event.calfTag) heading = `Calving · calf ${event.calfTag}`;
      if (event.type === "movement") heading = "Moved";
      return `<div class="row"><div class="tag">${escapeHtml(tag)}</div><div class="meta"><b>${escapeHtml(heading)}</b><span class="muted">${escapeHtml(formatDay(event.date))} · ${escapeHtml(event.details || "")}</span></div></div>`;
    })
    .join("");
}

function animalRows(list) {
  if (!list.length) return `<p class="hint">No animal matches.</p>`;
  return list
    .map((animal) => {
      const category = categoryLabel(animal, book().events);
      return `<button type="button" class="row" data-go="animal" data-id="${escapeHtml(animal.id)}" data-tag="${escapeHtml(animal.tag)}"><span class="tag">${escapeHtml(animal.tag)}</span><span class="meta"><b>${escapeHtml(category)}</b><span class="muted">${escapeHtml(place(animal))}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
    })
    .join("");
}

function homeScreen() {
  const active = activeAnimals(book());
  const farmCount = new Set(active.map((animal) => animal.farm).filter(Boolean)).size;
  const clashBtn = view.clashes.length
    ? `<button type="button" class="big alt" data-go="clash"><b>Needs a look</b><span>${view.clashes.length} note${view.clashes.length === 1 ? "" : "s"} saved on the phone only</span></button>`
    : "";
  const sendLabel = view.pending.length ? "Send now" : "Check for changes";
  const sendAction = view.pending.length ? "flush" : "pull";
  return `${banner()}${warningBlock()}${syncBlock()}
    <div class="stats">
      <div class="stat"><em>Active animals</em><strong data-stat="animals">${active.length}</strong></div>
      <div class="stat"><em>Farms</em><strong data-stat="farms">${farmCount}</strong></div>
    </div>
    <div class="actions">
      <button type="button" class="big" data-go="find"><b>Find an animal</b><span>Tag, farm, or paddock</span></button>
      <button type="button" class="big" data-go="calving"><b>Log a calving</b><span>Adds the calf, same as the computer</span></button>
      <button type="button" class="big" data-go="treatment"><b>Log a treatment</b><span>What you gave, and when</span></button>
      <button type="button" class="big alt" data-go="movement"><b>Move cattle</b><span>Another farm or paddock</span></button>
      <button type="button" class="big alt" data-go="count"><b>Count a paddock</b><span>Cows, calves, bulls. Does not move anyone.</span></button>
      ${clashBtn}
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="panel-h"><h2>Latest notes</h2></div>
      ${recentEvents()}
    </div>
    <button type="button" class="linkish" data-action="${sendAction}" id="send-now">${sendLabel}</button>`;
}

function findScreen(params) {
  const filter = params.filter || "all";
  const chips = [
    ["all", "All"],
    ["cows", "Cows"],
    ["calves", "Calves"],
    ["bulls", "Bulls"],
  ]
    .map(([value, label]) => `<button type="button" class="chip${filter === value ? " on" : ""}" data-chip="filter" data-value="${value}">${label}</button>`)
    .join("");
  const list = sortedActive().filter((animal) => matchesFind(animal, params));
  return `    <label class="field">Search
      <input id="find-q" data-field="q" type="search" enterkeyhint="search" placeholder="Tag, farm, or paddock" value="${escapeHtml(params.q || "")}" autocomplete="off">
    </label>
    <div class="chips">${chips}</div>
    <p class="hint">Heifers are listed with cows. Steers are listed with bulls. Calves under 300 days show as calves.</p>
    <div class="panel" id="find-list">${animalRows(list)}</div>`;
}

function animalScreen(params) {
  const animal = animalById(params.id);
  if (!animal) return `<p class="warn">That animal is not on this phone.</p>`;
  const category = categoryOf(animal, book().events);
  const categoryText = categoryLabel(animal, book().events);
  const showSex = categoryText.toLowerCase() !== String(animal.sex || "").toLowerCase();
  const mother = animalById(animal.motherId);
  const canCalve = category === "cow" || category === "heifer";
  const notes = animal.notes
    ? `<div class="panel" style="padding:12px;margin-bottom:12px"><b>Notes</b><p class="hint" style="margin-top:4px">${escapeHtml(animal.notes)}</p></div>`
    : "";
  const events = book().events
    .filter((event) => event.cattleId === animal.id || event.calfId === animal.id)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 6)
    .map((event) => `<div class="row"><div class="meta"><b>${escapeHtml(String(event.type || "note"))}</b><span class="muted">${escapeHtml(formatDay(event.date))} · ${escapeHtml(event.details || "")}</span></div></div>`)
    .join("");
  return `<article class="hero">
      <div class="tagline" data-fact="tag">${escapeHtml(animal.tag)}</div>
      <div class="pills"><span class="pill" data-fact="category">${escapeHtml(categoryText)}</span><span class="pill" data-fact="sex"${showSex ? "" : " hidden"}>${escapeHtml(animal.sex || "")}</span></div>
      <div class="facts">
        <div><span>Farm</span><b data-fact="farm">${escapeHtml(animal.farm || "—")}</b></div>
        <div><span>Paddock</span><b data-fact="paddock">${escapeHtml(animal.paddock || "—")}</b></div>
        <div><span>Breed</span><b>${escapeHtml(animal.breed || "—")}</b></div>
        <div><span>Born</span><b>${escapeHtml(formatDay(animal.dob))}</b></div>
        <div><span>Status</span><b>${escapeHtml(animal.status || "active")}</b></div>
        <div><span>Mother</span><b>${escapeHtml(mother?.tag || "—")}</b></div>
      </div>
    </article>
    ${notes}
    <div class="actions">
      ${canCalve ? `<button type="button" class="big" data-go="calving" data-id="${escapeHtml(animal.id)}"><b>Log a calving</b><span>Adds her calf to this paddock</span></button>` : ""}
      <button type="button" class="big" data-go="treatment" data-id="${escapeHtml(animal.id)}"><b>Treatment</b><span>Log what you gave</span></button>
      <button type="button" class="big alt" data-go="movement" data-id="${escapeHtml(animal.id)}"><b>Move</b><span>Change paddock</span></button>
    </div>
    <div class="panel" style="margin-top:12px"><div class="panel-h"><h2>Notes</h2></div>${events || `<p class="hint empty-note">No notes on this animal.</p>`}</div>`;
}

function formError() {
  return `<p class="form-error" id="form-error" role="alert"></p>`;
}

function calvingScreen(params) {
  const sex = params.calfSex || "heifer";
  const chip = (value, label) =>
    `<button type="button" class="chip${sex === value ? " on" : ""}" data-chip="calfSex" data-value="${value}">${label}</button>`;
  return `<form data-form="calving">
      ${formError()}
      <label class="field">Mother
        <select name="motherId" required>${animalOptions(params.id, mothers())}</select>
      </label>
      <label class="field">Calf tag
        <input name="calfTag" data-field="calfTag" type="text" inputmode="numeric" autocomplete="off" required value="${escapeHtml(params.calfTag || "")}">
      </label>
      <div class="field">Calf<span class="hint"></span></div>
      <div class="chips">${chip("heifer", "Heifer calf")}${chip("bull", "Bull calf")}${chip("calf", "Calf")}</div>
      <label class="field">Date
        <input name="date" type="date" required value="${escapeHtml(params.date || localToday())}">
      </label>
      <p class="hint">The calf is added in the mother’s paddock. A heifer’s first calf makes her a cow. The same tag, sex, and paddock is refused.</p>
      <button type="submit" class="save">Save calving</button>
    </form>${datalists()}`;
}

function treatmentScreen(params) {
  return `<form data-form="treatment">
      ${formError()}
      <label class="field">Animal
        <select name="animalId" required>${animalOptions(params.id)}</select>
      </label>
      <label class="field">Date
        <input name="date" type="date" required value="${escapeHtml(params.date || localToday())}">
      </label>
      <label class="field">What you gave
        <input name="what" type="text" autocomplete="off" required value="${escapeHtml(params.what || "")}" placeholder="Long-acting antibiotic">
      </label>
      <label class="field">Note <span>(optional)</span>
        <textarea name="note" maxlength="200">${escapeHtml(params.note || "")}</textarea>
      </label>
      <button type="submit" class="save">Save treatment</button>
    </form>`;
}

function movementScreen(params) {
  const animal = animalById(params.id);
  const now = animal ? `Now in ${place(animal)}.` : "Choose the animal, then where it is going.";
  return `<form data-form="movement">
      ${formError()}
      <label class="field">Animal
        <select name="animalId" required>${animalOptions(params.id)}</select>
      </label>
      <p class="hint" id="move-now">${escapeHtml(now)}</p>
      <label class="field">Date
        <input name="date" type="date" required value="${escapeHtml(params.date || localToday())}">
      </label>
      <label class="field">Farm it is going to
        <input name="farm" type="text" list="farm-names" autocomplete="off" required value="${escapeHtml(params.farm || "")}">
      </label>
      <label class="field">Paddock it is going to
        <input name="paddock" type="text" list="paddock-names" autocomplete="off" required value="${escapeHtml(params.paddock || "")}">
      </label>
      <p class="hint">Type a new farm or paddock if it is not in the list. Saving the same place is refused.</p>
      <button type="submit" class="save">Save move</button>
    </form>${datalists()}`;
}

function countHint(params) {
  const farm = String(params.farm || "").trim();
  const paddock = String(params.paddock || "").trim();
  if (!farm || !paddock) return "A count is a note of what you saw. It does not move animals.";
  const hint = logbookHeadcount(book(), farm, paddock);
  const named = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  return `The book has ${named(hint.cows, "cow", "cows")} (heifers with the cows), ${named(hint.calves, "calf", "calves")}, and ${named(hint.bulls, "bull", "bulls")} (steers with the bulls) in ${farm} · ${paddock}. A count does not move animals.`;
}

function stepper(field, value, label) {
  return `<label class="field">${label}
      <div class="stepper">
        <button type="button" data-step="-1" data-field="${field}" aria-label="Fewer ${label}">−</button>
        <b data-count="${field}">${value}</b>
        <button type="button" data-step="1" data-field="${field}" aria-label="More ${label}">+</button>
      </div>
    </label>`;
}

function countScreen(params) {
  const cows = Number(params.cows || 0);
  const calves = Number(params.calves || 0);
  const bulls = Number(params.bulls || 0);
  return `<form data-form="count">
      ${formError()}
      <label class="field">Farm
        <input name="farm" data-field="farm" type="text" list="farm-names" autocomplete="off" required value="${escapeHtml(params.farm || "")}">
      </label>
      <label class="field">Paddock
        <input name="paddock" data-field="paddock" type="text" list="paddock-names" autocomplete="off" required value="${escapeHtml(params.paddock || "")}">
      </label>
      <p class="hint" id="count-hint">${escapeHtml(countHint(params))}</p>
      ${stepper("cows", cows, "Cows")}
      ${stepper("calves", calves, "Calves")}
      ${stepper("bulls", bulls, "Bulls")}
      <div class="total-line"><span>Total</span><b data-count="total">${cows + calves + bulls}</b></div>
      <label class="field">Date
        <input name="date" type="date" required value="${escapeHtml(params.date || localToday())}">
      </label>
      <label class="field">Note <span>(optional)</span>
        <input name="note" data-field="note" type="text" maxlength="200" value="${escapeHtml(params.note || "")}">
      </label>
      <button type="submit" class="save">Save count</button>
    </form>${datalists()}`;
}

function describeClash(clash) {
  if (clash.kind === "cattle") {
    const tag = clash.local?.tag || clash.remote?.tag || "Animal";
    const mine = clash.local ? place(clash.local) || "no paddock" : "removed";
    const theirs = clash.remote ? place(clash.remote) || "no paddock" : "removed";
    return `${tag}: this phone had ${mine}. The practice copy has ${theirs}.`;
  }
  if (clash.kind === "count") {
    const mine = clash.local ? String(clash.local.total) : "removed";
    const theirs = clash.remote ? String(clash.remote.total) : "removed";
    const where = clash.local || clash.remote || {};
    return `${where.farm || "Count"} · ${where.paddock || ""}: this phone had ${mine}. The practice copy has ${theirs}.`;
  }
  const mine = clash.local?.details || "removed";
  const theirs = clash.remote?.details || "removed";
  return `This phone had “${mine}”. The practice copy has “${theirs}”.`;
}

function clashScreen() {
  if (!view.clashes.length) {
    return `${banner()}<p class="hint">Nothing is waiting. The practice copy kept the other version.</p>`;
  }
  const cards = view.clashes
    .map((group) => {
      const lines = (group.clashes || []).map((clash) => `<div class="side"><em>Both changed</em><b>${escapeHtml(describeClash(clash))}</b></div>`).join("");
      return `<article class="clash">
        <h2>${escapeHtml(group.text || "A note")}</h2>
        <p class="hint">The practice copy kept its version. Yours is still on this phone until you choose.</p>
        ${lines}
        <button type="button" class="save" data-clash="keep" data-id="${escapeHtml(group.id)}" style="margin-top:10px">Put my version in the practice copy</button>
        <button type="button" class="save ghost" data-clash="drop" data-id="${escapeHtml(group.id)}">Drop my version</button>
      </article>`;
    })
    .join("");
  return `${warningBlock()}${cards}`;
}

function signinScreen() {
  return `<div class="signin">
      <img src="./icons/icon-192.png" alt="">
      <h2>Cattle Logbook</h2>
      <p>Sign in with the same Microsoft account as the cattle computer. The phone uses the practice copy only.</p>
      <button type="button" class="ms" id="sign-in">Sign in with Microsoft</button>
      <p class="hint" style="margin-top:16px"><a href="./setup.html">Setup steps</a></p>
    </div>`;
}

function paint() {
  const frame = stack[stack.length - 1] || { name: "home", params: {} };
  const name = frame.name;
  titleEl.textContent = name === "animal" ? (animalById(frame.params.id)?.tag || "Animal") : TITLES[name] || "Cattle Logbook";
  if (name === "home") subtitleEl.textContent = mode === "practice" ? "Sample book" : "Practice copy";
  else if (name === "animal") subtitleEl.textContent = place(animalById(frame.params.id)) || "Animal";
  else if (name === "signin") subtitleEl.textContent = "Microsoft";
  else subtitleEl.textContent = mode === "practice" ? "Sample book" : "Practice copy";
  backEl.hidden = stack.length < 2;
  let html = "";
  if (name === "home") html = homeScreen();
  else if (name === "find") html = findScreen(frame.params);
  else if (name === "animal") html = animalScreen(frame.params);
  else if (name === "calving") html = calvingScreen(frame.params);
  else if (name === "treatment") html = treatmentScreen(frame.params);
  else if (name === "movement") html = movementScreen(frame.params);
  else if (name === "count") html = countScreen(frame.params);
  else if (name === "clash") html = clashScreen();
  else if (name === "signin") html = signinScreen();
  main.dataset.screen = name;
  main.innerHTML = `<div class="screen"><div class="body">${html}</div></div>`;
}

function show(name, params = {}, replace = false) {
  const frame = { name, params: { ...params } };
  if (replace && stack.length) stack[stack.length - 1] = frame;
  else stack.push(frame);
  paint();
}

function goHome() {
  stack.length = 0;
  stack.push({ name: "home", params: {} });
  paint();
}

function toast(text) {
  toastEl.hidden = false;
  toastEl.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3400);
}

function savedMessage(waiting) {
  if (waiting) {
    return mode === "practice"
      ? "Kept on this phone until there is signal."
      : "Kept on this phone. It will go to the practice folder when there is signal. The real book is not used.";
  }
  return mode === "practice" ? "Saved on this phone." : "Saved to the practice folder. The real book was not touched.";
}

function showClash() {
  const current = stack.at(-1)?.name;
  show("clash", {}, current === "clash" || (current !== "home" && current !== "signin"));
}

function afterWrite(beforeClashes, result) {
  view = result;
  if (!result.ok) {
    const el = document.querySelector("#form-error");
    if (el) el.textContent = result.error || "Could not save.";
    return;
  }
  if ((result.clashes || []).length > beforeClashes) {
    toast(mode === "practice" ? "One note needs a look. The rest is on this phone." : "One note needs a look. The rest went to the practice folder.");
    showClash();
    return;
  }
  toast(savedMessage(result.waiting));
  goHome();
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (!sync || busy) return;
  const frame = stack[stack.length - 1];
  const data = Object.fromEntries(new FormData(form).entries());
  const before = view.clashes.length;
  busy = true;
  try {
    let result;
    if (form.dataset.form === "calving") {
      result = await sync.logCalving({
        motherId: data.motherId,
        calfTag: data.calfTag,
        calfSex: frame.params.calfSex || "heifer",
        date: data.date,
      });
    } else if (form.dataset.form === "treatment") {
      result = await sync.logTreatment({
        animalId: data.animalId,
        date: data.date,
        what: data.what,
        note: data.note,
      });
    } else if (form.dataset.form === "movement") {
      result = await sync.logMovement({
        animalId: data.animalId,
        date: data.date,
        farm: data.farm,
        paddock: data.paddock,
      });
    } else if (form.dataset.form === "count") {
      result = await sync.logCount({
        farm: data.farm,
        paddock: data.paddock,
        date: data.date,
        cows: Number(frame.params.cows || 0),
        calves: Number(frame.params.calves || 0),
        bulls: Number(frame.params.bulls || 0),
        note: data.note,
      });
    }
    if (result) afterWrite(before, result);
  } catch (error) {
    const el = document.querySelector("#form-error");
    if (el) el.textContent = error.message || "Could not save.";
  } finally {
    busy = false;
  }
}

function onClick(event) {
  const chip = event.target.closest("[data-chip]");
  if (chip) {
    const frame = stack[stack.length - 1];
    frame.params[chip.dataset.chip] = chip.dataset.value;
    paint();
    return;
  }
  const step = event.target.closest("[data-step]");
  if (step) {
    const frame = stack[stack.length - 1];
    const field = step.dataset.field;
    const next = Math.max(0, Number(frame.params[field] || 0) + Number(step.dataset.step));
    frame.params[field] = next;
    const node = main.querySelector(`[data-count="${field}"]`);
    if (node) node.textContent = String(next);
    const total = ["cows", "calves", "bulls"].reduce((sum, name) => sum + Number(frame.params[name] || 0), 0);
    const totalNode = main.querySelector('[data-count="total"]');
    if (totalNode) totalNode.textContent = String(total);
    return;
  }
  const clash = event.target.closest("[data-clash]");
  if (clash) {
    onClash(clash.dataset.clash, clash.dataset.id);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    onAction(action.dataset.action);
    return;
  }
  const go = event.target.closest("[data-go]");
  if (go) {
    const params = {};
    if (go.dataset.id) params.id = go.dataset.id;
    show(go.dataset.go, params);
  }
}

async function onClash(kind, id) {
  if (!sync || busy) return;
  busy = true;
  const before = view.clashes.length;
  try {
    const result = kind === "keep" ? await sync.reapplyClash(id) : await sync.dropClash(id);
    view = result;
    if (result.ok === false) {
      toast(result.error || "Could not update that note.");
      paint();
      return;
    }
    if (kind === "keep" && (result.clashes || []).length >= before) {
      toast("That note still needs a look.");
      paint();
      return;
    }
    toast(kind === "drop" ? "Your version was dropped." : savedMessage(result.waiting));
    if (!view.clashes.length) goHome();
    else paint();
  } catch (error) {
    toast(error.message || "Could not update that note.");
  } finally {
    busy = false;
  }
}

async function onAction(action) {
  if (!sync || busy) return;
  busy = true;
  const before = view.clashes.length;
  try {
    view = action === "flush" ? await sync.flush() : await sync.pull();
    if ((view.clashes || []).length > before) {
      toast("One note needs a look.");
      showClash();
      return;
    }
    toast(view.pending.length ? "Still on this phone." : action === "pull" ? "Checked." : savedMessage(false));
    paint();
  } catch (error) {
    toast(error.message || "Could not reach the practice copy.");
    paint();
  } finally {
    busy = false;
  }
}

function onInput(event) {
  const frame = stack[stack.length - 1];
  const el = event.target;
  if (!frame || !el) return;
  if (el.dataset?.field) frame.params[el.dataset.field] = el.value;
  if (el.name === "motherId" || el.name === "animalId") frame.params.id = el.value;
  if (el.name === "calfTag") frame.params.calfTag = el.value;
  if (el.name === "date") frame.params.date = el.value;
  if (el.name === "what") frame.params.what = el.value;
  if (el.name === "note") frame.params.note = el.value;
  if (el.name === "farm") frame.params.farm = el.value;
  if (el.name === "paddock") frame.params.paddock = el.value;
  if (event.type === "input" && frame.name === "find" && el.dataset?.field === "q") {
    const list = document.querySelector("#find-list");
    if (list) list.innerHTML = animalRows(sortedActive().filter((animal) => matchesFind(animal, frame.params)));
  }
  if (frame.name === "count" && (el.name === "farm" || el.name === "paddock")) {
    const hint = document.querySelector("#count-hint");
    if (hint) hint.textContent = countHint(frame.params);
  }
  if (frame.name === "movement" && el.name === "animalId") {
    const animal = animalById(el.value);
    const now = document.querySelector("#move-now");
    if (now) now.textContent = animal ? `Now in ${place(animal)}.` : "Choose the animal, then where it is going.";
  }
}

async function boot() {
  try {
    if (clientIdIsPlaceholder()) {
      mode = "practice";
      const drive = createLocalDrive({ storage: localStorage });
      const stat = await drive.stat();
      if (stat.status === 404) await drive.create(sampleBook());
      sync = createSync({
        drive,
        store: idbStore("cattle-phone-demo"),
        online: () => navigator.onLine,
      });
      view = await sync.init();
      show("home");
      return;
    }
    mode = "microsoft";
    auth = await createAuth();
    const token = await auth.getToken();
    if (!token) {
      show("signin");
      return;
    }
    const drive = createGraphDrive({
      fetch: window.fetch.bind(window),
      getToken: () => auth.getToken(),
      path: PRACTICE_PATH,
    });
    sync = createSync({
      drive,
      store: idbStore("cattle-phone-practice"),
      online: () => navigator.onLine,
    });
    view = await sync.init();
    show("home");
  } catch (error) {
    main.dataset.screen = "error";
    main.innerHTML = `<div class="screen"><div class="body"><p class="warn">${escapeHtml(error.message || "Could not open the book.")}</p><p class="hint"><a href="./setup.html">Setup steps</a></p></div></div>`;
    subtitleEl.textContent = "Could not open";
  }
}

backEl.addEventListener("click", () => {
  if (stack.length > 1) {
    stack.pop();
    paint();
  }
});
main.addEventListener("click", onClick);
main.addEventListener("submit", onSubmit);
main.addEventListener("input", onInput);
main.addEventListener("change", onInput);

window.addEventListener("online", async () => {
  if (!sync) return;
  try {
    const before = view?.clashes?.length || 0;
    view = await sync.flush();
    if ((view.clashes || []).length > before) showClash();
    else paint();
  } catch (error) {
    if (view) view.warning = error.message || view.warning;
    paint();
  }
});
window.addEventListener("offline", () => {
  if (!view) return;
  view = { ...view, offline: true };
  paint();
});

document.querySelector("#main").addEventListener("click", async (event) => {
  if (event.target.id !== "sign-in" || !auth) return;
  try {
    await auth.signIn();
  } catch (error) {
    toast(error.message || "Microsoft sign-in is not set up yet.");
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

boot();
