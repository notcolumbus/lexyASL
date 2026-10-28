import assert from "node:assert/strict";
import test from "node:test";
import { addScore, emptyBoard, parseEntry, publicBoard } from "../src/board.js";

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

test("names and scores are checked before they are stored", () => {
  assert.equal(parseEntry({ name: "a", points: 3200 }, "2026-10-27"), null);
  assert.equal(parseEntry({ name: "Ada<script>", points: 100 }, "2026-10-27"), null);
  assert.equal(parseEntry({ name: "Ada", points: 20001 }, "2026-10-27"), null);
  assert.deepEqual(parseEntry({ name: "  Elaina   G. ", points: 3200, day: "2026-10-27" }, "2026-10-28"), {
    name: "Elaina G.",
    points: 3200,
    day: "2026-10-27",
  });
});
