import { WEIGHTS } from "./asl-weights.js";

const SPECS = {
  A: { curls: [0, 1, 1, 1, 1], thumb: "pad", bend: 0.35, spread: 0.15 },
  B: { curls: [0, 0, 0, 0, 0], thumb: "across", bend: 0.95, spread: 0.02 },
  C: { curls: [0, 0.48, 0.48, 0.48, 0.48], thumb: "curve", bend: 0.35, spread: 0.55 },
  D: { curls: [0, 0, 1, 1, 1], thumb: "pad", bend: 0.55, spread: 0.12 },
  E: { curls: [0, 1, 1, 1, 1], thumb: "tips", bend: 0.9, spread: 0.12 },
  F: { curls: [0, 0.62, 0, 0, 0], thumb: "pinch", bend: 0.2, spread: 0.2 },
  I: { curls: [0, 1, 1, 1, 0], thumb: "across", bend: 0.75, spread: 0.12 },
  L: { curls: [0, 0, 1, 1, 1], thumb: "side", bend: 0, spread: 0.12 },
  O: { curls: [0, 0.72, 0.72, 0.72, 0.72], thumb: "pinch", bend: 0.6, spread: 0.2 },
  V: { curls: [0, 0, 0, 1, 1], thumb: "across", bend: 0.8, spread: 0.95 },
  W: { curls: [0, 0, 0, 0, 1], thumb: "across", bend: 0.8, spread: 0.55 },
  Y: { curls: [0, 1, 1, 1, 0], thumb: "side", bend: 0.05, spread: 0.2 },
};

const KEYS = [
  "thumb",
  "index",
  "middle",
  "ring",
  "pinky",
  "thumbIndex",
  "thumbMcp",
  "indexMiddle",
  "midRing",
  "ringPinky",
];

// A difference inside `dead` is free. Past that, `span` is a full miss.
const BAND = {
  thumb: { dead: 0.22, span: 0.5 },
  index: { dead: 0.28, span: 0.45 },
  middle: { dead: 0.28, span: 0.45 },
  ring: { dead: 0.28, span: 0.45 },
  pinky: { dead: 0.28, span: 0.45 },
  thumbIndex: { dead: 0.3, span: 0.65 },
  thumbMcp: { dead: 0.35, span: 0.6 },
  indexMiddle: { dead: 0.45, span: 1.2 },
  midRing: { dead: 0.45, span: 1.2 },
  ringPinky: { dead: 0.45, span: 1.2 },
};

const WEIGHT = {
  thumb: 0.7,
  index: 1.3,
  middle: 1.3,
  ring: 1.3,
  pinky: 1.3,
  thumbIndex: 1.15,
  thumbMcp: 1.35,
  indexMiddle: 0.35,
  midRing: 0.35,
  ringPinky: 0.35,
};

const FIX = {
  thumb: ["Stick your thumb out more.", "Bring your thumb down more."],
  index: ["Straighten your index finger.", "Curl your index finger in."],
  middle: ["Straighten your middle finger.", "Curl your middle finger in."],
  ring: ["Lift your ring finger.", "Curl your ring finger in."],
  pinky: ["Lift your pinky.", "Curl your pinky in."],
  thumbIndex: [
    "Open a gap between your thumb and index finger.",
    "Bring your thumb closer to your index finger.",
  ],
  thumbMcp: [
    "Move your thumb away from the side of your hand.",
    "Bring your thumb in toward your index knuckle.",
  ],
  indexMiddle: ["Spread your index and middle fingers.", "Bring your index and middle fingers together."],
  midRing: ["Spread your middle and ring fingers.", "Bring your middle and ring fingers together."],
  ringPinky: ["Spread your ring finger and pinky.", "Bring your ring finger and pinky together."],
};

// Accept when this letter is the network's read. The bar is a probability, not a pose template.
export const SUCCESS_SCORE = 0.25;
export const ALMOST_SCORE = 0.1;

// Every letter that holds still. J and Z need motion the single-frame network can't see.
export const LETTERS = [..."ABCDEFGHIKLMNOPQRSTUVWXY"];

export function letterSpec(letter) {
  return SPECS[letter];
}

