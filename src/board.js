// Real players only: a new board is empty.
export function emptyBoard() {
  return { scores: [] };
}

// Same rule as the browser (session.js validName): "Elaina G." style, 2 to 14 characters.
const NAME = /^[A-Za-z][A-Za-z .'-]{1,13}$/;

export function parseEntry(body, today) {
  if (!body || typeof body !== "object") return null;
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const points = Number(body.points);
  if (!NAME.test(name)) return null;
  if (!Number.isInteger(points) || points < 0 || points > 20000) return null;
  const day = typeof body.day === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(body.day) ? body.day : today;
  return { name, points, day };
}

function byRank(a, b) {
  return b.points - a.points || a.name.localeCompare(b.name);
}

export function addScore(board, entry) {
  const scores = (Array.isArray(board?.scores) ? board.scores : emptyBoard().scores)
    .concat(entry)
    .filter((row) => row && NAME.test(row.name) && Number.isInteger(row.points))
    .sort(byRank)
    .slice(0, 40);
  return { scores };
}

// Each player's best score once, top 10.
export function publicBoard(board) {
  const seen = new Set();
  const scores = (Array.isArray(board?.scores) ? board.scores : [])
    .slice()
    .sort(byRank)
    .filter((row) => {
      const key = row.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
  return {
    scores: scores.map((row) => ({ name: row.name, points: row.points, day: row.day || "" })),
  };
}
