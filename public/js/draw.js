let blurTmp = null;

// Scale (vw x vh) to cover (cw x ch), centered, like object-fit: cover.
function cover(vw, vh, cw, ch) {
  const scale = Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  return { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh };
}

export function paintBlur(video, canvas) {
  if (!video.videoWidth) return;
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true, willReadFrequently: true });
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
