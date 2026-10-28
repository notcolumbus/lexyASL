import assert from "node:assert/strict";
import test from "node:test";
import { MAX_POINTS, addScore, emptyBoard, parseEntry, publicBoard } from "../src/board.js";

test("a new board is empty: no made-up names", () => {
  assert.deepEqual(publicBoard(emptyBoard()).scores, []);
});

test("scores sort high to low and each player shows once, at their best", () => {
  let board = emptyBoard();
  for (const [name, points] of [["Elaina G.", 3200], ["Bobby H.", 1800], ["elaina g.", 900], ["Samantha A.", 2600]]) {
    board = addScore(board, { name, points, day: "2026-10-28" });
  }
  assert.deepEqual(publicBoard(board).scores.map((row) => `${row.name} ${row.points}`), [
    "Elaina G. 3200",
    "Samantha A. 2600",
    "Bobby H. 1800",
  ]);
});

test("one name posted many times keeps one stored row, so it can't push others off", () => {
  let board = addScore(emptyBoard(), { name: "Bobby H.", points: 900, day: "2026-10-28" });
  for (let i = 0; i < 60; i++) board = addScore(board, { name: "Spam", points: 1000 + i, day: "2026-10-28" });
  assert.equal(board.scores.length, 2);
  assert.deepEqual(publicBoard(board).scores.map((row) => `${row.name} ${row.points}`), ["Spam 1059", "Bobby H. 900"]);
});

test("names and scores are checked before they are stored", () => {
  assert.equal(parseEntry({ name: "a", points: 3200 }, "2026-10-27"), null);
  assert.equal(parseEntry({ name: "Ada<script>", points: 100 }, "2026-10-27"), null);
  assert.equal(parseEntry({ name: "Ada", points: MAX_POINTS + 1 }, "2026-10-27"), null);
  assert.deepEqual(parseEntry({ name: "  Elaina   G. ", points: 3200, day: "2026-10-27" }, "2026-10-28"), {
    name: "Elaina G.",
    points: 3200,
    day: "2026-10-27",
  });
});
