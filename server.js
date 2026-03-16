import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createGzip } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import seedTickerConfig from "./data/ticker.json" with { type: "json" };

import {
  createFileJsonStore,
  createInboundPayload,
  createJackpotPayload,
  createRacePayload,
  createTickerPayload,
  createTeamsPayload,
  saveTickerMessages,
  saveTeamAssignments,
} from "./lib/race-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const teamsFile = path.join(__dirname, "data", "teams.json");
const tickerFile = path.join(__dirname, "data", "ticker.json");

const PORT = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const teamStore = createFileJsonStore(teamsFile);
const tickerStore = createFileJsonStore(tickerFile);

const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".svg"]);

function sendJson(res, status, body, req) {
  const json = JSON.stringify(body);
  const acceptGzip = req && String(req.headers["accept-encoding"] || "").includes("gzip");

  if (acceptGzip && json.length > 1024) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Cache-Control": "no-store",
    });
    const gz = createGzip();
    gz.pipe(res);
    gz.end(json);
  } else {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(json);
  }
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function getErrorStatus(error) {
  return Number(error?.statusCode) || 500;
}

function getErrorBody(error) {
  const body = { error: error?.message || "Error interno" };
  if (error?.details) body.current = error.details;
  return body;
}

async function handleApiRace(url, req, res) {
  try {
    const payload = await createRacePayload({
      period: url.searchParams.get("period"),
      anchor: url.searchParams.get("anchor"),
      view: url.searchParams.get("view"),
      refresh: url.searchParams.get("refresh") === "1",
      teamStore,
      sheetUrl: process.env.SHEET_URL,
    });

    sendJson(res, 200, payload, req);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleTeamsGet(req, res) {
  try {
    const payload = await createTeamsPayload({
      teamStore,
      sheetUrl: process.env.SHEET_URL,
    });

    sendJson(res, 200, payload, req);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleTeamsPost(req, res) {
  try {
    const body = JSON.parse(await getBody(req));
    const payload = await saveTeamAssignments({
      assignments: body?.assignments,
      teamStore,
      sheetUrl: process.env.SHEET_URL,
    });

    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleTickerGet(req, res) {
  try {
    const payload = await createTickerPayload({
      tickerStore,
      seedConfig: seedTickerConfig,
    });

    sendJson(res, 200, payload, req);
  } catch (error) {
    sendJson(res, getErrorStatus(error), getErrorBody(error), req);
  }
}

async function handleTickerPost(req, res) {
  try {
    const body = JSON.parse(await getBody(req));
    const payload = await saveTickerMessages({
      items: body?.items,
      baseVersion: body?.baseVersion,
      tickerStore,
      seedConfig: seedTickerConfig,
    });

    sendJson(res, 200, payload, req);
  } catch (error) {
    sendJson(res, getErrorStatus(error), getErrorBody(error), req);
  }
}

async function serveStatic(filePath, req, res) {
  try {
    const resolved = path.join(publicDir, filePath === "/" ? "index.html" : filePath);
    const safe = path.normalize(resolved);
    if (!safe.startsWith(publicDir)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const ext = path.extname(safe);
    const content = await readFile(safe);
    const acceptGzip = String(req.headers["accept-encoding"] || "").includes("gzip");

    if (acceptGzip && COMPRESSIBLE.has(ext) && content.length > 1024) {
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Content-Encoding": "gzip",
        "Cache-Control": ext === ".html" ? "no-store" : ext === ".png" || ext === ".ico" ? "public, max-age=86400" : "public, max-age=3600",
      });
      const gz = createGzip();
      gz.pipe(res);
      gz.end(content);
    } else {
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": ext === ".html" ? "no-store" : ext === ".png" || ext === ".ico" ? "public, max-age=86400" : "public, max-age=3600",
      });
      res.end(content);
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/race") return handleApiRace(url, req, res);

  if (url.pathname === "/api/jackpot") {
    try {
      const payload = await createJackpotPayload({
        refresh: url.searchParams.get("refresh") === "1",
        teamStore,
        sheetUrl: process.env.SHEET_URL,
      });
      sendJson(res, 200, payload, req);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/inbound") {
    try {
      const payload = await createInboundPayload({
        refresh: url.searchParams.get("refresh") === "1",
        sheetUrl: process.env.SHEET_URL,
        teamStore,
      });
      sendJson(res, 200, payload, req);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/teams") {
    return req.method === "POST" ? handleTeamsPost(req, res) : handleTeamsGet(req, res);
  }

  if (url.pathname === "/api/ticker") {
    return req.method === "POST" ? handleTickerPost(req, res) : handleTickerGet(req, res);
  }

  await serveStatic(url.pathname === "/" ? "/" : decodeURIComponent(url.pathname), req, res);
});

// Pre-warm: fetch sheet data on startup so first request is instant
createRacePayload({ period: "day", teamStore, sheetUrl: process.env.SHEET_URL }).catch(() => {});

server.listen(PORT, () => {
  console.log(`Sales Grand Prix listening on http://localhost:${PORT}`);
});
