// Six short lines that are hard to fail. Every letter is one the letter model gets 94%+ right on
// signers it never saw (no A, C, D, U, V), and every word is one PopSign's word model knows.
// label: the word's name in that model. hand: the picture shown while signing it.
export const LINES = [
  { id: "hello", text: "Hello, Mom, bye!", words: ["HELLO", "MOM", "BYE"] },
  { id: "sleep", text: "Sleep now, Mom", words: ["SLEEP", "NOW", "MOM"] },
  { id: "snow", text: "Mom, look, snow!", words: ["MOM", "LOOK", "SNOW"] },
  { id: "fine", text: "Yes! Fine! Bye!", words: ["YES", "FINE", "BYE"] },
  { id: "milk", text: "Hot milk now", words: ["HOT", "MILK", "NOW"] },
  { id: "pig", text: "Hello, wet pig!", words: ["HELLO", "WET", "PIG"] },
];

export const WORD_SIGNS = {
  HELLO: { label: "hello", hand: "B", how: "Flat hand at your forehead, salute out." },
  MOM: { label: "mom", hand: "B", how: "Open hand, fingers spread, tap your thumb on your chin." },
  BYE: { label: "bye", hand: "B", how: "Open hand up, wave it." },
  SLEEP: { label: "sleep", hand: "B", how: "Open hand in front of your face, pull it down as your fingers close." },
  NOW: { label: "now", hand: "Y", how: "Bent hands, palms up, drop them a little in front of you." },
  LOOK: { label: "look", hand: "V", how: "V fingers at your eyes, then point them forward." },
  SNOW: { label: "snow", hand: "B", how: "Open hands up high, wiggle your fingers as they float down." },
  YES: { label: "yes", hand: "S", how: "Make a fist and nod it up and down, like a head." },
  FINE: { label: "fine", hand: "B", how: "Open hand, fingers spread, tap your thumb on your chest." },
  HOT: { label: "hot", hand: "C", how: "Clawed hand at your mouth, twist it away fast." },
  MILK: { label: "milk", hand: "S", how: "Squeeze your fist open and closed, like milking." },
  WET: { label: "wet", hand: "B", how: "Hands by your chin, drop them while rubbing fingers on thumbs." },
  PIG: { label: "pig", hand: "B", how: "Flat hand under your chin, flap your fingers down." },
};

// One line per round, never the same one twice in a row.
export function randomLine(lastId = "") {
  const pool = LINES.filter((line) => line.id !== lastId);
  return pool[Math.floor(Math.random() * pool.length)];
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
    signed: 0,
    signing: false,
    points: 0,
    letterPoints: 0,
    wordPoints: 0,
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

// Points for one sign. accuracy 0..1 from the matcher: a clean letter 100-250, a clean word 200-400.
export function pointsFor(signing, accuracy) {
  const a = Math.max(0, Math.min(1, Number.isFinite(accuracy) ? accuracy : 0.5));
  const [lo, hi] = signing ? [200, 400] : [100, 250];
  return Math.round((lo + (hi - lo) * a) / 10) * 10;
}

export function accept(state, accuracy = 0.5) {
  if (state.phase !== "play" || state.feedback?.kind === "success") return state;
  const points = pointsFor(state.signing, accuracy);
  return {
    ...state,
    cleared: state.signing ? state.cleared : state.cleared + 1,
    signed: state.signing ? state.signed + 1 : state.signed,
    points: state.points + points,
    letterPoints: state.letterPoints + (state.signing ? 0 : points),
    wordPoints: state.wordPoints + (state.signing ? points : 0),
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
    return { ...state, wordIndex, letterIndex: 0, signing: false, phase: "summary", finished: true, feedback: null };
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

// Skip the current letter or word: move on, no points, and it doesn't count toward the summary.
export function skip(state) {
  if (state.phase !== "play" || state.feedback?.kind === "success") return state;
  return advance({ ...state, skipped: (state.skipped || 0) + 1, feedback: { kind: "success", points: 0 } });
}

export function nextWord(state) {
  if (state.phase !== "play") return "";
  return state.line.words[state.wordIndex + 1] || "";
}

// "Publish your score" mid-round: stop here and score what's done.
export function finishEarly(state) {
  if (state.phase !== "play" || state.points <= 0) return state;
  return { ...state, phase: "summary", finished: false, signing: false, feedback: null };
}

// What was actually signed, at the multipliers on the design: letters 2x (after 3), words 3x, sentence 5x.
export function breakdown(state) {
  const letters = state.cleared || 0;
  const words = state.signed || 0;
  // The sentence bonus is for signing all of it: any skip forfeits it.
  const sentence = state.finished && !state.skipped ? 1 : 0;
  const letterMult = letters >= 3 ? 2 : 1;
  const wordMult = 3;
  const sentenceMult = 5;
  const letterPoints = (state.letterPoints || 0) * letterMult;
  const wordPoints = (state.wordPoints || 0) * wordMult;
  const sentencePoints = sentence * 400 * sentenceMult;
  return {
    letters,
    words,
    sentence,
    letterMult,
    wordMult,
    sentenceMult,
    letterPoints,
    wordPoints,
    sentencePoints,
    total: letterPoints + wordPoints + sentencePoints,
  };
}

// Names as people write them ("Elaina G."): letters, spaces, . ' - ; 2 to 14 characters.
export function cleanName(text) {
  return String(text || "").replace(/[^A-Za-z .'-]/g, "").replace(/\s+/g, " ").trimStart().slice(0, 14);
}

export function validName(text) {
  return /^[A-Za-z][A-Za-z .'-]{1,13}$/.test(String(text || "").trim());
}

export function setName(state, text) {
  if (state.phase !== "summary" || state.saved) return state;
  return { ...state, name: cleanName(text) };
}

export function markSaved(state) {
  if (state.phase !== "summary" || state.saved || !validName(state.name)) return state;
  return { ...state, name: state.name.trim(), saved: true };
}
