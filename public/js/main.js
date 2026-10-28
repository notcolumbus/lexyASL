import { handIcon, paintBlur } from "./draw.js";
import { pushFrame, startHand } from "./hand.js";
import { ALMOST_SCORE, HOW, SUCCESS_SCORE, judgeFrames, pointingUp } from "./signs.js";
import {
  accept,
  advance,
  almost,
  attract,
  begin,
  breakdown,
  clearAlmost,
  lineById,
  markSaved,
  meter,
  popped,
  randomLine,
  targetLetter,
  targetWord,
  typeName,
  WORD_SIGNS,
} from "./session.js";
import { browserStore, load, pullScores, pushScore, record, todayKey, top } from "./storage.js";

// A letter must stay right this long before it counts, so a hand passing through a shape doesn't score.
const HOLD_MS = 350;
const FLASH_MS = 400;
const ATTRACT_HOLD_MS = 320;
// Word step: the sign's handshape held this long, plus this much wrist travel (in frame widths).
const WORD_SHAPE_MS = 250;
const WORD_TRAVEL = 0.08;
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

const params = new URLSearchParams(location.search);
let benchOn = params.get("bench") === "1";
const store = browserStore();
const today = todayKey(new Date());
const fixedLine = lineById(params.get("line"));

let data = load(store);
let state = attract();
let camOn = false;
let camFailed = false;
let armed = false;
let stream = null;
let prevLm = null;
let nextLm = null;
let lmAt = 0;
let holdStart = 0;
let lockUntil = 0;
let flashTimer = 0;
let sawHandAt = 0;
let lastPaint = "";
let ghostKey = "";
let status = "Tap Match up!";
let naming = false;
let note = "";
let shapeMs = 0;
let travel = 0;
let lastWrist = null;
let lastTick = 0;
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
  if (state.phase === "attract") return `attract:${board}:${armed}:${camFailed}:${status}`;
  if (state.phase === "play") {
    const fb = state.feedback;
    return `play:${state.wordIndex}:${state.letterIndex}:${state.signing}:${state.points}:${fb?.kind || ""}:${fb?.text || ""}:${camFailed}:${status}`;
  }
  return `summary:${state.line.id}:${state.name}:${state.saved}:${naming}:${status}:${top(data, 3).map((row) => row.points).join()}`;
}

