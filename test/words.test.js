import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { WORD_LABELS, unpack, wordLogits } from "../public/js/words.js";
import { LINES, WORD_SIGNS } from "../public/js/session.js";

const parts = unpack(readFileSync(new URL("../public/models/popsign-250.bin", import.meta.url)).buffer.slice(0));
const fixture = JSON.parse(readFileSync(new URL("./popsign-fixture.json", import.meta.url), "utf8"));

test("the JS word model matches the TFLite original", () => {
  const z = wordLogits(parts, Float32Array.from(fixture.input));
  let worst = 0;
  for (let i = 0; i < z.length; i++) worst = Math.max(worst, Math.abs(z[i] - fixture.output[i]));
  assert.ok(worst < 1e-2, `max logit gap ${worst}`);
});

test("there are 250 word labels", () => {
  assert.equal(WORD_LABELS.length, 250);
});

test("every word sign is one the word model knows, and some lines use them", () => {
  for (const [word, sign] of Object.entries(WORD_SIGNS)) assert.ok(WORD_LABELS.includes(sign.label), word);
  assert.ok(LINES.some((line) => line.words.some((w) => WORD_SIGNS[w])));
});
