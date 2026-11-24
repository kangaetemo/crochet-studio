import test from "node:test";
import assert from "node:assert/strict";
import { analyzePattern, analyzeProject } from "./docs/pattern.mjs";
import { layoutParts, defaultRoundColor, resolveAppearance } from "./docs/scene.mjs";
import { buildSurface } from "./docs/renderer-gl.mjs";
import { yarnInstances, yarnTemplate } from "./docs/yarn.mjs";

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

test("accepts the screenshot's comma-free repeat with the same stitch order", () => {
  const prefix = "R1: SH: 9 sc\n9 inc\n";
  for (const group of ["(1 sc 1 inc 1 sc) x6", "[1sc 1inc 1sc] ×6", "6*(1 sc 1 inc 1 sc)"]) {
    const rows = analyzePattern(prefix + group);
    assert.ok(rows.every(row => row.preview), group);
    assert.deepEqual(rows.map(row => row.made), [9, 18, 24]);
    assert.equal(rows[2].used, 18);
    assert.deepEqual(rows[2].stitches, analyzePattern(prefix + "(1 sc, 1 inc, 1 sc) x6")[2].stitches);
  }
});

test("accepts comma-free quantities while preserving multiword stitches and loops", () => {
  for (const [input, separated] of [
    ["1 sc 1 inc 1 sc", "1 sc, 1 inc, 1 sc"],
    ["1 hdc inc 1 hdc dec 1 sık iğne", "1 hdc inc, 1 hdc dec, 1 sık iğne"],
    ["FLO 1 sc 1 inc 1 sc BLO", "FLO 1 sc, 1 inc, 1 sc BLO"],
    ["2 sc in next st 1 sc", "2 sc in next st, 1 sc"],
    ["[(1 sc 1 inc) x2] x3", "[(1 sc, 1 inc) x2] x3"]
  ]) {
    const row = analyzePattern(input)[0];
    assert.equal(row.issue, "", input);
    assert.deepEqual(row.stitches, analyzePattern(separated)[0].stitches, input);
  }
});

test("applies FLO to every stitch of the screenshot's fifth round", () => {
  const [part] = analyzeProject("mr: 9 sc\n9 inc\n(1 sc 1 inc 1 sc) x6\n(3 sc 1 inc) x6\nFLO: (2 sc 1 inc 2 sc) x6");
  assert.deepEqual(part.rows.map(({ made }) => made), [9, 18, 24, 30, 36]);
  assert.ok(part.rows.every(({ preview }) => preview));
  const fifth = part.rows[4];
  assert.equal(fifth.used, 30);
  assert.equal(fifth.stitches.length, 30);
  assert.ok(fifth.stitches.every(({ loop }) => loop === "flo"));
});

test("applies BLO across the round and preserves individual loop instructions", () => {
  const rows = analyzePattern("6 sc\nR2: BLO: 2 sc, (FLO sc, inc) x2 = 8");
  assert.equal(rows[1].issue, "");
  assert.equal(rows[1].made, 8);
  assert.deepEqual(rows[1].stitches.map(({ loop }) => loop), ["blo", "blo", "flo", "blo", "flo", "blo"]);
});

