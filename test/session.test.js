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
  targetWord,
  typeName,
  WORD_SIGNS,
} from "../public/js/session.js";

test("each word is spelled, then signed, and the line scores every step", () => {
  for (const line of LINES) {
    let state = begin(line);
    const seen = [];
    while (state.phase === "play") {
      const word = targetWord(state);
      seen.push(word ? `[${word}]` : targetLetter(state));
      state = advance(accept(state));
    }
    assert.equal(seen.join(""), line.words.map((w) => w + `[${w}]`).join(""));
    assert.equal(state.phase, "summary");
    const letters = line.words.join("").length;
    assert.equal(state.points, letters * 200 + line.words.length * 400);
    const score = breakdown(state);
    assert.equal(score.total, letters * 400 + line.words.length * 400 + 800);
    assert.ok(score.total <= 10000, String(score.total));
    assert.equal(meter(state), 1);
  }
});

test("every word has a sign and lines are three or four words", () => {
  for (const line of LINES) {
    assert.ok(line.words.length >= 3 && line.words.length <= 4, line.text);
    for (const word of line.words) assert.ok(WORD_SIGNS[word], word);
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

test("the third letter pops the background", () => {
  let state = begin(LINES.find((line) => line.words[0].length >= 3));
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
