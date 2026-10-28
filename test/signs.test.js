import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { LETTERS, SUCCESS_SCORE, ALMOST_SCORE, judge } from "../public/js/signs.js";
import { LINES } from "../public/js/session.js";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"));

function landmarks(flat) {
  const lm = [];
  for (let i = 0; i < 21; i++) lm.push({ x: flat[i * 2], y: flat[i * 2 + 1], z: 0 });
  return lm;
}

test("held-out hands match their own letter and not the others", () => {
  const problems = [];
  for (const actual of Object.keys(fixtures)) {
    const lm = landmarks(fixtures[actual]);
    const self = judge(lm, actual);
    if (self.score < SUCCESS_SCORE) problems.push(`${actual} self ${self.score}`);
    for (const guess of LETTERS) {
      if (guess === actual) continue;
      const other = judge(lm, guess);
      if (other.score >= SUCCESS_SCORE) problems.push(`${actual} passes as ${guess} (${other.score})`);
    }
  }
  assert.deepEqual(problems, []);
});

test("a folded index on L is a miss that names the index finger", () => {
  const lm = landmarks(fixtures.L);
  for (const joint of [6, 7, 8]) {
    lm[joint] = {
      x: lm[0].x + (lm[5].x - lm[0].x) * 0.4,
      y: lm[0].y + (lm[5].y - lm[0].y) * 0.4,
      z: 0,
    };
  }
  const result = judge(lm, "L");
  assert.ok(result.score < SUCCESS_SCORE, String(result.score));
  assert.ok(result.score >= ALMOST_SCORE, String(result.score));
  assert.match(result.correction, /pointer/i);
});

test("lines only use letters the matcher knows", () => {
  for (const line of LINES) {
    for (const ch of line.words.join("")) assert.ok(LETTERS.includes(ch), ch);
  }
});

test("a missing hand scores zero", () => {
  assert.equal(judge(null, "A").score, 0);
});