function dist(a, b) {
  const dz = ((a.z || 0) - (b.z || 0)) * 0.45;
  return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

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

function fingerCurl(lm, mcp, pip, dip, tip) {
  const open = (angleDeg(lm[mcp], lm[pip], lm[dip]) + angleDeg(lm[pip], lm[dip], lm[tip])) / 2;
  return clamp((168 - open) / 78, 0, 1);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function chain(mcp, curl, spread) {
  let ang = -Math.PI / 2 + spread;
  const seg = 0.4;
  let x = mcp.x;
  let y = mcp.y;
  const pts = [{ x, y, z: 0 }];
  const bend = curl * 1.25;
  for (let i = 0; i < 3; i++) {
    ang += bend;
    x += Math.cos(ang) * seg;
    y += Math.sin(ang) * seg;
    pts.push({ x, y, z: 0 });
  }
  return pts;
}

function mix(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t };
}

function thumbChain(target, bend) {
  const cmc = { x: -0.48, y: -0.16, z: 0 };
  const dx = target.x - cmc.x;
  const dy = target.y - cmc.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const pull = bend * 0.42;
  const mcp = { x: cmc.x + dx * 0.36 + px * pull, y: cmc.y + dy * 0.36 + py * pull, z: bend * 0.08 };
  const ip = { x: cmc.x + dx * 0.7 + px * pull * 0.45, y: cmc.y + dy * 0.7 + py * pull * 0.45, z: bend * 0.04 };
  return [cmc, mcp, ip, { x: target.x, y: target.y, z: target.z || 0 }];
}

export function sample(letter, tweak = {}) {
  const spec = SPECS[letter];
  if (!spec) return null;
  const curls = spec.curls.map((c, i) => clamp(c + (tweak[i] || 0), 0, 1.15));
  const lm = new Array(21);
  lm[0] = { x: 0, y: 0, z: 0 };
  const anchors = [
    { x: -0.5, y: -0.92 },
    { x: -0.17, y: -1 },
    { x: 0.16, y: -0.98 },
    { x: 0.48, y: -0.84 },
  ];
  const fan = [-0.22, -0.06, 0.08, 0.22];
  const spread = spec.spread ?? 0.2;
  for (let f = 0; f < 4; f++) {
    const pts = chain(anchors[f], curls[f + 1], fan[f] * spread);
    const base = 5 + f * 4;
    lm[base] = pts[0];
    lm[base + 1] = pts[1];
    lm[base + 2] = pts[2];
    lm[base + 3] = pts[3];
  }
  const indexMcp = lm[5];
  const indexTip = lm[8];
  const midTip = lm[12];
  let target;
  if (spec.thumb === "pad") target = { x: indexMcp.x + 0.02, y: indexMcp.y + 0.12, z: 0.02 };
  else if (spec.thumb === "pinch") target = { x: indexTip.x + 0.02, y: indexTip.y + 0.02, z: 0.02 };
  else if (spec.thumb === "tips") target = { x: (indexTip.x + midTip.x) / 2, y: (indexTip.y + midTip.y) / 2, z: 0.05 };
  else if (spec.thumb === "side") target = { x: indexMcp.x - 0.95, y: indexMcp.y + 0.25, z: 0 };
  else if (spec.thumb === "curve") target = { x: indexMcp.x - 0.55, y: indexTip.y + 0.35, z: 0 };
  else target = { x: 0.02, y: -0.48, z: 0.12 };
  const thumb = thumbChain(target, spec.bend || 0);
  lm[1] = thumb[0];
  lm[2] = thumb[1];
  lm[3] = thumb[2];
  lm[4] = thumb[3];
  return lm;
}

export function features(lm) {
  if (!lm || lm.length < 21) return null;
  const palm = dist(lm[0], lm[9]);
  if (!(palm > 0.015)) return null;
  const n = (i, j) => dist(lm[i], lm[j]) / palm;
  return {
    thumb: fingerCurl(lm, 1, 2, 3, 4),
    index: fingerCurl(lm, 5, 6, 7, 8),
    middle: fingerCurl(lm, 9, 10, 11, 12),
    ring: fingerCurl(lm, 13, 14, 15, 16),
    pinky: fingerCurl(lm, 17, 18, 19, 20),
    thumbIndex: n(4, 8),
    thumbMcp: n(4, 5),
    indexMiddle: n(8, 12),
    midRing: n(12, 16),
    ringPinky: n(16, 20),
  };
}

const TEMPLATES = Object.fromEntries(Object.keys(SPECS).map((letter) => [letter, features(sample(letter))]));

function matchOne(feat, letter) {
  const template = TEMPLATES[letter];
  let err = 0;
  let weightSum = 0;
  let worst = 0;
  let worstKey = "index";
  let worstHigh = true;
  for (const key of KEYS) {
    const delta = feat[key] - template[key];
    const band = BAND[key];
    const norm = Math.max(0, Math.abs(delta) - band.dead) / band.span;
    const weight = WEIGHT[key];
    err += norm * weight;
    weightSum += weight;
    if (norm > worst) {
      worst = norm;
      worstKey = key;
      worstHigh = delta > 0;
    }
  }
  const average = Math.max(0, 1 - err / weightSum);
  const raw = Math.max(0, average * 0.35 + (1 - Math.min(1, worst)) * 0.65);
  return { raw, worst, worstKey, worstHigh };
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

function hint(feat, letter, best) {
  if (feat && TEMPLATES[letter]) {
    const mine = matchOne(feat, letter);
    if (mine.worst > 0.35) {
      const curl = mine.worstKey === "thumb" || mine.worstKey === "index" || mine.worstKey === "middle" || mine.worstKey === "ring" || mine.worstKey === "pinky";
      const tooMuch = curl ? !mine.worstHigh : mine.worstHigh;
      return FIX[mine.worstKey][tooMuch ? 1 : 0];
    }
  }
  if (best && best !== letter) return `Closer to ${best}.`;
  return "Almost there!";
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
  const f = features(lm);
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
  const lm = frames[frames.length - 1];
  let bestAt = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bestAt]) bestAt = i;
  const best = LETTERS[bestAt];
  const p = probs[at];
  const feat = features(lm);
  // A close runner-up passes too: learners' hands are rough, and a kiosk should feel generous.
  const second = probs.filter((_, i) => i !== bestAt).reduce((m, v) => Math.max(m, v), 0);
  const near = best !== letter && p >= 0.4 && p === second;
  if ((best === letter && p >= SUCCESS_SCORE) || near) {
    return { score: Math.max(p, SUCCESS_SCORE), correction: "", best: letter };
  }
  const correction = hint(feat, letter, best);
  const score = p >= ALMOST_SCORE || best !== letter ? Math.min(Math.max(p, ALMOST_SCORE), SUCCESS_SCORE - 0.01) : p;
  if (p < 0.08 && probs[bestAt] < 0.45) return { score: p, correction: "", best };
  return { score, correction, best };
}
