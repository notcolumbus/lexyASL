const SEED = [
  { name: "PALM", points: 2800, day: "seed" },
  { name: "INK", points: 2100, day: "seed" },
  { name: "LOOP", points: 1600, day: "seed" },
];

export function emptyData() {
  return { scores: SEED.map((row) => ({ ...row })), streaks: {} };
}

export function load(store) {
  const raw = store.get();
  if (!raw || !Array.isArray(raw.scores) || typeof raw.streaks !== "object" || raw.streaks === null) {
    return emptyData();
  }
  return { scores: raw.scores.slice(), streaks: { ...raw.streaks } };
}

export function top(data, count) {
  return data.scores
    .slice()
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
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

export function browserStore() {
  const key = "spellbound.v1";
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
