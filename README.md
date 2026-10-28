# Lexy ASL

Browser-based ASL practice app with hand tracking.

## Run locally

```sh
npm ci
npm run dev
```

Camera access requires localhost or HTTPS.

## Tests

```sh
npm test
```

## Deployment

Cloudflare Workers Builds deploys the Worker on every push to main. GitHub Actions only runs the tests.

The leaderboard lives in a Workers KV namespace bound as `BOARD` (id in `wrangler.jsonc`).

## Models

- Letters: a small landmark network (`public/js/asl-weights.js`) trained on two sets: SteelHacks ([Vaxier8/ASLModel](https://github.com/Vaxier8/ASLModel), MIT) and [Marxulia/asl_sign_languages_alphabets_v03](https://huggingface.co/datasets/Marxulia/asl_sign_languages_alphabets_v03) photos run through MediaPipe. Trained on the photos alone it scores 94% top-1 on SteelHacks signers it never saw; trained on SteelHacks alone it scored 38% the other way, which is why the old model felt so strict.
- Word signs: PopSign's 250-sign model from the Georgia Tech Center for Accessible Technology in Sign ([SLRGestureToolkitCore](https://github.com/Accessible-Technology-in-Sign/SLRGestureToolkitCore), MIT, notice in `public/models/LICENSE-popsign.txt`). The `.tflite` weights are unpacked to `public/models/popsign-250.bin` and run in plain JS (`public/js/words.js`); `test/words.test.js` checks it against the TFLite original.
