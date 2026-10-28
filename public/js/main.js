import { paintBlur } from "./draw.js";
import { OUTLINES } from "./outlines.js";
import { handReady, pushFrame, startHand } from "./hand.js";
import { ALMOST_SCORE, HOW, SUCCESS_SCORE, judgeFrames, pointingUp } from "./signs.js";
import { WORD_LABELS, unpack, wordProbs } from "./words.js";
import {
  accept,
  advance,
  almost,
  attract,
  begin,
  breakdown,
  clearAlmost,
  finishEarly,
  lineById,
  markSaved,
  meter,
  nextWord,
  popped,
  randomLine,
  setName,
  skip,
  targetLetter,
  targetWord,
  validName,
  WORD_SIGNS,
} from "./session.js";
import { browserStore, load, pullScores, pushScore, record, todayKey, top } from "./storage.js";

// A letter must stay right this long before it counts, so a hand passing through a shape doesn't score.
const HOLD_MS = 350;
// Long enough for the success beat: +points pops, flies to the score, banner slides through.
const FLASH_MS = 1600;
const ATTRACT_HOLD_MS = 320;
// Word step: PopSign's model reads the last 2 s of one hand, resampled to its 60 frames.
const WORD_WINDOW_MS = 2000;
const WORD_EVERY_MS = 250;
// Hard to fail: the word only has to show up in the model's top 5 at 5%+, once.
const WORD_TOP = 5;
const WORD_MIN_P = 0.05;
// ponytail: the word model hasn't been checked on real signers yet, so ~4 s of a visibly moving hand
// also passes. Drop this once ?debug=1 shows the model reliably finds the words.
const WORD_FALLBACK_MS = 4000;
const WORD_FALLBACK_TRAVEL = 0.25;
// Kiosk: an untouched summary goes back to the start screen.
const IDLE_MS = 45000;
const GRAB_MS = 80;
// Frames the matcher votes over: about half a second at the grab rate.
const VOTE_FRAMES = 5;
const BLUR_MS = 120;

const stage = document.querySelector("#stage");
const wash = document.querySelector("#wash");
const video = document.querySelector("#cam");
const ghost = document.querySelector("#ghost");
const hud = document.querySelector("#hud");
const panel = document.querySelector("#panel");
const pop = document.querySelector("#pop");
const live = document.querySelector("#live");
const frame = document.querySelector("#frame");
const fx = document.querySelector("#fx");

const params = new URLSearchParams(location.search);
let benchOn = params.get("bench") === "1";
const debugOn = params.get("debug") === "1";
const store = browserStore();
const fixedLine = lineById(params.get("line"));

let data = load(store);
let state = attract();
let camOn = false;
let camFailed = false;
let armed = false;
let nextLm = null;
let holdStart = 0;
let lockUntil = 0;
let flashTimer = 0;
let sawHandAt = 0;
let lastPaint = "";
let celebrated = null;
let rendered = false;
let ghostKey = "";
let status = "Tap Match up!";
let draftName = "";
let nameError = "";
let lastLineId = "";
let wordShown = -1;
// The how-to hint shows only once this step has had a failed try.
let hintFor = "";
let trail = [];
let wordSince = 0;
let lastWordAt = 0;
let wordModel = null;
fetch("./models/popsign-250.bin")
  .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
  .then((buf) => {
    wordModel = unpack(buf);
  })
  .catch((error) => console.error("Word model didn't load:", error));
let lastInput = performance.now();

const frameTimes = [];
const drawTimes = [];
let lastStamp = performance.now();

function say(text) {
  if (live.textContent !== text) live.textContent = text;
}

function dispatch(next) {
  if (next === state) return;
  state = next;
  render();
}

function paintKey() {
  const board = top(data, 3).map((row) => row.name + row.points).join(",");
  // Only what the start screen shows: a tracker status it doesn't display shouldn't rebuild it.
  if (state.phase === "attract") return `attract:${board}:${armed}:${camFailed}:${trouble() ? status : ""}`;
  if (state.phase === "play") {
    const fb = state.feedback;
    return `play:${step()}:${hintFor === step()}:${state.points}:${fb?.kind || ""}:${fb?.text || ""}:${camFailed}:${status}`;
  }
  return `summary:${state.line.id}:${state.saved}:${nameError}:${board}`;
}