function render() {
  const key = paintKey();
  if (key === lastPaint) return;
  lastPaint = key;
  stage.dataset.phase = state.phase;
  stage.classList.toggle("naming", state.phase === "summary" && naming);
  stage.classList.toggle("pop", state.phase === "play" && popped(state));
  stage.classList.toggle("nocam", camFailed);
  hud.replaceChildren();
  panel.replaceChildren();
  const popping = state.phase === "play" && state.feedback?.kind === "success";
  pop.textContent = popping ? `+${state.feedback.points}` : "";
  pop.hidden = !popping;
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

function setGhost(letter, mode) {
  const key = `${letter}:${mode}`;
  if (key === ghostKey) return;
  ghostKey = key;
  ghost.innerHTML = handIcon(letter, mode);
}

function board() {
  const list = el("ol", "pills");
  top(data, 3).forEach((row, index) => {
    const item = el("li");
    item.append(el("b", "rank", `#${index + 1}`), el("span", "", row.name));
    list.append(item);
  });
  return list;
}

function ribbon(label, act) {
  const button = el("button", "match");
  button.type = "button";
  button.dataset.act = act;
  button.append(el("i", "gem"), document.createTextNode(label), el("i", "gem"));
  return button;
}

function trouble() {
  if (!status || !/fail|error|didn't|off|denied|not load/i.test(status)) return null;
  return el("p", "hint", status);
}

function drawAttract() {
  setGhost("D", "guide");
  hud.append(el("h1", "logo", "SPELLBOUND"), board());
  if (note) hud.append(el("p", "note", note));
  panel.append(ribbon("Match up!", armed ? "start" : "match"));
  const warn = trouble();
  if (warn) panel.append(warn);
  say(status);
}

function slots() {
  const row = el("div", "letters");
  state.line.words.forEach((word, wordIndex) => {
    const group = el("span", "word");
    for (let i = 0; i < word.length; i++) {
      const done = wordIndex < state.wordIndex || (wordIndex === state.wordIndex && i < state.letterIndex);
      const now = state.phase === "play" && wordIndex === state.wordIndex && i === state.letterIndex;
      // Hangman: a letter shows only once it's signed. Follow the hand to find it.
      group.append(el("b", done ? "in" : now ? "now" : "wait", done ? word[i] : ""));
    }
    row.append(group);
  });
  return row;
}

function meterRow() {
  const wrap = el("div", "meterwrap");
  const bar = el("div", "meter");
  const fill = el("span");
  fill.style.width = `${Math.max(8, Math.round(meter(state) * 100))}%`;
  bar.append(fill);
  wrap.append(bar, el("b", popped(state) ? "mult on" : "mult", "+ 2x multiplier"));
  return wrap;
}

function coach(text) {
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

function successBanner() {
  const banner = el("div", "banner");
  banner.append(el("p", "", "Success!"));
  const bar = el("div", "bannerbar");
  bar.append(el("span"));
  banner.append(bar);
  return banner;
}

function drawPlay() {
  const word = targetWord(state);
  const letter = word ? WORD_SIGNS[word].hand : targetLetter(state);
  const kind = state.feedback?.kind;
  setGhost(letter, kind === "success" ? "ok" : kind === "almost" ? "almost" : "guide");
  hud.append(el("h1", "score", `Score: ${state.points}`));
  if (word && kind !== "success") {
    hud.append(el("p", "wordcall", "Now sign out the word!"));
    panel.append(coach(WORD_SIGNS[word].how), el("p", "wordbig", word), meterRow());
    if (camFailed) panel.append(holdButton());
    say(`Now sign the word ${word}. ${WORD_SIGNS[word].how}`);
    return;
  }
  if (kind === "success") {
    panel.append(successBanner());
    say(`Success! +${state.feedback.points}`);
    return;
  }
  // The how-to stays up the whole time: the blanks hide the letter, this says how to make it.
  panel.append(coach(HOW[letter]), slots(), meterRow());
  if (camFailed) panel.append(holdButton());
  const warn = trouble();
  if (warn) panel.append(warn);
  say(kind === "almost" ? state.feedback.text : `Sign ${letter}`);
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

function sumLine(count, label, mult) {
  const row = el("p", "sumline");
  row.append(document.createTextNode(`${count} ${label}`), el("i", "mx", `${mult}x`));
  return row;
}

function nameKeys() {
  const keys = el("div", "keys");
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const key = el("button", "", ch);
    key.type = "button";
    key.dataset.act = "key";
    key.dataset.key = ch;
    keys.append(key);
  }
  const back = el("button", "wide", "Delete");
  back.type = "button";
  back.dataset.act = "key";
  back.dataset.key = "back";
  const save = el("button", "wide", "Save");
  save.type = "button";
  save.dataset.act = "save";
  keys.append(back, save);
  return keys;
}

function drawSummary() {
  const score = breakdown(state);
  setGhost("A", "guide");
  const title = el("h1", "sumtitle", "Translation Summary");
  const quote = el("p", "sumquote", `“${state.line.text}”`);
  const stack = el("div", "sumstack");
  stack.append(
    sumLine(score.letters, "letters", score.letterMult),
    el("p", "sumplus", "+"),
    sumLine(score.words, "words", score.wordMult),
    el("p", "sumplus", "+"),
    sumLine(1, "sentence", score.sentenceMult),
    el("p", "sumtotal", `${money(score.total)} points`),
  );
  panel.append(title, quote, stack);
  if (!state.saved) {
    panel.append(el("p", "sumhint", "Add name and save progress"));
    const name = el("button", "name", state.name || "Name");
    name.type = "button";
    name.dataset.act = "publish";
    panel.append(name);
    if (naming) panel.append(nameKeys());
    if (status.startsWith("Type at least")) panel.append(el("p", "hint", status));
  } else {
    panel.append(el("p", "sumhint", state.streak > 1
      ? `Day ${state.streak}. Log everyday and create a streak multiplier.`
      : "Log everyday and create a streak multiplier."));
    panel.append(board());
    panel.append(ribbon("Match up!", "again"));
  }
  say(`Translation summary. ${money(score.total)} points.`);
}

function setMode(mode) {
  if (frame.dataset.mode !== mode) frame.dataset.mode = mode;
}

let recent = [];

function onLandmarks(points) {
  prevLm = nextLm;
  nextLm = points;
  lmAt = performance.now();
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
    stream = await navigator.mediaDevices.getUserMedia({
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
  prevLm = null;
  nextLm = null;
  dispatch(begin(fixedLine || randomLine()));
  startHand(onStatus, onLandmarks);
  navigator.wakeLock?.request("screen").catch(() => {});
}

async function onMatch() {
  note = "";
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
  dispatch(advance(state));
  lockUntil = performance.now() + 220;
  holdStart = 0;
  recent = [];
  shapeMs = 0;
  travel = 0;
  lastWrist = null;
  if (state.phase === "summary") naming = false;
}

function backToStart() {
  naming = false;
  note = "";
  status = camOn ? "Hold up your pointer finger to start." : "Tap Match up!";
  dispatch(attract());
}

async function saveScore() {
  const next = markSaved(state);
  if (next === state) {
    status = "Type at least two letters.";
    render();
    return;
  }
  const saved = record(store, data, next.name, breakdown(next).total, today);
  data = saved.data;
  const remote = await pushScore(next.name, breakdown(next).total, today);
  if (remote) data = { ...data, scores: remote };
  note = "";
  naming = false;
  status = "";
  dispatch({ ...next, streak: saved.streak });
}

stage.addEventListener("click", (event) => {
  lastInput = performance.now();
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const act = button.dataset.act;
  if (act === "match") onMatch();
  if (act === "start") beginPlay();
  if (act === "publish") {
    naming = true;
    status = "";
    render();
  }
  if (act === "again") backToStart();
  if (act === "key") dispatch(typeName(state, button.dataset.key));
  if (act === "save") saveScore();
});

stage.addEventListener("pointerdown", (event) => {
  if (!event.target.closest("[data-act=hold]") || state.phase !== "play") return;
  if (state.feedback?.kind === "success") return;
  dispatch(accept(state));
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(finishFlash, FLASH_MS);
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  lastInput = performance.now();
  const typed = event.key.toUpperCase() === targetLetter(state) || (event.key === "Enter" && targetWord(state));
  if (state.phase === "play" && typed) {
    dispatch(accept(state));
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(finishFlash, FLASH_MS);
    return;
  }
  if (state.phase !== "summary" || state.saved) return;
  if (event.key === "Backspace") dispatch(typeName(state, "back"));
  else if (/^[a-zA-Z]$/.test(event.key)) dispatch(typeName(state, event.key.toUpperCase()));
  else if (event.key === "Enter") saveScore();
});

// ponytail: no word-sign model, so this checks the sign's handshape plus movement, not the exact motion path. Train a sequence model on word clips to grade the motion itself.
function wordTick(now) {
  const dt = lastTick ? now - lastTick : 0;
  if (!nextLm) {
    setMode("idle");
    return;
  }
  const wrist = nextLm[0];
  if (lastWrist && wrist !== lastWrist) travel += Math.hypot(wrist.x - lastWrist.x, wrist.y - lastWrist.y);
  lastWrist = wrist;
  const shape = judgeFrames(recent, WORD_SIGNS[targetWord(state)].hand).score >= ALMOST_SCORE;
  if (shape) shapeMs += dt;
  setMode(shape ? "ok" : "almost");
  if (shapeMs >= WORD_SHAPE_MS && travel >= WORD_TRAVEL) {
    dispatch(accept(state));
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(finishFlash, FLASH_MS);
  }
}

function tick(now) {
  if (state.phase === "summary" && now - lastInput > IDLE_MS) backToStart();
  if (state.phase === "play" && targetWord(state) && now >= lockUntil && state.feedback?.kind !== "success") {
    wordTick(now);
    lastTick = now;
    return;
  }
  lastTick = now;
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
      dispatch(accept(state));
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(finishFlash, FLASH_MS);
    }
    return;
  }
  if (holdStart && result.score >= ALMOST_SCORE && now - holdStart < HOLD_MS + 160) return;
  holdStart = 0;
  if (result.score >= ALMOST_SCORE) {
    setMode("almost");
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
