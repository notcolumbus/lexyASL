// Short and hard to fail: only letters with very distinct shapes, and every word is one
// PopSign's word model knows. label: its name in the model. hand: the picture shown meanwhile.
export const LINES = [
  { id: "bye", text: "Bye bye, Dad", words: ["BYE", "BYE", "DAD"] },
  { id: "wolf", text: "Bye, bad wolf", words: ["BYE", "BAD", "WOLF"] },
  { id: "fall", text: "Dad will fall", words: ["DAD", "WILL", "FALL"] },
];

export const WORD_SIGNS = {
  BYE: { label: "bye", hand: "B", how: "Open hand up, wave it." },
  DAD: { label: "dad", hand: "B", how: "Open hand, fingers spread, tap your thumb on your forehead." },
  BAD: { label: "bad", hand: "B", how: "Fingertips at your chin, then flip your hand down and away." },
  WOLF: { label: "wolf", hand: "O", how: "Open hand at your nose, pull it forward into a point, like a snout." },
  WILL: { label: "will", hand: "B", how: "Flat hand by your cheek, move it forward." },
  FALL: { label: "fall", hand: "V", how: "Stand your V fingers on your other palm, then flip them off." },
};

export function randomLine() {
  return LINES[Math.floor(Math.random() * LINES.length)];
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
    signing: false,
    points: 0,
    feedback: null,
    name: "",
    saved: false,
    streak: 1,
  };
}

export function targetLetter(state) {
  if (state.phase !== "play" || state.signing) return "";
  return state.line.words[state.wordIndex][state.letterIndex];
}

export function targetWord(state) {
  if (state.phase !== "play" || !state.signing) return "";
  return state.line.words[state.wordIndex];
}

export function popped(state) {
  return (state.cleared || 0) >= 3;
}

// Share of the sentence's letters signed so far.
export function meter(state) {
  const total = state.line.words.reduce((n, word) => n + word.length, 0);
  return Math.min(1, (state.cleared || 0) / total);
}

export function accept(state) {
  if (state.phase !== "play" || state.feedback?.kind === "success") return state;
  const points = state.signing ? 400 : 200;
  return {
    ...state,
    cleared: state.signing ? state.cleared : state.cleared + 1,
    points: state.points + points,
    feedback: { kind: "success", points },
  };
}

export function advance(state) {
  if (state.phase !== "play" || state.feedback?.kind !== "success") return state;
  const word = state.line.words[state.wordIndex];
  if (!state.signing) {
    const letterIndex = state.letterIndex + 1;
    // Spelled the whole word: now sign it.
    return { ...state, letterIndex, signing: letterIndex >= word.length, feedback: null };
  }
  const wordIndex = state.wordIndex + 1;
  if (wordIndex >= state.line.words.length) {
    return { ...state, wordIndex, letterIndex: 0, signing: false, phase: "summary", feedback: null };
  }
  return { ...state, wordIndex, letterIndex: 0, signing: false, feedback: null };
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
