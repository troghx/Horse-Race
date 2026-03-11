import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFileTeamStore,
  createRacePayload,
  createTeamsPayload,
  saveTeamAssignments,
} from "./lib/race-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const teamsFile = path.join(__dirname, "data", "teams.json");

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

const teamStore = createFileTeamStore(teamsFile);

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function handleApiRace(url, res) {
  try {
    const payload = await createRacePayload({
      period: url.searchParams.get("period"),
      anchor: url.searchParams.get("anchor"),
      refresh: url.searchParams.get("refresh") === "1",
      teamStore,
      sheetUrl: process.env.SHEET_URL,
    });

    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleTeamsGet(res) {
  try {
    const payload = await createTeamsPayload({
      teamStore,
      sheetUrl: process.env.SHEET_URL,
    });

    sendJson(res, 200, payload);
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

async function serveStatic(filePath, res) {
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
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/race") return handleApiRace(url, res);

  if (url.pathname === "/api/teams") {
    return req.method === "POST" ? handleTeamsPost(req, res) : handleTeamsGet(res);
  }

  await serveStatic(url.pathname === "/" ? "/" : decodeURIComponent(url.pathname), res);
});

server.listen(PORT, () => {
  console.log(`Sales Grand Prix listening on http://localhost:${PORT}`);
});
