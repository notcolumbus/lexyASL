let landmarker = null;

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
        runningMode: "IMAGE",
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
      const result = landmarker.detect(msg.bitmap);
      msg.bitmap.close();
      const raw = result.landmarks && result.landmarks[0] ? result.landmarks[0] : null;
      // Training frames were mirrored into selfie view. The camera buffer is not.
      const points = raw
        ? raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z || 0 }))
        : null;
      self.postMessage({ type: "landmarks", points });
    } catch (error) {
      try {
        msg.bitmap.close();
      } catch {
        /* bitmap already closed */
      }
      self.postMessage({ type: "error", message: String(error) });
    }
  }
};
