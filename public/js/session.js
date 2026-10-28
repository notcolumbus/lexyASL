export const LINES = [
  { id: "day", text: "A DAY", words: ["A", "DAY"], pop: "cyan" },
  { id: "fly", text: "I FLY", words: ["I", "FLY"], pop: "yellow" },
  { id: "cow", text: "A COW", words: ["A", "COW"], pop: "cyan" },
];

export const FLAT_TOTAL = 3200;

export function lineForDay(day) {
  let hash = 0;
  for (const ch of day) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  return LINES[hash % LINES.length];
}

export function lineById(id) {
  return LINES.find((line) => line.id === id) || null;
}

export function attract() {
  return { phase: "attract" };
}

export function begin(line) {
  return {
    phase: "play",
    line,
    wordIndex: 0,
    letterIndex: 0,
    cleared: 0,
    feedback: null,
    name: "",
    saved: false,
    streak: 1,
  };
}

export function targetLetter(state) {
  if (state.phase !== "play") return "";
  return state.line.words[state.wordIndex][state.letterIndex];
}

export function popped(state) {
  return (state.cleared || 0) >= 3;
}

export function meter(state) {
  return Math.min(3, state.cleared || 0);
}

export function accept(state) {
  if (state.phase !== "play" || state.feedback?.kind === "success") return state;
  return {
    ...state,
    cleared: state.cleared + 1,
    feedback: { kind: "success", points: 200 },
  };
}

export function advance(state) {
  if (state.phase !== "play" || state.feedback?.kind !== "success") return state;
  const word = state.line.words[state.wordIndex];
  let wordIndex = state.wordIndex;
  let letterIndex = state.letterIndex + 1;
  if (letterIndex >= word.length) {
    letterIndex = 0;
    wordIndex += 1;
  }
  if (wordIndex >= state.line.words.length) {
    return { ...state, wordIndex, letterIndex, phase: "summary", feedback: null };
  }
  return { ...state, wordIndex, letterIndex, feedback: null };
}

export function almost(state, text) {
  if (state.phase !== "play" || state.feedback?.kind === "success") return state;
  if (state.feedback?.kind === "almost" && state.feedback.text === text) return state;
  return { ...state, feedback: { kind: "almost", text } };
}

export function clearAlmost(state) {
  if (state.feedback?.kind !== "almost") return state;
  return { ...state, feedback: null };
}

export function breakdown(state) {
  const letters = state.line.words.reduce((n, word) => n + word.length, 0);
  const words = state.line.words.length;
  const letterMult = state.cleared >= 3 ? 2 : 1;
  const wordMult = 2;
  const sentenceMult = letterMult === 2 && wordMult === 2 ? 2 : 1;
  const letterPoints = letters * 200 * letterMult;
  const wordPoints = words * 200 * wordMult;
  const sentencePoints = 400 * sentenceMult;
  return {
    letters,
    words,
    letterMult,
    wordMult,
    sentenceMult,
    letterPoints,
    wordPoints,
    sentencePoints,
    total: letterPoints + wordPoints + sentencePoints,
  };
}

export function typeName(state, key) {
  if (state.phase !== "summary" || state.saved) return state;
  if (key === "back") return { ...state, name: state.name.slice(0, -1) };
  if (/^[A-Z]$/.test(key) && state.name.length < 8) return { ...state, name: state.name + key };
  return state;
}

export function markSaved(state) {
  if (state.phase !== "summary" || state.saved || state.name.trim().length < 2) return state;
  return { ...state, saved: true };
}
