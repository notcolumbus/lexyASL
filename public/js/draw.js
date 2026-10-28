const LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 9], [0, 13], [0, 17],
];

const mixBuf = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
let blurTmp = null;

export function mixLandmarks(prev, next, t) {
  if (!next) return prev;
  if (!prev) return next;
  for (let i = 0; i < 21; i++) {
    const a = prev[i];
    const b = next[i];
    mixBuf[i].x = a.x + (b.x - a.x) * t;
    mixBuf[i].y = a.y + (b.y - a.y) * t;
    mixBuf[i].z = (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t;
  }
  return mixBuf;
}

export function fitCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  return dpr;
}

function cover(vw, vh, cw, ch) {
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  return { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh };
}

export function paintBones(canvas, video, landmarks, color) {
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const dpr = fitCanvas(canvas);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!landmarks || !video.videoWidth) return;
  const box = cover(video.videoWidth, video.videoHeight, cw, ch);
  const at = (p) => ({ x: box.x + p.x * box.w, y: box.y + p.y * box.h });
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const [a, b] of LINKS) {
    const p = at(landmarks[a]);
    const q = at(landmarks[b]);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < landmarks.length; i++) {
    const p = at(landmarks[i]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, i % 4 === 0 ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function paintBlur(video, canvas) {
  if (!video.videoWidth) return;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const box = cover(video.videoWidth, video.videoHeight, w, h);
  ctx.drawImage(video, box.x, box.y, box.w, box.h);
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  if (!blurTmp || blurTmp.length !== src.length) blurTmp = new Uint8ClampedArray(src.length);
  const tmp = blurTmp;
  const r = 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let c = 0;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        const i = (y * w + xx) * 4;
        rs += src[i];
        gs += src[i + 1];
        bs += src[i + 2];
        c++;
      }
      const o = (y * w + x) * 4;
      tmp[o] = rs / c;
      tmp[o + 1] = gs / c;
      tmp[o + 2] = bs / c;
      tmp[o + 3] = 255;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      let c = 0;
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const i = (yy * w + x) * 4;
        rs += tmp[i];
        gs += tmp[i + 1];
        bs += tmp[i + 2];
        c++;
      }
      const o = (y * w + x) * 4;
      src[o] = rs / c;
      src[o + 1] = gs / c;
      src[o + 2] = bs / c;
      src[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function handIcon(letter, mode) {
  const name = /^[a-z]$/i.test(letter || "") ? letter.toLowerCase() : "a";
  const tone = mode === "ok" ? "ok" : mode === "almost" ? "almost" : "guide";
  return `<img class="sign ${tone}" src="./assets/hands/${name}.png" alt="" />`;
}
