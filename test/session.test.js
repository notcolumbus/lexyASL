import assert from "node:assert/strict";
import test from "node:test";
import {
  LINES,
  accept,
  advance,
  almost,
  attract,
  begin,
  breakdown,
  markSaved,
  meter,
  popped,
  targetLetter,
  typeName,
  FLAT_TOTAL,
} from "../js/session.js";

test("a finished line totals 3200", () => {
  for (const line of LINES) {
    let state = begin(line);
    const seen = [];
    while (state.phase === "play") {
      seen.push(targetLetter(state));
      state = advance(accept(state));
    }
    assert.equal(seen.join(""), line.words.join(""));
    assert.equal(state.phase, "summary");
    const score = breakdown(state);
    assert.equal(score.letterPoints, 1600);
    assert.equal(score.wordPoints, 800);
    assert.equal(score.sentencePoints, 800);
    assert.equal(score.total, FLAT_TOTAL);
    assert.equal(score.letterMult, 2);
    assert.equal(score.sentenceMult, 2);
    assert.equal(popped(state), true);
    assert.equal(meter(state), 3);
  }
});

test("the pop is 200 and a second accept during the flash does nothing", () => {
  let state = begin(LINES[0]);
  state = accept(state);
  assert.equal(state.feedback.points, 200);
  assert.equal(accept(state), state);
});

test("advance waits for a sign", () => {
  const state = begin(LINES[0]);
  assert.equal(advance(state), state);
});

test("an almost does not clear a letter", () => {
  const state = begin(LINES[1]);
  const next = almost(state, "Bring your thumb down more.");
  assert.equal(next.cleared, 0);
  assert.equal(almost(next, "Bring your thumb down more."), next);
});

test("the third sign pops the background", () => {
  let state = begin(LINES[2]);
  state = advance(accept(state));
  state = advance(accept(state));
  assert.equal(popped(state), false);
  state = accept(state);
  assert.equal(popped(state), true);
});

test("a name saves once and ignores a short name", () => {
  let state = begin(LINES[0]);
  while (state.phase === "play") state = advance(accept(state));
  assert.equal(markSaved(state), state);
  state = typeName(state, "A");
  assert.equal(markSaved(state), state);
  state = typeName(typeName(state, "D"), "A");
  state = markSaved(state);
  assert.equal(state.saved, true);
  assert.equal(state.name, "ADA");
  assert.equal(typeName(state, "Z"), state);
});

test("attract has no play fields", () => {
  assert.equal(attract().phase, "attract");
});
