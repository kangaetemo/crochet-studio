import { analyzeProject } from "./pattern.mjs";
import { createScene, defaultRoundColor } from "./scene.mjs";

const examples = [
  {
    title: "Lavanta Topu",
    pattern: [
      "R1: SH: 6 sc (6)", "R2: inc x6 (12)", "R3: (sc, inc) x6 (18)",
      "R4: (2 sc, inc) x6 (24)", "R5: (3 sc, inc) x6 (30)", "R6-8: 30 sc",
      "R9: (3 sc, dec) x6 (24)", "R10: (2 sc, dec) x6 (18)",
      "R11: (sc, dec) x6 (12)", "R12: dec x6 (6)", "FO"
    ].join("\n")
  },
  {
    title: "Türkçe Mini Kubbe",
    pattern: [
      "1. tur: SH: 6X = 6", "2. tur: 6V = 12", "3. tur: (X, V) × 6 = 18",
      "4-6. tur: 18X", "7. tur: BLO 18X", "8. tur: (X, A) × 6 = 12", "Bitir"
    ].join("\n")
  },
  {
    title: "Böğürtlen Doku Örneği",
    pattern: [
      "R1: 6 sc in ring (6)", "R2: hdc inc x6 (12)", "R3: (hdc, dc inc) x6 (18)",
      "R4: (hdc, bob, hdc) x6 (18)", "R5: 18 hdc BLO", "R6: (hdc, dc dec) x6 (12)",
      "R7: hdc dec x6 (6)", "FO"
    ].join("\n")
  },
  {
    title: "Şapkalı Biblo",
    pattern: [
      "### Gövde", "R1: 6 sc in ring", "R2: 6 inc", "R3: (sc, inc) x6", "R4: (2 sc, inc) x6",
      "R5-8: 24 sc", "R9: (2 sc, dec) x6", "R10: (sc, dec) x6", "R11: 6 dec", "FO", "",
      "### Sol kulak", "R1: 4 hdc", "R2: (hdc, hdc inc) x2", "",
      "### Sağ kulak", "R1: 4 hdc", "R2: (hdc, hdc inc) x2", "",
      "### Şapka", "R1: 6 sc in ring", "R2: 6 inc", "R3: 12 hdc", "R4: (sc, inc) x6", "R5: 18 hdc"
    ].join("\n")
  }
];

const id = (name) => document.getElementById(name);
const title = id("title");
const pattern = id("pattern");
const list = id("round-list");
const yarnColor = id("yarn-color");
const picker = id("part-select");
const placement = id("part-placement");
const reverse = id("part-reverse");
const axes = ["x", "y", "z"];
const scene = createScene(id("model"));
const storageKey = "ilmek-atolyesi:draft:v1";

function loadDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey));
    if (typeof draft?.title === "string" && typeof draft?.pattern === "string") return draft;
  } catch {
    // A blocked or unavailable store still permits editing for this session.
  }
  return { ...examples[0], colors: {}, progress: 0 };
}

let draft = loadDraft();
let parts = [];
let activePart = "default";
let rows = [];
let selected = 0;
let tracking = false;
let saveTimer;

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(draft));
    id("save-status").textContent = "Tarayıcıya kaydedildi";
  } catch {
    id("save-status").textContent = "Taslak kaydı kullanılamıyor";
  }
}

function settings(partId = activePart) {
  return partId === "default" ? draft : draft.parts?.[partId] ?? {};
}

function updateSettings(patch, partId = activePart) {
  if (partId === "default") {
    Object.assign(draft, patch);
  } else {
    draft.parts = { ...draft.parts, [partId]: { ...settings(partId), ...patch } };
  }
}

function renderPartPicker() {
  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    const option = document.createElement("option");
    option.value = part.id;
    option.textContent = part.name;
    fragment.append(option);
  }
  picker.replaceChildren(fragment);
  picker.value = activePart;
  id("part-controls").hidden = parts.length < 2;
}

function renderList() {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "round-row";
    button.dataset.round = row.number;
    if (row.issue) button.classList.add("has-error");
    button.setAttribute("aria-pressed", String(row.number === selected));
    const label = document.createElement("strong");
    label.textContent = "Tur " + row.number;
    const command = document.createElement("span");
    command.className = "round-command";
    command.textContent = row.issue || row.command;
    if (row.note) {
      const note = document.createElement("small");
      note.className = "round-note";
      note.textContent = row.note;
      command.append(note);
    }
    const count = document.createElement("span");
    count.className = "number";
    count.textContent = row.made == null ? "—" : row.made + " ilmek";
    button.append(label, command, count);
    li.append(button);
    fragment.append(li);
  }
  list.replaceChildren(fragment);
}

function renderSelection() {
  const valid = rows.filter((row) => row.preview);
  const active = valid.find((row) => row.number === selected);
  const configured = settings();
  const part = parts.find(({ id }) => id === activePart);
  scene.update(parts.map((piece) => {
    const saved = settings(piece.id);
    return { ...piece, colors: saved.colors, offset: saved.offset };
  }), { part: activePart, round: selected });
  id("show-all").hidden = !selected;
  yarnColor.disabled = !active;
  id("swatch-label").textContent = active ? active.number + ". turun rengi" : "Renk için tur seç";
  if (active) yarnColor.value = configured.colors?.[active.number] ?? defaultRoundColor(part, active.number);
  if (parts.length > 1) {
    for (const axis of axes) id("part-" + axis).value = configured.offset?.[axis] ?? 0;
    reverse.checked = Boolean(configured.offset?.reverse);
  }
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.round) === selected));
  }
  id("tracking").setAttribute("aria-pressed", String(tracking));
  id("tracking-panel").hidden = !tracking;
  const done = Math.min(configured.progress ?? 0, valid.length);
  const next = valid[done];
  const hasError = valid.length < rows.length;
  id("progress-text").textContent = next
    ? "Örülen tur " + done + " / " + valid.length
    : hasError ? "Devam etmek için hatalı turu düzelt." : valid.length ? "Bütün turlar tamamlandı!" : "Henüz örülecek tur yok.";
  id("current-command").textContent = next ? "Tur " + next.number + " · " + next.command : "";
  id("previous-round").disabled = !done;
  id("next-round").disabled = !next;
}

