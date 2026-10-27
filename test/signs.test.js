import assert from "node:assert/strict";
import test from "node:test";
import { LETTERS, SUCCESS_SCORE, ALMOST_SCORE, judge, sample } from "../js/signs.js";
import { LINES } from "../js/session.js";

test("each sample matches its own letter and not the others", () => {
  const matrix = [];
  for (const actual of LETTERS) {
    const row = { actual };
    const lm = sample(actual);
    for (const guess of LETTERS) {
      row[guess] = Number(judge(lm, guess).score.toFixed(2));
    }
    matrix.push(row);
  }
  const problems = [];
  for (const row of matrix) {
    if (row[row.actual] < SUCCESS_SCORE) problems.push(`${row.actual} self ${row[row.actual]}`);
    for (const guess of LETTERS) {
      if (guess !== row.actual && row[guess] >= SUCCESS_SCORE) {
        problems.push(`${row.actual} passes as ${guess} (${row[guess]})`);
      }
    }
  }
  assert.deepEqual(problems, [], JSON.stringify(matrix, null, 2));
});

test("a bent index on L is a miss with a correction", () => {
  const lm = sample("L", { 1: 0.7 });
  const result = judge(lm, "L");
  assert.ok(result.score < SUCCESS_SCORE, String(result.score));
  assert.ok(result.score >= ALMOST_SCORE, String(result.score));
  assert.match(result.correction, /index/i);
});

test("lines only use letters the matcher knows", () => {
  for (const line of LINES) {
    for (const ch of line.words.join("")) assert.ok(LETTERS.includes(ch), ch);
  }
});

test("a missing hand scores zero", () => {
  assert.equal(judge(null, "A").score, 0);
});
