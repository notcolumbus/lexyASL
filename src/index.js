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

async function readBoard(bucket) {
  const object = await bucket.get(KEY);
  if (!object) return { board: emptyBoard(), etag: "" };
  try {
    const data = await object.json();
    if (!data || !Array.isArray(data.scores)) return { board: emptyBoard(), etag: object.httpEtag || "" };
    return { board: data, etag: object.httpEtag || "" };
  } catch {
    return { board: emptyBoard(), etag: object.httpEtag || "" };
  }
}

async function writeScore(bucket, entry) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readBoard(bucket);
    const next = addScore(current.board, entry);
    const put = await bucket.put(KEY, JSON.stringify(next), {
      httpMetadata: { contentType: "application/json" },
      onlyIf: current.etag ? { etagMatches: current.etag } : undefined,
    });
    if (put) {
      console.log(JSON.stringify({ event: "board_write", name: entry.name, points: entry.points }));
      return next;
    }
  }
  const latest = await readBoard(bucket);
  return latest.board;
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
      const current = await readBoard(env.BOARD);
      return json(publicBoard(current.board));
    }
    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Expected a JSON body." }, 400);
      }
      const entry = parseEntry(body, todayUtc(new Date()));
      if (!entry) return json({ error: "Use a 2 to 12 letter name and a score up to 3200." }, 400);
      const board = await writeScore(env.BOARD, entry);
      return json(publicBoard(board));
    }
    return json({ error: "Method not allowed." }, 405);
  },
};