test("comma-free sequences still reject unknown commands and excessive work", () => {
  for (const input of ["1 sc 1 xyz 1 inc", "(1 sc 1 xyz) x6"]) {
    assert.match(analyzePattern(input)[0].issue, /tanıyamadım.*xyz/);
  }
  for (const input of ["400 sc 1 sc", "(1 sc 1 inc 1 sc) x400"]) {
    assert.match(analyzePattern(input)[0].issue, /en fazla/);
  }
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

test("recognizes the winter assembly and places its details without changing counts", () => {
  const parts = analyzeProject([
    "### Gövde", "6 sc", "6 inc", "5 sc, bob, 5 sc, bob", "12 sc", "5 sc, bob, 5 sc, bob",
    "### Kulak", "4 hdc", "### Kulak", "4 hdc",
    "### Şapka", "4 sc", "4 inc", "4 dec", "4 inc", "8 sc"
  ].join("\n"));
  assert.equal(resolveAppearance(parts), "winter");
  assert.equal(resolveAppearance(parts, "plain"), "plain");
  assert.equal(resolveAppearance(parts.filter((part) => part.name !== "Kulak 2")), "plain");
  const plain = layoutParts(parts);
  const winter = layoutParts(parts, "winter");
  const [body, ear, otherEar, hat] = parts;
  assert.ok(winter.get(body.id).heightScale < plain.get(body.id).heightScale);
  assert.equal(winter.get(body.id).flipped, true);
  assert.ok(winter.get(ear.id).x < 0 && winter.get(otherEar.id).x > 0);
  assert.ok(winter.get(hat.id).y < plain.get(hat.id).y);
  assert.equal(defaultRoundColor(hat, 3, "winter"), "#f6eee0");
  assert.notEqual(defaultRoundColor(hat, 3, "winter"), defaultRoundColor(hat, 4, "winter"));
  assert.deepEqual(hat.rows.map((row) => row.made), [4, 8, 4, 8, 8]);
});

test("keeps the pasted polar bear wider than it is tall in both previews", () => {
  const bodyPattern = [
    "6 sc in magic ring", "6 inc", "(sc, inc) x6", "(sc, inc, sc) x6", "(3 sc, inc) x6",
    "30 sc", "(5 sc, inc) x5", "R8-9: 35 sc", "11 sc, bob, 11 sc, bob, 11 sc",
    "R11-14: 35 sc", "11 sc, bob, 11 sc, bob, 11 sc", "(sc, dec) x11, 2 sc", "12 dec", "6 dec"
  ].join("\n");
  const single = analyzeProject(bodyPattern);
  const assembled = analyzeProject("### Body\n" + bodyPattern +
    "\n### Ears\n5 hdc\n### Ears\n5 hdc\n### Hat\n5 sc\n5 inc\n5 dec\n5 inc");
  const winter = resolveAppearance(assembled);
  assert.equal(winter, "winter");

  for (const [parts, appearance] of [[single, "plain"], [assembled, winter]]) {
    const body = parts[0];
    assert.equal(body.rows.length, 18);
    assert.ok(body.rows.every((row) => row.preview));
    assert.deepEqual(body.rows.slice(-3).map((row) => row.made), [24, 12, 6]);
    const placement = layoutParts(parts, appearance).get(body.id);
    const totalHeight = body.rows.reduce((sum, row) => sum + row.height, 0);
    const diameter = Math.max(...body.rows.map((row) => row.made)) * placement.widthScale / Math.PI;
    const aspectRatio = totalHeight * placement.heightScale / diameter;
    assert.ok(aspectRatio >= 0.75 && aspectRatio <= 0.85);
  }

  const open = analyzeProject(bodyPattern.split("\n").slice(0, -3).join("\n"));
  assert.equal(layoutParts(open).get(open[0].id).heightScale, 1);
});

test("builds bounded, closed surface geometry from valid rounds", () => {
  const rounds = analyzePattern("R1: 6 sc\nR2: 6 inc\nR3: 12 sc\nR4: 6 dec");
  const rings = rounds.map((row, i) => ({
    row, stitches: row.stitches.flatMap((stitch) => Array(stitch.made).fill(stitch)),
    radius: row.made / (2 * Math.PI), height: i + 1, material: [210, 175, 190]
  }));
  const geometry = buildSurface({ rings, height: 4, heightScale: 1, radius: rings[1].radius, hasFace: false });
  const numberOfVertices = geometry.vertices.length / 12;
  assert.ok(numberOfVertices <= rings.length * 97 * 3);
  assert.ok(geometry.vertices.every(Number.isFinite));
  assert.ok(geometry.indices.every((index) => index < numberOfVertices));
  assert.equal(geometry.indices.length % 3, 0);
  assert.equal(Math.hypot(geometry.vertices.at(-12), geometry.vertices.at(-10)), 0);
});

test("two-ply mesh is reusable and contains only finite, indexed geometry", () => {
  for (const [steps, sides] of [[32,6],[12,4]]) {
    const {vertices,indices} = yarnTemplate(steps,sides);
    assert.equal(vertices.length/6,2*(steps+1)*sides);
    assert.equal(indices.length,2*steps*sides*6);
    assert.ok(vertices.every(Number.isFinite));
    assert.ok(indices.every(i => i < vertices.length/6));
  }
});

test("increases share their parent and skips advance the following stitch's base", () => {
  const rows = analyzePattern("4 sc\ninc, sk, 2 sc\ndec, 2 sc");
  assert.ok(rows.every(r => r.preview));
  const rings = rows.map((row,i) => ({ row, height:i+1, radius:row.made/(2*Math.PI),
    stitches:row.stitches.flatMap(s => Array(s.made).fill(s)) }));
  const {data,count} = yarnInstances({rings,height:3,heightScale:1,radius:1});
  assert.equal(count,11);
  assert.ok(data.every(Number.isFinite));
  const parentAngle = i => data[12*i] + data[12*i+1];
  assert.ok(Math.abs(parentAngle(4)-parentAngle(5)) < 1e-6);
  assert.ok(Math.abs(parentAngle(6)-Math.PI) < 1e-6);
  assert.ok(Math.abs(parentAngle(8)-(0.085+Math.PI/4)) < 1e-6);
});

