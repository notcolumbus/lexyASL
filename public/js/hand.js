let worker = null;
let ready = false;
let busy = false;
let failed = false;
let waitTimer = 0;
let onLandmarks = () => {};
let onStatus = () => {};

export function startHand(status, landmarks) {
  onStatus = status;
  onLandmarks = landmarks;
  if (worker || failed) return;
  // MediaPipe's wasm loader calls importScripts. Module workers throw on that call.
  worker = new Worker("./js/hand-worker.js");
  worker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === "ready") {
      ready = true;
      onStatus("Show the sign");
      return;
    }
    if (msg.type === "landmarks") {
      busy = false;
      window.clearTimeout(waitTimer);
      onLandmarks(msg.points, msg.raw);
      return;
    }
    if (msg.type === "error") {
      busy = false;
      failed = true;
      window.clearTimeout(waitTimer);
      console.error(msg.message);
      onStatus(msg.message || "Hand model didn't load.");
    }
  };
  worker.onerror = (event) => {
    busy = false;
    failed = true;
    console.error(event.message || event);
    onStatus(event.message || "Hand model didn't load.");
  };
  onStatus("Loading the hand model");
  worker.postMessage({ type: "init" });
}

export function pushFrame(video) {
  if (!ready || busy || failed || video.readyState < 2) return;
  busy = true;
  // Full frame: the landmarker finds the hand, then crops it itself. Shrinking first left a far-away hand a few pixels wide.
  createImageBitmap(video)
    .then((bitmap) => {
      if (!worker || failed) {
        bitmap.close();
        busy = false;
        return;
      }
      worker.postMessage({ type: "frame", bitmap }, [bitmap]);
      window.clearTimeout(waitTimer);
      waitTimer = window.setTimeout(() => {
        busy = false;
      }, 700);
    })
    .catch(() => {
      busy = false;
    });
}

export function handReady() {
  return ready && !failed;
}
