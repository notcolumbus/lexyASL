import assert from "node:assert/strict";
import test from "node:test";
import { addScore, emptyBoard, parseEntry, publicBoard } from "../src/board.js";

test("a new board starts with the seed names", () => {
  assert.deepEqual(
    publicBoard(emptyBoard()).scores.map((row) => row.name),
    ["PALM", "INK", "LOOP"],
  );
});

test("a saved score sorts ahead of a lower seed", () => {
  const next = addScore(emptyBoard(), { name: "ADA", points: 3200, day: "2026-10-27" });
  assert.equal(publicBoard(next).scores[0].name, "ADA");
  assert.equal(publicBoard(next).scores[0].points, 3200);
});

test("names and scores are checked before they are stored", () => {
  assert.equal(parseEntry({ name: "a", points: 3200 }, "2026-10-27"), null);
  assert.equal(parseEntry({ name: "Ada", points: 3201 }, "2026-10-27"), null);
  assert.deepEqual(parseEntry({ name: "ada", points: 3200, day: "2026-10-27" }, "2026-10-28"), {
    name: "ADA",
    points: 3200,
    day: "2026-10-27",
  });
});