function renderPattern() {
  const previousLengths = new Map(parts.map((part) => [part.id, part.rows.filter((row) => row.preview).length]));
  parts = analyzeProject(draft.pattern);
  for (const part of parts) {
    const saved = settings(part.id);
    const count = part.rows.filter((row) => row.preview).length;
    const progress = Math.min(saved.progress ?? 0, count, previousLengths.get(part.id) ?? count);
    if (saved.progress !== undefined && saved.progress !== progress) updateSettings({ progress }, part.id);
  }
  if (!parts.some((part) => part.id === activePart)) {
    activePart = parts[0].id;
    selected = 0;
  }
  renderPartPicker();
  renderActivePart();

  const allRows = parts.flatMap((part) => part.rows);
  const valid = allRows.filter((row) => row.preview);
  const issues = allRows.filter((row) => row.issue);
  id("preview-state").textContent = !valid.length ? "" : issues.length
    ? parts.length === 1 ? valid.length + ". tura kadar" : "Kısmi önizleme"
    : parts.length > 1 ? parts.filter((part) => part.rows.some((row) => row.preview)).length + " parça" : "Canlı";
  id("empty-model").hidden = Boolean(valid.length);
  id("round-count").textContent = valid.length;
  id("stitch-count").textContent = valid.reduce((total, row) => total + row.made, 0);
}

function renderActivePart() {
  rows = parts.find((part) => part.id === activePart).rows;
  if (!rows.some((row) => row.number === selected)) selected = 0;
  const issues = rows.filter((row) => row.issue);
  id("check-status").textContent = !rows.length
    ? "İlmek sayılarını görmek için bir tur yaz."
    : issues.length ? issues.length + " turda sorun var." : "Bütün tur sayıları tutuyor.";
  id("check-status").classList.toggle("warning", Boolean(issues.length));
  renderList();
  renderSelection();
}

function syncFields() {
  title.value = draft.title;
  pattern.value = draft.pattern;
  title.placeholder = "Adsız tarif";
  renderPattern();
  save();
}

title.addEventListener("input", () => {
  draft.title = title.value;
  save();
});
pattern.addEventListener("input", () => {
  draft.pattern = pattern.value;
  renderPattern();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 220);
});
window.addEventListener("pagehide", () => {
  if (saveTimer) save();
});
list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-round]");
  if (!button) return;
  selected = Number(button.dataset.round);
  renderSelection();
});
picker.addEventListener("change", () => {
  activePart = picker.value;
  selected = 0;
  renderActivePart();
});
for (const axis of axes) {
  const control = id("part-" + axis);
  control.addEventListener("input", () => {
    updateSettings({ offset: { ...settings().offset, [axis]: Number(control.value) } });
    renderSelection();
    save();
  });
}
reverse.addEventListener("change", () => {
  updateSettings({ offset: { ...settings().offset, reverse: reverse.checked } });
  renderSelection();
  save();
});
id("reset-part").addEventListener("click", () => {
  updateSettings({ offset: {} });
  renderSelection();
  save();
});
id("show-all").addEventListener("click", () => {
  selected = 0;
  renderSelection();
});
yarnColor.addEventListener("input", () => {
  updateSettings({ colors: { ...settings().colors, [selected]: yarnColor.value } });
  renderSelection();
  save();
});
id("zoom-out").addEventListener("click", () => scene.zoom(0.83));
id("zoom-in").addEventListener("click", () => scene.zoom(1.2));
id("reset-view").addEventListener("click", () => scene.reset());
id("tracking").addEventListener("click", () => {
  tracking = !tracking;
  selected = tracking ? Math.min((settings().progress ?? 0) + 1, rows.filter((row) => row.preview).length) : 0;
  renderSelection();
  if (tracking) id("tracking-panel").scrollIntoView({ block: "nearest" });
});
for (const [name, direction] of [["previous-round", -1], ["next-round", 1]]) {
  id(name).addEventListener("click", () => {
    const valid = rows.filter((row) => row.preview).length;
    const progress = Math.min(valid, Math.max(0, (settings().progress ?? 0) + direction));
    updateSettings({ progress });
    selected = Math.min(progress + 1, valid);
    renderSelection();
    save();
  });
}

const dialog = id("examples");
id("load-example").addEventListener("click", () => dialog.showModal());
for (const example of examples) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button secondary";
  button.textContent = example.title;
  button.addEventListener("click", () => {
    draft = { ...example, colors: {}, progress: 0 };
    activePart = "default";
    placement.open = false;
    selected = 0;
    tracking = false;
    scene.reset();
    syncFields();
    dialog.close();
  });
  id("example-list").append(button);
}

id("download").addEventListener("click", () => {
  const filename = (draft.title.trim() || "Tarif").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
  const url = URL.createObjectURL(new Blob([draft.pattern + "\n"], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename + ".txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

syncFields();
