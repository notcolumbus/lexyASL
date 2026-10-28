import assert from "node:assert/strict";
import test from "node:test";
import { emptyData, load, record, top } from "../public/js/storage.js";

function memory() {
  let raw = null;
  return {
    get: () => raw,
    set: (value) => {
      raw = value;
    },
  };
}

test("an empty store shows the seed board", () => {
  const data = load(memory());
  assert.deepEqual(
    top(data, 3).map((row) => row.name),
    ["PALM", "INK", "LOOP"],
  );
});

test("a score from the next day grows the streak and a gap resets it", () => {
  const store = memory();
  let data = emptyData();
  let saved = record(store, data, "ADA", 3200, "2026-10-26");
  data = saved.data;
  assert.equal(saved.streak, 1);
  saved = record(store, data, "ADA", 3400, "2026-10-27");
  data = saved.data;
  assert.equal(saved.streak, 2);
  saved = record(store, data, "ADA", 3000, "2026-10-27");
  assert.equal(saved.streak, 2);
  saved = record(store, saved.data, "ADA", 3000, "2026-11-02");
  assert.equal(saved.streak, 1);
  assert.equal(top(load(store), 1)[0].points, 3400);
});
