import { WEIGHTS } from "./asl-weights.js";

// Accept when this letter is the network's read. The bar is a probability, not a pose template.
export const SUCCESS_SCORE = 0.25;
export const ALMOST_SCORE = 0.1;

// Every letter that holds still. J and Z need motion the single-frame network can't see.
export const LETTERS = [..."ABCDEFGHIKLMNOPQRSTUVWXY"];

// How to make each letter, shown while the player signs it. Plain words beat a guessed finger fix.
export const HOW = {
  A: "Make a fist with your thumb resting on the side.",
  B: "Four fingers straight up together, thumb folded across your palm.",
  C: "Curve your fingers and thumb into a C.",
  D: "Pointer up. Other fingertips touch your thumb in a circle.",
  E: "Curl your fingertips down onto your thumb.",
  F: "Thumb and pointer touch in a circle. Other three fingers up.",
  G: "Pointer and thumb stick out sideways, side by side.",
  H: "Pointer and middle finger point sideways, together.",
  I: "Only your pinky up. Thumb folded across the other fingers.",
  K: "Pointer and middle finger up in a V, thumb between them.",
  L: "Pointer up and thumb out, like an L.",
  M: "Tuck your thumb under your first three fingers.",
  N: "Tuck your thumb under your first two fingers.",
  O: "All your fingertips touch your thumb, like an O.",
  P: "Make a K, then point it down.",
  Q: "Make a G, then point it down.",
  R: "Cross your middle finger over your pointer.",
  S: "Make a fist with your thumb across the front of your fingers.",
  T: "Tuck your thumb between your pointer and middle finger.",
  U: "Pointer and middle finger up, together.",
  V: "Pointer and middle finger up, spread apart.",
  W: "Pointer, middle, and ring fingers up, spread apart.",
  X: "Bend your pointer into a hook.",
  Y: "Thumb and pinky out, other fingers folded.",
};

function angleDeg(a, b, c) {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v1z = (a.z || 0) - (b.z || 0);
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const v2z = (c.z || 0) - (b.z || 0);
  const d1 = Math.hypot(v1x, v1y, v1z) || 1;
  const d2 = Math.hypot(v2x, v2y, v2z) || 1;
  const dot = (v1x * v2x + v1y * v2y + v1z * v2z) / (d1 * d2);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

// 0 = straight, 1 = fully curled, from the two finger-joint angles.
function fingerCurl(lm, mcp, pip, dip, tip) {
  const open = (angleDeg(lm[mcp], lm[pip], lm[dip]) + angleDeg(lm[pip], lm[dip], lm[tip])) / 2;
  return Math.max(0, Math.min(1, (168 - open) / 78));
}

export function curls(lm) {
  if (!lm || lm.length < 21) return null;
  return {
    index: fingerCurl(lm, 5, 6, 7, 8),
    middle: fingerCurl(lm, 9, 10, 11, 12),
    ring: fingerCurl(lm, 13, 14, 15, 16),
    pinky: fingerCurl(lm, 17, 18, 19, 20),
  };
}

function relu(v) {
  return v > 0 ? v : 0;
}

function softmax(logits) {
  let max = logits[0];
  for (let i = 1; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const ex = new Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    ex[i] = Math.exp(logits[i] - max);
    sum += ex[i];
  }
  for (let i = 0; i < ex.length; i++) ex[i] /= sum;
  return ex;
}

// 40 numbers: every landmark except the wrist, centered on the wrist and scaled by the longest reach.
export function handVector(lm) {
  if (!lm || lm.length < 21) return null;
  const wrist = lm[0];
  const rel = new Array(42);
  let scale = 0;
  for (let i = 0; i < 21; i++) {
    const x = lm[i].x - wrist.x;
    const y = lm[i].y - wrist.y;
    rel[i * 2] = x;
    rel[i * 2 + 1] = y;
    const reach = Math.hypot(x, y);
    if (reach > scale) scale = reach;
  }
  if (!(scale > 1e-4)) return null;
  const out = new Array(40);
  for (let i = 1; i < 21; i++) {
    out[(i - 1) * 2] = rel[i * 2] / scale;
    out[(i - 1) * 2 + 1] = rel[i * 2 + 1] / scale;
  }
  return out;
}

function predict(vec) {
  const { mean, std, w, b, shape } = WEIGHTS;
  let h = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) h[i] = (vec[i] - mean[i]) / std[i];
  for (let layer = 0; layer < w.length; layer++) {
    const inN = shape[layer];
    const outN = shape[layer + 1];
    const weights = w[layer];
    const bias = b[layer];
    const next = new Array(outN);
    const last = layer === w.length - 1;
    for (let o = 0; o < outN; o++) {
      let sum = bias[o];
      for (let i = 0; i < inN; i++) sum += h[i] * weights[i * outN + o];
      next[o] = last ? sum : relu(sum);
    }
    h = next;
  }
  return softmax(h);
}

// Only letters the game asks for compete, so unplayable lookalikes (J for I) can't steal a match.
const PLAYABLE = LETTERS.map((l) => WEIGHTS.letters.indexOf(l));

function read(lm) {
  const vec = handVector(lm);
  if (!vec) return null;
  const all = predict(vec);
  const kept = PLAYABLE.map((i) => all[i]);
  const total = kept.reduce((a, c) => a + c, 0) || 1;
  return kept.map((v) => v / total);
}

// Pointer up, other fingers folded: a plain geometry rule, so the kiosk wakes for any pointing finger.
export function pointingUp(lm) {
  const f = curls(lm);
  return !!f && f.index < 0.35 && f.middle > 0.45 && f.ring > 0.45 && f.pinky > 0.45;
}

export function judge(lm, letter) {
  return judgeFrames(lm ? [lm] : [], letter);
}

// Average the read over the last few frames (SignAll-style min occurrence) so one noisy frame can't fail a sign.
export function judgeFrames(frames, letter) {
  const at = LETTERS.indexOf(letter);
  const reads = frames.map(read).filter(Boolean);
  if (at < 0 || !reads.length) return { score: 0, correction: "", best: "" };
  const probs = reads[0].map((_, i) => reads.reduce((sum, r) => sum + r[i], 0) / reads.length);
  let bestAt = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bestAt]) bestAt = i;
  const best = LETTERS[bestAt];
  const p = probs[at];
  // A close runner-up passes too: learners' hands are rough, and a kiosk should feel generous.
  const second = probs.filter((_, i) => i !== bestAt).reduce((m, v) => Math.max(m, v), 0);
  const near = best !== letter && p >= 0.4 && p === second;
  if ((best === letter && p >= SUCCESS_SCORE) || near) {
    return { score: Math.max(p, SUCCESS_SCORE), correction: "", best: letter };
  }
  const correction = HOW[letter];
  const score = p >= ALMOST_SCORE || best !== letter ? Math.min(Math.max(p, ALMOST_SCORE), SUCCESS_SCORE - 0.01) : p;
  if (p < 0.08 && probs[bestAt] < 0.45) return { score: p, correction: "", best };
  return { score, correction, best };
}