function render() {
  const key = paintKey();
  if (key === lastPaint) return;
  lastPaint = key;
  // Entrance animations play once per screen; later rebuilds of the same screen (the board arriving,
  // the camera arming) swap in quietly instead of replaying the whole intro.
  stage.classList.toggle("fresh", stage.dataset.phase !== state.phase || !rendered);
  rendered = true;
  stage.dataset.phase = state.phase;
  stage.classList.toggle("pop", state.phase === "play" && popped(state));
  stage.classList.toggle("win", state.phase === "play" && state.feedback?.kind === "success");
  stage.classList.toggle("nocam", camFailed);
  hud.replaceChildren();
  panel.replaceChildren();
  pop.hidden = true;
  if (state.phase === "attract") drawAttract();
  else if (state.phase === "play") drawPlay();
  else drawSummary();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The hand picture plus a dashed outline traced from it. The dashes march (stroke-dashoffset loop);
// a new picture scales in from nothing.
function setGhost(letter, mode) {
  const key = `${letter}:${mode}`;
  if (key === ghostKey) return;
  const fresh = !ghostKey.startsWith(`${letter}:`);
  ghostKey = key;
  const name = /^[a-z]$/i.test(letter || "") ? letter.toLowerCase() : "a";
  // On success the hand turns into a glowing green outline (edges of the picture only), as in the design.
  ghost.innerHTML = `<svg class="sign ${mode}${fresh ? " enter" : ""}" viewBox="-14 -14 128 128" aria-hidden="true">
    <defs><filter id="edge" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="fat" />
      <feComposite in="fat" in2="SourceAlpha" operator="out" result="ring" />
      <feFlood flood-color="#7cff14" />
      <feComposite in2="ring" operator="in" result="line" />
      <feGaussianBlur in="line" stdDeviation="1.6" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="line" /><feMergeNode in="line" /></feMerge>
    </filter></defs>
    <image class="pic" href="./assets/hands/${name}.png" x="0" y="0" width="100" height="100" />
    <path class="dash" d="${OUTLINES[name]}" />
  </svg>`;
}

// Home: striped, staggered pills. Summary: outlined colored text. Empty board: an invitation.
function board(style) {
  const list = el("ol", `board ${style}`);
  const rows = top(data, 3);
  if (!rows.length) {
    const item = el("li", "empty");
    item.append(el("span", "", "Be the first on the board!"));
    list.append(item);
  }
  const row = (entry, rank, index) => {
    const item = el("li");
    item.style.setProperty("--i", index);
    if (state.saved && entry.name === state.name) item.classList.add("you");
    item.append(el("b", "rank", `#${rank}`), el("span", "who", entry.name));
    list.append(item);
  };
  rows.forEach((entry, index) => row(entry, index + 1, index));
  // Just saved but outside the top 3: still show where you landed.
  if (style === "list" && state.saved && !rows.some((entry) => entry.name === state.name)) {
    const all = top(data, 1000);
    const at = all.findIndex((entry) => entry.name === state.name);
    if (at >= 0) row(all[at], at + 1, 3);
  }
  return list;
}

// Frame 34's variants. The home ribbon cycles them; elsewhere it's just the first.
const RIBBONS = [
  ["Match up!", "orange"],
  ["Learn ASL!", "violet"],
  ["Hand-writing!", "yellow"],
];

function ribbon(act, cycle = false) {
  const button = el("button", cycle ? "match cycle" : "match");
  button.type = "button";
  button.dataset.act = act;
  button.setAttribute("aria-label", "Match up!");
  (cycle ? RIBBONS : RIBBONS.slice(0, 1)).forEach(([label, tone], n) => {
    const face = el("span", `face ${tone}`);
    face.style.setProperty("--n", n);
    face.setAttribute("aria-hidden", "true");
    const body = el("span", "body");
    body.append(el("i", "gem top"), el("span", "label", label), el("i", "gem bottom"));
    face.append(body);
    button.append(face);
  });
  return button;
}

function trouble() {
  if (!status || !/fail|error|didn't|off|denied|not load/i.test(status)) return null;
  return el("p", "hint", status);
}

function drawAttract() {
  setGhost("D", "guide");
  hud.append(el("h1", "logo", "SPELLBOUND"), board("home"));
  panel.append(ribbon(armed ? "start" : "match", true));
  const warn = trouble();
  if (warn) panel.append(warn);
  say(status);
}

// The current word's letters as platforms. A new word's platforms drop in one by one, 400 ms apart.
function platforms() {
  const word = state.line.words[state.wordIndex] || "";
  const row = el("div", "platforms");
  const fresh = wordShown !== state.wordIndex;
  wordShown = state.wordIndex;
  for (let i = 0; i < word.length; i++) {
    const done = i < state.letterIndex || state.signing;
    const slot = el("span", `slot ${done ? "in" : i === state.letterIndex ? "now" : "wait"}${fresh ? " fresh" : ""}`);
    slot.style.setProperty("--i", i);
    // Hangman: a letter shows only once it's signed. Follow the hand to find it.
    slot.append(el("b", "", done ? word[i] : ""), el("i"));
    row.append(slot);
  }
  return row;
}

function meterRow() {
  const wrap = el("div", "meterwrap");
  const bar = el("div", "meter");
  const fill = el("span");
  fill.style.width = `${Math.max(6, Math.round(meter(state) * 100))}%`;
  bar.append(fill);
  wrap.append(bar, el("b", popped(state) ? "mult on" : "mult", "+ 2x multiplier"));
  return wrap;
}

function step() {
  return `${state.wordIndex}:${state.letterIndex}:${state.signing}`;
}

function failedTry() {
  if (hintFor === step()) return;
  hintFor = step();
  render();
}

function coach(text) {
  if (hintFor !== step()) return "";
  const node = el("p", "coach");
  const hit = text.match(/\b(index|thumb|middle|ring|pinky|pointer)\b/i);
  if (!hit) {
    node.textContent = text;
    return node;
  }
  const at = hit.index;
  node.append(text.slice(0, at), el("em", "", hit[0]), text.slice(at + hit[0].length));
  return node;
}

function footer() {
  const row = el("div", "foot");
  if (state.points > 0) {
    const pub = el("button", "pubnow");
    pub.type = "button";
    pub.dataset.act = "finish";
    pub.append("Publish your score ", el("span", "", `(${money(state.points)})`));
    row.append(pub);
  } else row.append(el("span"));
  // Design: the next word shows only while you're on the current word's last letter.
  const word = state.line.words[state.wordIndex] || "";
  const next = !state.signing && state.letterIndex === word.length - 1 ? nextWord(state) : "";
  if (next) {
    const tag = el("p", "nextword");
    tag.append("Next: ", el("b", "", `'${next.toLowerCase()}'`));
    row.append(tag);
  }
  return row;
}

function drawPlay() {
  const word = targetWord(state);
  const letter = word ? WORD_SIGNS[word].hand : targetLetter(state);
  const kind = state.feedback?.kind;
  setGhost(letter, kind === "success" ? "ok" : kind === "almost" ? "almost" : "guide");
  const shown = kind === "success" ? state.points - state.feedback.points : state.points;
  hud.append(el("h1", "score", `Score: ${money(shown)}`));
  if (kind === "success") {
    if (celebrated !== state.feedback) {
      celebrated = state.feedback;
      celebrate(state.feedback.points, word || letter);
    }
    panel.append(successBanner());
    say(`Success! +${state.feedback.points}`);
    return;
  }
  if (word) {
    hud.append(el("p", "wordcall", "Now sign out the word!"));
    panel.append(coach(WORD_SIGNS[word].how), el("p", "wordbig", word), meterRow(), footer());
    if (camFailed || !handReady()) panel.append(holdButton());
    say(`Now sign the word ${word}. ${WORD_SIGNS[word].how}`);
    return;
  }
  // The how-to stays up the whole time: the blanks hide the letter, this says how to make it.
  panel.append(coach(HOW[letter]), platforms(), meterRow(), footer());
  if (camFailed || !handReady()) panel.append(holdButton());
  const warn = trouble();
  if (warn) panel.append(warn);
  say(kind === "almost" ? state.feedback.text : `Sign ${letter}`);
}

function successBanner() {
  const banner = el("div", "banner");
  banner.append(el("p", "", "Success!"));
  const bar = el("div", "bannerbar");
  bar.append(el("span"));
  banner.append(bar);
  return banner;
}

const SWOOSH = `<svg class="swoosh" viewBox="0 0 400 520" aria-hidden="true">
  <path d="M70 160 C 90 90, 150 60, 205 70" /><circle cx="78" cy="150" r="16" /><circle cx="128" cy="96" r="5" class="dot" />
  <path d="M60 330 C 70 220, 130 150, 200 145" /><path d="M300 95 C 340 110, 360 140, 365 175" /><path d="M352 160 l 14 16 l 10 -20" />
  <path d="M290 200 C 330 220, 345 260, 335 300" /><circle cx="340" cy="250" r="4" class="dot" />
  <path d="M40 450 C 30 380, 55 330, 100 320" /><path d="M70 330 l -6 24 l 22 -8" /><circle cx="95" cy="300" r="12" />
  <path d="M110 420 C 110 390, 120 370, 135 355" /><circle cx="150" cy="470" r="4" class="dot" />
  <path d="M300 340 C 345 380, 360 430, 350 480" /><circle cx="322" cy="372" r="16" /><path d="M335 470 l 0 22" /><path d="M324 481 l 22 0" />
</svg>`;

// Success beat: green swooshes draw in, confetti bursts from the hand, +points pops by the hand
// then flies to the score, and the score ticks up when it lands.
function celebrate(points, sign) {
  fx.innerHTML = SWOOSH;
  const big = el("p", sign.length > 1 ? "bigsign word" : "bigsign", sign);
  fx.append(big);
  pop.textContent = `+${points}`;
  pop.hidden = false;
  pop.classList.remove("fly");
  void pop.offsetWidth;
  const score = hud.querySelector(".score");
  window.setTimeout(() => {
    if (!score?.isConnected) return;
    // Aim the middle of +points at the number end of "Score: N".
    const from = pop.getBoundingClientRect();
    const to = score.getBoundingClientRect();
    pop.style.setProperty("--fx", `${to.right - 50 - (from.left + from.width / 2)}px`);
    pop.style.setProperty("--fy", `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    pop.classList.add("fly");
  }, 520);
  window.setTimeout(() => {
    if (!score?.isConnected) return;
    score.textContent = `Score: ${money(state.points)}`;
    score.classList.add("bump");
  }, 900);
  const mine = fx.firstChild;
  window.setTimeout(() => {
    if (fx.firstChild === mine) fx.innerHTML = "";
  }, FLASH_MS);
}

function holdButton() {
  const hold = el("button", "hold", "Hold to sign");
  hold.dataset.act = "hold";
  hold.type = "button";
  return hold;
}

function money(n) {
  return n.toLocaleString("en-US");
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Summary, as in the design: ribbon, a points badge, the quote with who said it, then publish.
function drawSummary() {
  const score = breakdown(state);
  setGhost("A", "guide");
  const title = el("h1", "sumribbon");
  title.append(el("span", "", "SpellBound Summary"));
  const badge = el("div", "sumbadge");
  badge.append(el("p", "pts", `${money(score.total)} points`));
  const parts = el("p", "parts");
  parts.append(plural(score.letters, "letter"), el("b", "", "+"), plural(score.words, "word"), el("b", "", "+"), plural(score.sentence, "sentence"));
  badge.append(parts);
  const quote = el("p", "sumquote", `“${state.line.text}”`);
  const by = el("p", "sumby", `- ${state.line.by}`);
  panel.append(title, badge, quote, by);
  if (!state.saved) {
    const form = el("form", "nameform");
    const input = el("input", "name");
    input.name = "name";
    input.placeholder = "Your name";
    input.autocomplete = "off";
    input.maxLength = 14;
    input.value = draftName;
    input.setAttribute("aria-label", "Your name for the leaderboard");
    const go = el("button", "publish", "Publish Score");
    go.type = "submit";
    form.append(input, go);
    panel.append(form);
    if (nameError) panel.append(el("p", "hint", nameError));
    window.setTimeout(() => input.focus({ preventScroll: true }), 50);
  } else {
    panel.append(board("list"), ribbon("again"));
  }
  say(`Summary. ${money(score.total)} points. ${state.line.text} ${state.line.by}.`);
}

function setMode(mode) {
  if (frame.dataset.mode !== mode) frame.dataset.mode = mode;
}

let recent = [];

function onLandmarks(points, raw) {
  const t = performance.now();
  if (raw) trail = trail.filter((f) => t - f.t <= WORD_WINDOW_MS + 500).concat({ t, raw });
  nextLm = points;
  // A lost hand clears the vote so an old pose can't carry over.
  recent = points ? recent.concat([points]).slice(-VOTE_FRAMES) : [];
}

function onStatus(text) {
  if (status === text) return;
  status = text;
  render();
}

async function enableCamera() {
  if (camOn) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    video.srcObject = stream;
    await video.play();
    camOn = true;
    camFailed = false;
    stage.classList.add("live");
    return true;
  } catch {
    camFailed = true;
    status = "Camera is off. You can still play.";
    return false;
  }
}

function beginPlay() {
  if (state.phase === "play") return;
  holdStart = 0;
  sawHandAt = 0;
  nextLm = null;
  draftName = "";
  nameError = "";
  hintFor = "";
  const line = fixedLine || randomLine(lastLineId);
  lastLineId = line.id;
  wordShown = -1;
  dispatch(begin(line));
  startHand(onStatus, onLandmarks);
  navigator.wakeLock?.request("screen").catch(() => {});
}

async function onMatch() {
  const ok = await enableCamera();
  startHand(onStatus, onLandmarks);
  if (!ok) {
    beginPlay();
    return;
  }
  armed = true;
  status = "Hold up your pointer finger to start.";
  render();
}

function finishFlash() {
  pop.hidden = true;
  pop.classList.remove("fly");
  dispatch(advance(state));
  lockUntil = performance.now() + 220;
  holdStart = 0;
  recent = [];
  trail = [];
  wordSince = 0;
  if (state.phase === "summary") {
    draftName = "";
    // The idle clock starts when the summary does: a hands-only round never touched the keyboard,
    // so without this the summary looked 45 s idle the moment it appeared and jumped to the start screen.
    lastInput = performance.now();
  }
}

function backToStart() {
  status = camOn ? "Hold up your pointer finger to start." : "Tap Match up!";
  dispatch(attract());
}

let saving = false;

async function saveScore() {
  if (saving || state.phase !== "summary" || state.saved) return;
  if (!validName(draftName)) {
    nameError = "Type a name: 2 to 14 letters, like Elaina G.";
    lastPaint = "";
    render();
    return;
  }
  saving = true;
  const at = state;
  const next = markSaved(setName(state, draftName));
  const today = todayKey(new Date());
  const saved = record(store, data, next.name, breakdown(next).total, today);
  data = saved.data;
  nameError = "";
  // Show it saved right away; the shared board fills in when the server answers.
  dispatch({ ...next, streak: saved.streak });
  document.querySelector("[data-act=again]")?.focus();
  const remote = await pushScore(next.name, breakdown(next).total, today);
  saving = false;
  if (remote) data = { ...data, scores: remote };
  // A slow save must not repaint over a round someone else already started.
  if (state.phase === "summary" && state.line === at.line) render();
}

stage.addEventListener("click", (event) => {
  lastInput = performance.now();
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const act = button.dataset.act;
  if (act === "match") onMatch();
  if (act === "start") beginPlay();
  if (act === "finish") dispatch(finishEarly(state));
  if (act === "again") backToStart();
});

stage.addEventListener("submit", (event) => {
  event.preventDefault();
  saveScore();
});

// The name box is typed into directly; no re-render per key, so the caret never jumps.
stage.addEventListener("input", (event) => {
  if (event.target.name !== "name") return;
  const clean = setName({ phase: "summary", saved: false }, event.target.value).name;
  if (clean !== event.target.value) event.target.value = clean;
  draftName = clean;
});

stage.addEventListener("click", (event) => {
  if (!event.target.closest("[data-act=hold]") || state.phase !== "play") return;
  if (state.feedback?.kind === "success") return;
  dispatch(accept(state, 0.3 + Math.random() * 0.5));
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(finishFlash, FLASH_MS);
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  lastInput = performance.now();
  if (state.phase === "play" && event.key === " " && state.feedback?.kind !== "success") {
    event.preventDefault();
    dispatch(skip(state));
    holdStart = 0;
    recent = [];
    trail = [];
    wordSince = 0;
    lockUntil = performance.now() + 220;
    return;
  }
  const typed = event.key.toUpperCase() === targetLetter(state) || (event.key === "Enter" && targetWord(state));
  if (state.phase === "play" && typed && state.feedback?.kind !== "success") {
    dispatch(accept(state, 0.3 + Math.random() * 0.5));
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(finishFlash, FLASH_MS);
    return;
  }
});

// The last WORD_WINDOW_MS of hand points, linearly resampled to the 60 even frames the model expects.
function wordInput(now, mirror) {
  const frames = trail.filter((f) => now - f.t <= WORD_WINDOW_MS);
  if (frames.length < 8) return null;
  const out = new Float32Array(60 * 42);
  const start = now - WORD_WINDOW_MS;
  let j = 0;
  for (let i = 0; i < 60; i++) {
    const at = start + (i / 59) * WORD_WINDOW_MS;
    while (j < frames.length - 2 && frames[j + 1].t < at) j++;
    const a = frames[j];
    const b = frames[Math.min(j + 1, frames.length - 1)];
    const k = b.t > a.t ? Math.max(0, Math.min(1, (at - a.t) / (b.t - a.t))) : 0;
    for (let p = 0; p < 42; p++) {
      const v = a.raw[p] + (b.raw[p] - a.raw[p]) * k;
      out[i * 42 + p] = mirror && p % 2 === 0 ? 1 - v : v;
    }
  }
  return out;
}

// ponytail: the model runs on the main thread, ~15 ms per read; move it into the hand worker if the camera stutters.
// accuracy 0..1 decides the points (see pointsFor).
function passWord(accuracy) {
  dispatch(accept(state, accuracy));
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(finishFlash, FLASH_MS);
}

// How far the wrist moved over the last WORD_WINDOW_MS, in frame widths.
function wristTravel(now) {
  const frames = trail.filter((f) => now - f.t <= WORD_WINDOW_MS);
  let sum = 0;
  for (let i = 1; i < frames.length; i++) sum += Math.hypot(frames[i].raw[0] - frames[i - 1].raw[0], frames[i].raw[1] - frames[i - 1].raw[1]);
  return sum;
}

function wordTick(now) {
  if (!wordSince) wordSince = now;
  if (!nextLm) {
    setMode("idle");
    return;
  }
  if (now - lastWordAt < WORD_EVERY_MS) return;
  lastWordAt = now;
  const moving = wristTravel(now) >= WORD_FALLBACK_TRAVEL;
  if (moving && now - wordSince >= WORD_FALLBACK_MS) {
    if (debugOn) console.debug("word: passed on movement fallback");
    passWord(0.15 + Math.random() * 0.35);
    return;
  }
  if (!wordModel) {
    setMode(moving ? "almost" : "hot");
    return;
  }
  const at = WORD_LABELS.indexOf(WORD_SIGNS[targetWord(state)].label);
  let best = 0;
  let inTop = false;
  // Signers lead with either hand, and the training camera's mirroring is unknown: read both ways.
  for (const mirror of [false, true]) {
    const input = wordInput(now, mirror);
    if (!input) return;
    const probs = wordProbs(wordModel, input);
    const p = probs[at];
    const rank = probs.filter((v) => v > p).length;
    best = Math.max(best, p);
    if (rank < WORD_TOP && p >= WORD_MIN_P) inTop = true;
    if (debugOn) {
      const top3 = [...probs.keys()].sort((x, y) => probs[y] - probs[x]).slice(0, 3);
      console.debug(`word ${mirror ? "mirrored" : "as-is"}: want ${WORD_LABELS[at]} #${rank + 1} ${(p * 100).toFixed(1)}% | top: ${top3.map((i) => `${WORD_LABELS[i]} ${(probs[i] * 100).toFixed(0)}%`).join(", ")}`);
    }
  }
  setMode(inTop ? "ok" : best >= 0.02 || moving ? "almost" : "hot");
  if (!inTop && moving) failedTry();
  // 5% -> fewest points, 60%+ -> most.
  if (inTop) passWord((best - WORD_MIN_P) / (0.6 - WORD_MIN_P));
}

function tick(now) {
  if (state.phase === "summary" && now - lastInput > IDLE_MS) backToStart();
  if (state.phase === "play" && targetWord(state) && now >= lockUntil && state.feedback?.kind !== "success") {
    wordTick(now);
    return;
  }
  if (state.phase === "attract") {
    const pointing = nextLm && camOn && (pointingUp(nextLm) || judgeFrames(recent, "D").score >= SUCCESS_SCORE);
    if (pointing) {
      if (!sawHandAt) sawHandAt = now;
      if (now - sawHandAt >= ATTRACT_HOLD_MS) beginPlay();
    } else {
      sawHandAt = 0;
    }
    // Light the frame for any hand, so people can see the camera has them before the finger lands.
    setMode(pointing ? "ok" : nextLm ? "hot" : "idle");
    return;
  }
  if (state.phase !== "play" || now < lockUntil || state.feedback?.kind === "success") return;
  if (!nextLm) {
    holdStart = 0;
    setMode("idle");
    dispatch(clearAlmost(state));
    return;
  }
  const result = judgeFrames(recent, targetLetter(state));
  if (result.score >= SUCCESS_SCORE && recent.length >= 3) {
    if (!holdStart) holdStart = now;
    setMode("ok");
    if (now - holdStart >= HOLD_MS) {
      holdStart = 0;
      // The vote's own confidence, from the pass bar (fewest points) to certain (most).
      dispatch(accept(state, (result.score - SUCCESS_SCORE) / (1 - SUCCESS_SCORE)));
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(finishFlash, FLASH_MS);
    }
    return;
  }
  if (holdStart && result.score >= ALMOST_SCORE && now - holdStart < HOLD_MS + 160) return;
  holdStart = 0;
  if (result.score >= ALMOST_SCORE) {
    setMode("almost");
    hintFor = step();
    dispatch(almost(state, result.correction));
  } else {
    setMode("idle");
    dispatch(clearAlmost(state));
  }
}

let lastBlur = 0;
let lastGrab = 0;

function loop(now) {
  if (benchOn) frameTimes.push(now - lastStamp);
  lastStamp = now;
  const started = benchOn ? performance.now() : 0;
  tick(now);
  if (camOn && (state.phase === "attract" || state.phase === "summary") && now - lastBlur >= BLUR_MS && video.readyState >= 2) {
    lastBlur = now;
    paintBlur(video, wash);
  }
  if (camOn && state.phase !== "summary" && now - lastGrab >= GRAB_MS) {
    lastGrab = now;
    pushFrame(video);
  }
  if (benchOn) {
    drawTimes.push(performance.now() - started);
    if (frameTimes.length >= 180) {
      benchOn = false;
      reportBench();
    }
  }
  requestAnimationFrame(loop);
}

function median(values) {
  const copy = values.slice().sort((a, b) => a - b);
  return copy[Math.floor(copy.length / 2)];
}

function reportBench() {
  const gaps = frameTimes.slice(20);
  const draws = drawTimes.slice(20);
  const payload = {
    frames: gaps.length,
    gapP50: Number(median(gaps).toFixed(2)),
    gapMax: Number(Math.max(...gaps).toFixed(2)),
    drawP50: Number(median(draws).toFixed(2)),
    drawMax: Number(Math.max(...draws).toFixed(2)),
  };
  document.title = `gap ${payload.gapP50} draw ${payload.drawP50}`;
  console.log(JSON.stringify(payload));
  const node = document.createElement("pre");
  node.id = "bench";
  node.textContent = JSON.stringify(payload);
  document.body.append(node);
}

render();
requestAnimationFrame(loop);
// Kiosk: turn the camera on right away so a raised finger starts the game with no tap.
enableCamera().then((ok) => {
  if (ok) return onMatch();
  // No camera yet (permission not granted): leave the tap path for a person to retry.
  camFailed = false;
  status = "Tap Match up!";
  render();
});
pullScores().then((scores) => {
  if (!scores) return;
  data = { ...data, scores };
  render();
});
