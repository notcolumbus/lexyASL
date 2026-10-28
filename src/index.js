import { addScore, emptyBoard, parseEntry, publicBoard } from "./board.js";

const KEY = "board.json";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function todayUtc(now) {
  return now.toISOString().slice(0, 10);
}

async function readBoard(kv) {
  const data = await kv.get(KEY, "json").catch(() => null);
  return data && Array.isArray(data.scores) ? data : emptyBoard();
}

// ponytail: KV has no compare-and-swap, so simultaneous submissions can drop one; move to a Durable Object if traffic grows.
async function writeScore(kv, entry) {
  const next = addScore(await readBoard(kv), entry);
  await kv.put(KEY, JSON.stringify(next));
  console.log(JSON.stringify({ event: "board_write", name: entry.name, points: entry.points }));
  return next;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/board") {
      return env.ASSETS.fetch(request);
    }
    if (!env.BOARD) {
      return json({ error: "Leaderboard storage is not connected." }, 503);
    }
    if (request.method === "GET") {
      return json(publicBoard(await readBoard(env.BOARD)));
    }
    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Expected a JSON body." }, 400);
      }
      const entry = parseEntry(body, todayUtc(new Date()));
      if (!entry) return json({ error: "Use a 2 to 12 letter name and a score up to 10000." }, 400);
      const board = await writeScore(env.BOARD, entry);
      return json(publicBoard(board));
    }
    return json({ error: "Method not allowed." }, 405);
  },
};
