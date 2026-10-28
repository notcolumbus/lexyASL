import assert from "node:assert/strict";
import test from "node:test";
import { MAX_POINTS } from "../src/board.js";
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
  setName,
  finishEarly,
  skip,
  pointsFor,
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
    assert.equal(seen.join(""), line.words.map((w) => w + (WORD_SIGNS[w] ? `[${w}]` : "")).join(""));
    assert.equal(state.phase, "summary");
    const letters = line.words.join("").length;
    const signed = line.words.filter((w) => WORD_SIGNS[w]).length;
    assert.equal(state.points, letters * 280 + signed * 500);
    const score = breakdown(state);
    assert.equal(score.total, letters * 280 * (letters >= 3 ? 2 : 1) + signed * 500 * 3 + 2000);
    let perfect = begin(line);
    while (perfect.phase === "play") perfect = advance(accept(perfect, 1));
    assert.ok(breakdown(perfect).total <= MAX_POINTS, "a perfect round fits under the server cap");
    assert.equal(meter(state), 1);
  }
});

test("quotes are tiny, credited, and only real word signs get a sign step", () => {
  for (const line of LINES) {
    assert.ok(line.words.length >= 1 && line.words.length <= 3, line.text);
    assert.ok(line.by && line.by.includes(","), `${line.text} needs "Who, Where"`);
    assert.equal(line.text.toUpperCase().replace(/[^A-Z ]/g, ""), line.words.join(" "), line.text);
  }
  const skips = begin(LINES.find((line) => line.id === "letitbe"));
  let state = skips;
  for (let i = 0; i < 3; i++) state = advance(accept(state));
  assert.equal(state.signing, false, "LET has no sign step");
  assert.equal(state.wordIndex, 1);
});

test("points follow accuracy, and a second accept during the flash does nothing", () => {
  assert.equal(pointsFor(false, 0), 200);
  assert.equal(pointsFor(false, 1), 350);
  assert.equal(pointsFor(true, 0), 400);
  assert.equal(pointsFor(true, 1), 600);
  let state = begin(LINES[0]);
  state = accept(state, 0.8);
  assert.equal(state.feedback.points, 320);
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
  let state = begin({ id: "abc", text: "abc", words: ["ABC"] });
  state = advance(accept(state));
  state = advance(accept(state));
  assert.equal(popped(state), false);
  state = accept(state);
  assert.equal(popped(state), true);
});

test("a name saves once, as written, and ignores a too-short name", () => {
  let state = begin(LINES[0]);
  while (state.phase === "play") state = advance(accept(state));
  assert.equal(markSaved(state), state);
  state = setName(state, "E");
  assert.equal(markSaved(state), state);
  state = setName(state, "Elaina G.<b>");
  assert.equal(state.name, "Elaina G.b");
  state = markSaved(setName(state, "Elaina G."));
  assert.equal(state.saved, true);
  assert.equal(state.name, "Elaina G.");
  assert.equal(setName(state, "Zed"), state);
});

test("publishing mid-round scores only what was signed", () => {
  let state = begin(LINES[0]);
  state = advance(accept(state));
  state = advance(accept(state));
  const done = finishEarly(state);
  assert.equal(done.phase, "summary");
  const score = breakdown(done);
  assert.equal(score.letters, 2);
  assert.equal(score.words, 0);
  assert.equal(score.sentence, 0);
  assert.equal(score.total, 2 * 280);
  assert.equal(finishEarly(begin(LINES[0])).phase, "play");
});

test("attract has no play fields", () => {
  assert.equal(attract().phase, "attract");
});

test("the sentence bank has six lines and skips the letters the model reads worst", () => {
  assert.equal(LINES.length, 6);
  for (const line of LINES) assert.doesNotMatch(line.words.join(""), /[ACDUVJZ]/, line.text);
});

test("space-skip moves past a letter and a word without scoring them", () => {
  let state = begin(LINES[0]);
  const word = LINES[0].words[0];
  for (let i = 0; i < word.length; i++) state = skip(state);
  assert.equal(state.signing, true);
  state = skip(state);
  assert.equal(state.wordIndex, 1);
  assert.equal(state.points, 0);
  assert.equal(breakdown(state).letters, 0);
  assert.equal(breakdown(state).words, 0);
  let last = begin(LINES[0]);
  while (last.phase === "play") last = skip(last);
  assert.equal(last.phase, "summary");
  assert.equal(breakdown(last).total, 0, "skipping everything scores nothing, not even the sentence bonus");
});
