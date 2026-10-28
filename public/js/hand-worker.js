let landmarker = null;
let lastStamp = 0;

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "init") {
    try {
      const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs");
      const files = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm",
      );
      landmarker = await vision.HandLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        // VIDEO tracks the hand between frames instead of re-detecting it every time: steadier and faster.
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.3,
        minHandPresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error) });
    }
    return;
  }
  if (msg.type === "frame" && landmarker) {
    try {
      const result = landmarker.detectForVideo(msg.bitmap, (lastStamp = Math.max(lastStamp + 1, performance.now())));
      msg.bitmap.close();
      const raw = result.landmarks && result.landmarks[0] ? result.landmarks[0] : null;
      // Training frames are right hands in selfie view; the camera buffer is not mirrored, so flip x.
      // A left hand is already the mirror of a right one, so it stays unflipped. On this raw buffer
      // MediaPipe's "Left" label is the player's left hand: the opposite guess read a real B as W.
      const left = result.handedness?.[0]?.[0]?.categoryName === "Left";
      const points = raw
        ? raw.map((p) => ({ x: left ? p.x : 1 - p.x, y: p.y, z: p.z || 0 }))
        : null;
      // raw: the landmarker's own coordinates, unflipped, for the word model.
      const flat = raw ? raw.flatMap((p) => [p.x, p.y]) : null;
      self.postMessage({ type: "landmarks", points, raw: flat });
    } catch (error) {
      try {
        msg.bitmap.close();
      } catch {
        /* bitmap already closed */
      }
      // One bad frame is not fatal: report "no hand" and keep tracking. Only a failed load is an error.
      self.postMessage({ type: "landmarks", points: null, raw: null });
    }
  }
};
