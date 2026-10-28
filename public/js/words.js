// Word signs, read by PopSign's 250-sign model (Georgia Tech Center for Accessible Technology in Sign,
// MIT license, SLRGestureToolkitCore). Input: one hand's 21 MediaPipe points (x, y) over 60 frames.
// The weights in /models/popsign-250.bin are the .tflite tensors, in TFLite's own layout.

export const WORD_LABELS = ["TV", "after", "airplane", "all", "alligator", "animal", "another", "any", "apple", "arm", "aunt", "awake", "backyard", "bad", "balloon", "bath", "because", "bed", "bedroom", "bee", "before", "beside", "better", "bird", "black", "blow", "blue", "boat", "book", "boy", "brother", "brown", "bug", "bye", "callonphone", "can", "car", "carrot", "cat", "cereal", "chair", "cheek", "child", "chin", "chocolate", "clean", "close", "closet", "cloud", "clown", "cow", "cowboy", "cry", "cut", "cute", "dad", "dance", "dirty", "dog", "doll", "donkey", "down", "drawer", "drink", "drop", "dry", "dryer", "duck", "ear", "elephant", "empty", "every", "eye", "face", "fall", "farm", "fast", "feet", "find", "fine", "finger", "finish", "fireman", "first", "fish", "flag", "flower", "food", "for", "frenchfries", "frog", "garbage", "gift", "giraffe", "girl", "give", "glasswindow", "go", "goose", "grandma", "grandpa", "grass", "green", "gum", "hair", "happy", "hat", "hate", "have", "haveto", "head", "hear", "helicopter", "hello", "hen", "hesheit", "hide", "high", "home", "horse", "hot", "hungry", "icecream", "if", "into", "jacket", "jeans", "jump", "kiss", "kitty", "lamp", "later", "like", "lion", "lips", "listen", "look", "loud", "mad", "make", "man", "many", "milk", "minemy", "mitten", "mom", "moon", "morning", "mouse", "mouth", "nap", "napkin", "night", "no", "noisy", "nose", "not", "now", "nuts", "old", "on", "open", "orange", "outside", "owie", "owl", "pajamas", "pen", "pencil", "penny", "person", "pig", "pizza", "please", "police", "pool", "potty", "pretend", "pretty", "puppy", "puzzle", "quiet", "radio", "rain", "read", "red", "refrigerator", "ride", "room", "sad", "same", "say", "scissors", "see", "shhh", "shirt", "shoe", "shower", "sick", "sleep", "sleepy", "smile", "snack", "snow", "stairs", "stay", "sticky", "store", "story", "stuck", "sun", "table", "talk", "taste", "thankyou", "that", "there", "think", "thirsty", "tiger", "time", "tomorrow", "tongue", "tooth", "toothbrush", "touch", "toy", "tree", "uncle", "underwear", "up", "vacuum", "wait", "wake", "water", "wet", "weus", "where", "white", "who", "why", "will", "wolf", "yellow", "yes", "yesterday", "yourself", "yucky", "zebra", "zipper"];

const FRAMES = 60;
const POINTS = 42;
const SHAPES = [[32, 3, 3, 1], [32], [64, 3, 3, 32], [64], [64, 3, 3, 64], [64], [64, 5376], [64], [250, 64], [250]];

export function unpack(buffer) {
  const all = new Float32Array(buffer);
  const parts = [];
  let at = 0;
  for (const shape of SHAPES) {
    const n = shape.reduce((a, b) => a * b, 1);
    parts.push(all.subarray(at, at + n));
    at += n;
  }
  if (at !== all.length) throw new Error("Word model file has the wrong size.");
  return parts;
}

// 3x3 conv, stride 1, ReLU. NHWC input; weights are [out, 3, 3, in]. same = pad 1, else valid.
function conv(input, h, w, c, weights, bias, out, same) {
  const pad = same ? 1 : 0;
  const oh = same ? h : h - 2;
  const ow = same ? w : w - 2;
  const res = new Float32Array(oh * ow * out);
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      const base = (oy * ow + ox) * out;
      for (let o = 0; o < out; o++) {
        let sum = bias[o];
        for (let ky = 0; ky < 3; ky++) {
          const iy = oy + ky - pad;
          if (iy < 0 || iy >= h) continue;
          for (let kx = 0; kx < 3; kx++) {
            const ix = ox + kx - pad;
            if (ix < 0 || ix >= w) continue;
            const ii = (iy * w + ix) * c;
            const wi = ((o * 3 + ky) * 3 + kx) * c;
            for (let k = 0; k < c; k++) sum += input[ii + k] * weights[wi + k];
          }
        }
        res[base + o] = sum > 0 ? sum : 0;
      }
    }
  }
  return res;
}

function pool(input, h, w, c) {
  const oh = h >> 1;
  const ow = w >> 1;
  const res = new Float32Array(oh * ow * c);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      for (let k = 0; k < c; k++) {
        const a = ((2 * y) * w + 2 * x) * c + k;
        const b = ((2 * y + 1) * w + 2 * x) * c + k;
        res[(y * ow + x) * c + k] = Math.max(input[a], input[a + c], input[b], input[b + c]);
      }
    }
  }
  return res;
}

function dense(input, weights, bias, relu) {
  const n = input.length;
  const res = new Float32Array(bias.length);
  for (let o = 0; o < bias.length; o++) {
    let sum = bias[o];
    const wi = o * n;
    for (let i = 0; i < n; i++) sum += input[i] * weights[wi + i];
    res[o] = relu && sum < 0 ? 0 : sum;
  }
  return res;
}

// input: Float32Array of 60 frames x 42 numbers (x0, y0, ... x20, y20). Returns the model's raw scores.
export function wordLogits(parts, input) {
  const [w1, b1, w2, b2, w3, b3, w4, b4, w5, b5] = parts;
  let x = pool(conv(input, FRAMES, POINTS, 1, w1, b1, 32, true), 60, 42, 32);
  x = pool(conv(x, 30, 21, 32, w2, b2, 64, false), 28, 19, 64);
  x = conv(x, 14, 9, 64, w3, b3, 64, false);
  return dense(dense(x, w4, b4, true), w5, b5, false);
}

export function wordProbs(parts, input) {
  const z = wordLogits(parts, input);
  const max = Math.max(...z);
  let sum = 0;
  const e = Array.from(z, (v) => {
    const x = Math.exp(v - max);
    sum += x;
    return x;
  });
  return e.map((v) => v / sum);
}
