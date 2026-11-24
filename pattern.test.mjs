import test from "node:test";
import assert from "node:assert/strict";
import { analyzePattern } from "./docs/pattern.mjs";

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
