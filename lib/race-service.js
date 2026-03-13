import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/16QH0tMVimEtlXiPecqDgBKU12w9MgUxxvCF7mtcx9Vw/export?format=csv&gid=0";
const DEFAULT_GENDER_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1-NR8Gj2Q7VAyVvTy1uZqeIw1DUIP6HQB-VMAaO2SFeA/export?format=csv&gid=1603531679";
const CACHE_TTL_MS = 60_000;
const DEFAULT_COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#ec4899"];

let cache = { expiresAt: 0, payload: null, sheetUrl: "" };
let genderCache = { expiresAt: 0, data: null };

function getSheetUrl(sheetUrl) {
  return sheetUrl || process.env.SHEET_URL || DEFAULT_SHEET_URL;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (ch !== "\r") cell += ch;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseUsDate(value) {
  const [month, day, year] = String(value || "").trim().split("/").map(Number);
  if (!month || !day || !year) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIsoDate(value) {
  const [year, month, day] = String(value || "").trim().split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfWorkWeek(date) {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diffToMonday);
  return copy;
}

function endOfWorkWeek(date) {
  const copy = startOfWorkWeek(date);
  copy.setUTCDate(copy.getUTCDate() + 4);
  return copy;
}

function normalizeRange(period, anchor) {
  if (period === "week") {
    const start = startOfWorkWeek(anchor);
    const weekEnd = endOfWorkWeek(anchor);
    const end = anchor < weekEnd ? anchor : weekEnd;
    return { period, start, end, label: "Semana laboral" };
  }

  if (period === "month") {
    return { period, start: startOfMonth(anchor), end: anchor, label: "Mes acumulado" };
  }

  return { period: "day", start: anchor, end: anchor, label: "Dia seleccionado" };
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePersonKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isValidTeamConfig(config) {
  return isPlainObject(config) && isPlainObject(config.teams) && isPlainObject(config.assignments);
}

function findTeamBySupervisor(teamConfig, supervisorName) {
  const target = normalizePersonKey(supervisorName);
  if (!target) return "";

  for (const [team, info] of Object.entries(teamConfig.teams || {})) {
    if (normalizePersonKey(info?.supervisor) === target) return team;
  }

  return "";
}

function resolveTeamForAgent(agent, meta, teamConfig) {
  return (
    teamConfig.assignments[agent] ||
    meta.team ||
    findTeamBySupervisor(teamConfig, meta.supervisor) ||
    findTeamBySupervisor(teamConfig, agent) ||
    "Sin equipo"
  );
}

export function createFileTeamStore(teamsFile) {
  return {
    async read() {
      try {
        const raw = await readFile(teamsFile, "utf-8");
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async write(config) {
      await mkdir(path.dirname(teamsFile), { recursive: true });
      await writeFile(teamsFile, JSON.stringify(config, null, 2), "utf-8");
      return config;
    },
  };
}

async function ensureTeamConfig(agentMeta, teamStore, seedConfig) {
  const current = await teamStore.read();
  if (isValidTeamConfig(current)) return current;

  if (isValidTeamConfig(seedConfig)) {
    const seeded = cloneConfig(seedConfig);
    await teamStore.write(seeded);
    return seeded;
  }

  const config = { teams: {}, assignments: {} };
  const teamList = [];

  for (const [agent, meta] of agentMeta) {
    if (!meta.team) continue;

    if (!config.teams[meta.team]) {
      config.teams[meta.team] = {
        color: DEFAULT_COLORS[teamList.length % DEFAULT_COLORS.length],
        supervisor: meta.supervisor || "",
      };
      teamList.push(meta.team);
    }

    config.assignments[agent] = meta.team;

    if (meta.supervisor && !config.teams[meta.team].supervisor) {
      config.teams[meta.team].supervisor = meta.supervisor;
    }
  }

  if (!teamList.length) {
    config.teams["Equipo 1"] = { color: "#3b82f6", supervisor: "" };
    config.teams["Equipo 2"] = { color: "#f59e0b", supervisor: "" };
    config.teams["Equipo 3"] = { color: "#ef4444", supervisor: "" };
  }

  await teamStore.write(config);
  return config;
}

async function loadSheetData(sheetUrl) {
  const resolvedSheetUrl = getSheetUrl(sheetUrl);
  if (cache.payload && cache.sheetUrl === resolvedSheetUrl && Date.now() < cache.expiresAt) {
    return cache.payload;
  }

  const response = await fetch(resolvedSheetUrl, {
    headers: { "User-Agent": "sales-grand-prix/1.0" },
  });

  if (!response.ok) {
    throw new Error(`No se pudo descargar el sheet (${response.status})`);
  }

  const csvText = await response.text();
  const [header = [], ...rows] = parseCsv(csvText);

  const indexOf = (name) => header.indexOf(name);
  const dateIdx = indexOf("Date");
  const agentIdx = indexOf("Agent");
  const supervisorIdx = indexOf("Supervisor");
  const teamIdx = indexOf("Team");
  const amountIdx = indexOf("Client's debt amount");

  if (dateIdx === -1 || agentIdx === -1) {
    throw new Error("El sheet no incluye las columnas Date y Agent");
  }

  const agentMeta = new Map();
  const entries = rows
    .map((row) => {
      const agent = String(row[agentIdx] || "").trim();
      const team = teamIdx !== -1 ? String(row[teamIdx] || "").trim() : "";
      const supervisor = supervisorIdx !== -1 ? String(row[supervisorIdx] || "").trim() : "";
      const rawAmount = amountIdx !== -1 ? String(row[amountIdx] || "").trim() : "";
      const amount = parseFloat(rawAmount.replace(/[^0-9.\-]/g, "")) || 0;

      if (agent && (team || supervisor)) {
        agentMeta.set(agent, { team, supervisor });
      }

      return {
        date: parseUsDate(row[dateIdx]),
        agent,
        amount,
      };
    })
    .filter((entry) => entry.date && entry.agent);

  entries.sort((a, b) => a.date - b.date);

  const latestDate = entries.at(-1)?.date || new Date();
  const earliestDate = entries[0]?.date || latestDate;

  const payload = {
    entries,
    agentMeta,
    latestDate,
    earliestDate,
    totalRows: entries.length,
  };

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
    sheetUrl: resolvedSheetUrl,
  };

  return payload;
}

async function loadGenderData() {
  if (genderCache.data && Date.now() < genderCache.expiresAt) {
    return genderCache.data;
  }

  try {
    const url = process.env.GENDER_SHEET_URL || DEFAULT_GENDER_SHEET_URL;
    const response = await fetch(url, {
      headers: { "User-Agent": "sales-grand-prix/1.0" },
    });
    if (!response.ok) return new Map();

    const csvText = await response.text();
    const [header = [], ...rows] = parseCsv(csvText);

    const nameIdx = header.indexOf("Nombre completo");
    const labelIdx = header.indexOf("Etiqueta");
    if (nameIdx === -1 || labelIdx === -1) return new Map();

    const genderMap = new Map();
    for (const row of rows) {
      const name = String(row[nameIdx] || "").trim();
      const label = String(row[labelIdx] || "").trim().toLowerCase();
      if (name && (label === "hombre" || label === "mujer")) {
        genderMap.set(normalizePersonKey(name), label === "hombre" ? "m" : "f");
      }
    }

    genderCache = { expiresAt: Date.now() + CACHE_TTL_MS, data: genderMap };
    return genderMap;
  } catch {
    return new Map();
  }
}

function buildRace(entries, agentMeta, teamConfig, period, anchorDate, genderMap) {
  const { start, end, label } = normalizeRange(period, anchorDate);
  const counts = new Map();
  const amounts = new Map();

  for (const entry of entries) {
    if (entry.date < start || entry.date > end) continue;
    counts.set(entry.agent, (counts.get(entry.agent) || 0) + 1);
    amounts.set(entry.agent, (amounts.get(entry.agent) || 0) + (entry.amount || 0));
  }

  const ranking = [...counts.entries()]
    .map(([agent, count]) => {
      const meta = agentMeta.get(agent) || {};
      const team = resolveTeamForAgent(agent, meta, teamConfig);
      const info = teamConfig.teams[team] || { color: "#888", supervisor: "" };

      return {
        agent,
        count,
        amount: amounts.get(agent) || 0,
        team,
        teamColor: info.color,
        supervisor: info.supervisor,
        colorHue: hashString(agent),
        gender: (genderMap || new Map()).get(normalizePersonKey(agent)) || "",
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.agent.localeCompare(b.agent, "es");
    })
    .map((item, index, list) => {
      const leaderCount = list[0]?.count || 1;
      return {
        ...item,
        rank: index + 1,
        gap: leaderCount - item.count,
        progress: leaderCount === 0 ? 0 : item.count / leaderCount,
      };
    });

  const teamMap = {};
  for (const racer of ranking) {
    if (!teamMap[racer.team]) {
      teamMap[racer.team] = {
        count: 0,
        amount: 0,
        agents: 0,
        color: racer.teamColor,
        supervisor: racer.supervisor,
      };
    }

    teamMap[racer.team].count += racer.count;
    teamMap[racer.team].amount += racer.amount;
    teamMap[racer.team].agents += 1;
  }

  const teamStandings = Object.entries(teamMap)
    .map(([team, data]) => ({ team, ...data }))
    .sort((a, b) => b.count !== a.count ? b.count - a.count : b.amount - a.amount)
    .map((team, index) => ({ ...team, rank: index + 1 }));

  return {
    period,
    label,
    start: isoDate(start),
    end: isoDate(end),
    anchor: isoDate(anchorDate),
    totalEntries: ranking.reduce((sum, racer) => sum + racer.count, 0),
    activeAgents: ranking.length,
    leaderCount: ranking[0]?.count || 0,
    teamStandings,
    racers: ranking,
  };
}

function clampAnchor(anchor, earliestDate, latestDate) {
  return new Date(Math.min(Math.max(anchor.getTime(), earliestDate.getTime()), latestDate.getTime()));
}

function normalizePeriod(period) {
  return ["day", "week", "month"].includes(period) ? period : "day";
}

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function createRacePayload({ period, anchor, refresh, teamStore, sheetUrl, seedConfig }) {
  if (refresh) cache.expiresAt = 0;

  const data = await loadSheetData(sheetUrl);
  const teamConfig = await ensureTeamConfig(data.agentMeta, teamStore, seedConfig);
  const parsedAnchor = anchor ? parseIsoDate(anchor) : null;
  const anchorDate = parsedAnchor
    ? clampAnchor(parsedAnchor, data.earliestDate, data.latestDate)
    : data.latestDate;

  const genderMap = await loadGenderData();
  const race = buildRace(data.entries, data.agentMeta, teamConfig, normalizePeriod(period), anchorDate, genderMap);

  return {
    meta: {
      latestDate: isoDate(data.latestDate),
      earliestDate: isoDate(data.earliestDate),
      totalRows: data.totalRows,
    },
    race,
  };
}

export async function createJackpotPayload({ refresh, teamStore, sheetUrl, seedConfig }) {
  const payload = await createRacePayload({
    period: "month",
    anchor: null,
    refresh,
    teamStore,
    sheetUrl,
    seedConfig,
  });

  const totalAmount = payload.race.racers.reduce((sum, racer) => sum + (racer.amount || 0), 0);

  let boysCount = 0;
  let girlsCount = 0;
  for (const racer of payload.race.racers) {
    if (racer.gender === "m") boysCount += racer.count;
    else if (racer.gender === "f") girlsCount += racer.count;
  }
  const genderTotal = boysCount + girlsCount;

  return {
    totalAmount,
    goal: 9_000_000,
    month: payload.race.anchor,
    totalDeals: payload.race.totalEntries,
    activeAgents: payload.race.activeAgents,
    tugOfWar: {
      boys: genderTotal > 0 ? Math.round((boysCount / genderTotal) * 100) : 50,
      girls: genderTotal > 0 ? Math.round((girlsCount / genderTotal) * 100) : 50,
    },
  };
}

export async function createTeamsPayload({ teamStore, sheetUrl, seedConfig }) {
  const data = await loadSheetData(sheetUrl);
  const config = await ensureTeamConfig(data.agentMeta, teamStore, seedConfig);

  const assignments = {};

  for (const [agent, meta] of data.agentMeta) {
    assignments[agent] = resolveTeamForAgent(agent, meta, config);
  }

  for (const [agent, team] of Object.entries(config.assignments)) {
    if (!assignments[agent]) assignments[agent] = team;
  }

  for (const [team, info] of Object.entries(config.teams)) {
    const supervisor = String(info?.supervisor || "").trim();
    if (!supervisor) continue;
    if (!assignments[supervisor]) assignments[supervisor] = team;
  }

  return {
    teams: config.teams,
    assignments,
  };
}

function sanitizeAssignments(assignments) {
  if (!isPlainObject(assignments)) {
    throw new Error("Assignments invalidos");
  }

  const cleanAssignments = {};

  for (const [agent, team] of Object.entries(assignments)) {
    const cleanAgent = String(agent || "").trim();
    const cleanTeam = String(team || "").trim();
    if (!cleanAgent || !cleanTeam) continue;
    cleanAssignments[cleanAgent] = cleanTeam;
  }

  return cleanAssignments;
}

export async function saveTeamAssignments({ assignments, teamStore, sheetUrl, seedConfig }) {
  const data = await loadSheetData(sheetUrl);
  const config = await ensureTeamConfig(data.agentMeta, teamStore, seedConfig);

  config.assignments = sanitizeAssignments(assignments);
  await teamStore.write(config);

  return { ok: true };
}

