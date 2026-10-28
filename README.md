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
