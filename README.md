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

GitHub Actions runs the tests, then deploys the Cloudflare Worker on every push to main.

Repository secrets, set under Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN` — API token with permission to edit Workers on this account
- `CLOUDFLARE_ACCOUNT_ID` — the account id in `wrangler.jsonc`

The leaderboard lives in a Workers KV namespace bound as `BOARD` (id in `wrangler.jsonc`).
