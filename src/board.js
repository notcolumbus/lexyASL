const SEED = [
  { name: "PALM", points: 2800, day: "seed" },
  { name: "INK", points: 2100, day: "seed" },
  { name: "LOOP", points: 1600, day: "seed" },
];

export function emptyBoard() {
  return { scores: SEED.map((row) => ({ ...row })) };
}

export function parseEntry(body, today) {
  if (!body || typeof body !== "object") return null;
  const name = String(body.name || "").trim().toUpperCase();
  const points = Number(body.points);
  if (!/^[A-Z]{2,12}$/.test(name)) return null;
  if (!Number.isInteger(points) || points < 0 || points > 10000) return null;
  const day = typeof body.day === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(body.day) ? body.day : today;
  return { name, points, day };
}

function byRank(a, b) {
  return b.points - a.points || a.name.localeCompare(b.name);
}

export function addScore(board, entry) {
  const scores = (Array.isArray(board?.scores) ? board.scores : emptyBoard().scores)
    .concat(entry)
    .filter((row) => row && /^[A-Z]{2,12}$/.test(row.name) && Number.isInteger(row.points))
    .sort(byRank)
    .slice(0, 40);
  return { scores };
}

export function publicBoard(board) {
  const scores = (Array.isArray(board?.scores) ? board.scores : []).slice().sort(byRank).slice(0, 10);
  return {
    scores: scores.map((row) => ({ name: row.name, points: row.points, day: row.day || "" })),
  };
}
