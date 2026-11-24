import test from "node:test";
import assert from "node:assert/strict";
import { analyzePattern, analyzeProject } from "./docs/pattern.mjs";
import { layoutParts, defaultRoundColor } from "./docs/scene.mjs";

test("parses each requested stitch, including both explicit reductions", () => {
  const cases = [
    ["6 sc", 6], ["6 inc", 12], ["3 dec", 3], ["6 hdc", 6], ["6 dc", 6],
    ["6 slst", 6], ["6 bob", 6], ["FLO 6 sc", 6], ["6 sc BLO", 6],
    ["6 hdc inc", 12], ["3 hdc dec", 3], ["6 dc inc", 12], ["3 dc dec", 3],
    ["3 hdc2tog", 3], ["3 dc2tog", 3]
  ];
  for (const [text, expected] of cases) {
    const row = analyzePattern("R1: 6 sc\nR2: " + text)[1];
    assert.equal(row.issue, "", text);
    assert.equal(row.used, 6, text);
    assert.equal(row.made, expected, text);
  }
});

test("understands Turkish rounds, nested repeats and loops", () => {
  const rows = analyzePattern("1. tur: SH: 6X = 6\n2. tur: 6V = 12\n3. tur: [(X, V) × 2] 3 times (18)\n4–6. tur: BLO 18X\n7. tur: (X, A) × 6 = 12");
  assert.deepEqual(rows.map(({ made, preview }) => [made, preview]), [[6, true], [12, true], [18, true], [18, true], [18, true], [18, true], [12, true]]);
  assert.equal(rows[3].stitches[0].loop, "blo");
});

test("reports a mismatch without generating later rounds in the model", () => {
  const rows = analyzePattern("R1: 6 sc\nR2: inc x5 (10)\nR3: 10 sc");
  assert.match(rows[1].issue, /5 ilmek kullanıyor/);
  assert.deepEqual(rows.map(({ preview }) => preview), [true, false, false]);
});

test("validates declared stitch counts and unknown instructions", () => {
  const rows = analyzePattern("R1: 6 sc\nR2: inc x6 (11)\nR3: xyz, 12 sc");
  assert.match(rows[1].issue, /hesaplanan sayı 12/);
  assert.match(rows[2].issue, /xyz/);
});

test("rejects excessive work and supports a single base stitch increase", () => {
  assert.match(analyzePattern("R1: sc x999999")[0].issue, /en fazla/);
  assert.equal(analyzePattern("R1: 1 sc\nR2: 2 hdc in next st")[1].made, 2);
});

test("reads short pattern notes and pinpoints a gap in stitch consumption", () => {
  const sample = [
    "-4", "-8", "-12", "---12x3?",
    "-sc2, inc4, sc6 16", "-sc1, (sc,inc)x4, sc7 20", "-sc2, (2sc, inc) x4, sc6 24",
    "--24x2", "-dec2, sc16, dec2 20", "-dec3, sc6, dec3 12",
    "-sc, dec x4 8", "-dec x4 4", "close"
  ].join("\n");
  const rows = analyzePattern(sample);
  assert.deepEqual(rows.map((row) => row.made), [4, 8, 12, 12, 12, 12, 16, 20, 24, 24, 24, 20, 12, 8, 4]);
  assert.equal(rows.filter((row) => row.preview).length, 12);
  assert.deepEqual(rows.filter((row) => row.issue).map((row) => row.number), [13]);
  assert.match(rows[12].issue, /2 ilmek boş kalıyor/);
  assert.match(rows[3].note, /Soru işaretli/);
  assert.match(rows[13].note, /tekrar bütün gruba/);

  const fixed = analyzePattern(sample.replace("-dec3, sc6, dec3 12", "-(sc, dec, dec) x4 12"));
  assert.equal(fixed.filter((row) => row.preview).length, 15);
});

test("keeps explicit totals and stitch quantities distinct", () => {
  const rows = analyzePattern("6 sc 6\n6 sc\nsc 6\nsc x 6\nR5: 6 x 2");
  assert.deepEqual(rows.map((row) => row.made), [6, 6, 6, 6, 6, 6]);
  assert.ok(rows.every((row) => !row.issue));
});

test("does not guess a repeat without a compatible target and preceding round", () => {
  const rows = analyzePattern("R1: 12 sc\nsc2, dec x6 18");
  assert.equal(rows[1].made, 8);
  assert.match(rows[1].issue, /ilmek eksik/);
  assert.equal(rows[1].note, undefined);
});

test("opens copied parts with independent round numbering and preserves repeated names", () => {
  const source = [
    "## The pattern", "", "Each line is one round.", "", "### Body",
    "1. **Round 1**6sc in magic ring", "2. **Round 2**6inc",
    "3. **Finishing**fasten off", "### Ears", "1. **Round 1**3 hdc",
    "2. **Round 2**3 hdc", "### Ears", "1. **Round 1**3 hdc",
    "2. **Round 2**3 hdc", "### Hat", "1. **Round 1**6 sc in ring",
    "2. **Round 2**(sc, inc)x3"
  ].join("\n");
  const parts = analyzeProject(source);
  assert.deepEqual(parts.map((part) => part.name), ["Body", "Ears", "Ears 2", "Hat"]);
  assert.equal(new Set(parts.map((part) => part.id)).size, 4);
  assert.deepEqual(parts.map((part) => part.rows.map((row) => row.made)), [[6, 12], [3, 3], [3, 3], [6, 9]]);
  assert.ok(parts.every((part) => part.rows.every((row) => row.preview)));
});

test("keeps errors local to one piece and retains an implicit single piece", () => {
  const project = analyzeProject("Gövde\nRound 1 6 sc\nR2: 5 inc\nŞapka:\nR1: 6 sc\nR2: 6 inc");
  assert.equal(project.length, 2);
  assert.deepEqual(project.map((part) => part.rows.map((row) => row.preview)), [[true, false], [true, true]]);
  assert.deepEqual(analyzeProject("R1: 6 sc\nRound 2  : 6 inc")[0].rows.map((row) => row.made), [6, 12]);
  assert.equal(analyzeProject("R1: 6 sc")[0].id, "default");
});

test("places duplicate ears on opposite sides and flips the hat over the body", () => {
  const parts = analyzeProject("### Gövde\n6 sc\n6 inc\n### Kulak\n4 hdc\n### Kulak\n4 hdc\n### Şapka\n6 sc\n6 inc");
  const placements = layoutParts(parts);
  const [body, firstEar, secondEar, hat] = parts.map((part) => placements.get(part.id));
  assert.equal(body.y, 0);
  assert.ok(firstEar.x < body.x && secondEar.x > body.x);
  assert.ok(hat.y > body.y);
  assert.equal(hat.flipped, true);
  assert.notEqual(defaultRoundColor(parts[0], 1), defaultRoundColor(parts[3], 1));
});
