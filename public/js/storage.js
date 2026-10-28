export function emptyData() {
  return { scores: [], streaks: {} };
}

export function load(store) {
  const raw = store.get();
  if (!raw || !Array.isArray(raw.scores) || typeof raw.streaks !== "object" || raw.streaks === null) {
    return emptyData();
  }
  return { scores: raw.scores.slice(), streaks: { ...raw.streaks } };
}

// Each player once, at their best: same as the server's board.
export function top(data, count) {
  const seen = new Set();
  return data.scores
    .slice()
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .filter((row) => !seen.has(row.name.toLowerCase()) && seen.add(row.name.toLowerCase()))
    .slice(0, count);
}

export function todayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function record(store, data, name, points, today) {
  const prev = data.streaks[name];
  const prevN = prev ? dayNumber(prev.day) : null;
  const todayN = dayNumber(today);
  let streak = 1;
  if (prev && prev.day === today) streak = prev.streak;
  else if (prevN !== null && todayN !== null && todayN - prevN === 1) streak = prev.streak + 1;
  const next = {
    scores: data.scores.concat({ name, points, day: today }),
    streaks: { ...data.streaks, [name]: { day: today, streak } },
  };
  store.set(next);
  return { data: next, streak };
}

export async function pullScores() {
  try {
    const res = await fetch("/api/board");
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || !Array.isArray(body.scores)) return null;
    return body.scores;
  } catch {
    return null;
  }
}

export async function pushScore(name, points, day) {
  try {
    const res = await fetch("/api/board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, points, day }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.scores) ? body.scores : null;
  } catch {
    return null;
  }
}

export function browserStore() {
  const key = "spellbound.v2";
  return {
    get() {
      try {
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        return null;
      }
    },
    set(value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
  };
}
