import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/16QH0tMVimEtlXiPecqDgBKU12w9MgUxxvCF7mtcx9Vw/export?format=csv&gid=0";
const DEFAULT_GENDER_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1-NR8Gj2Q7VAyVvTy1uZqeIw1DUIP6HQB-VMAaO2SFeA/export?format=csv&gid=1603531679";
const DEFAULT_HEADCOUNT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1e62XLMlbaKXmM-Y1TwZBTTvjQKcY_1Ocqo9_HnTnJAU/export?format=csv&gid=2121289725";
const CACHE_TTL_MS = 60_000;
const DEFAULT_COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#ec4899"];
const SCORE_TIE_EPSILON = 1e-9;
const TUG_EVENT_START_DATE = "2026-03-16";
const TUG_EVENT_END_DATE = "2026-03-22";

let cache = { expiresAt: 0, payload: null, sheetUrl: "" };
let workforceCache = { expiresAt: 0, data: null, cacheKey: "" };
const inflightRequests = new Map();

function getSheetUrl(sheetUrl) {
  return sheetUrl || process.env.SHEET_URL || DEFAULT_SHEET_URL;
}

function getHeadcountSheetUrl() {
  return process.env.HEADCOUNT_SHEET_URL || DEFAULT_HEADCOUNT_SHEET_URL;
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

function parseFlexibleDate(value) {
  return parseIsoDate(value) || parseUsDate(value);
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

const TEAMS_COMPETITION_START_DATE = "2026-03-16";
const TEAMS_COMPETITION_END_DATE = "2026-03-19";

function resolveTugEventRange(anchorDate) {
  const eventStart = parseIsoDate(TUG_EVENT_START_DATE);
  const eventEnd = parseIsoDate(TUG_EVENT_END_DATE);

  if (!eventStart || !eventEnd) {
    return { start: anchorDate, end: anchorDate };
  }

  const safeAnchor = anchorDate || eventStart;
  const cappedEnd = safeAnchor < eventEnd ? safeAnchor : eventEnd;

  return {
    start: eventStart,
    end: cappedEnd < eventStart ? eventStart : cappedEnd,
  };
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
  copy.setUTCDate(copy.getUTCDate() + 6);
  return copy;
}

function resolveTeamsCompetitionRange(anchorDate) {
  const eventStart = parseIsoDate(TEAMS_COMPETITION_START_DATE);
  const eventEnd = parseIsoDate(TEAMS_COMPETITION_END_DATE);

  if (!eventStart || !eventEnd) {
    return { start: anchorDate, end: anchorDate };
  }

  const safeAnchor = anchorDate || eventEnd;
  const cappedEnd = safeAnchor < eventEnd ? safeAnchor : eventEnd;

  return {
    start: eventStart,
    end: cappedEnd < eventStart ? eventStart : cappedEnd,
  };
}

function normalizeRange(period, anchor, options = {}) {
  if (options.fixedRange?.start && options.fixedRange?.end) {
    return {
      period,
      start: options.fixedRange.start,
      end: options.fixedRange.end,
      label: options.label || "Semana",
    };
  }

  if (period === "week") {
    const start = startOfWorkWeek(anchor);
    const weekEnd = endOfWorkWeek(anchor);
    const end = anchor < weekEnd ? anchor : weekEnd;
    return { period, start, end, label: "Semana" };
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

function getConfigVersion(config) {
  const version = Number(config?.version);
  return Number.isFinite(version) && version > 0 ? version : 0;
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

function normalizeGenderLabel(value) {
  const label = normalizePersonKey(value);
  if (!label) return "";
  if (["hombre", "male", "m", "man", "boy", "boys"].includes(label)) return "m";
  if (["mujer", "female", "f", "woman", "girl", "girls"].includes(label)) return "f";
  return "";
}

function parsePresenceFlag(value) {
  const normalized = normalizePersonKey(value);
  if (!normalized) return null;
  if (["1", "true", "si", "yes", "y", "present", "presente", "activo", "active", "work", "working", "x"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "absent", "ausente", "off", "pto", "vacaciones"].includes(normalized)) {
    return false;
  }
  return true;
}

function headerIndex(header, names) {
  return names.findIndex((name) => header.includes(name));
}

function readHeaderIndex(header, names) {
  const idx = headerIndex(header, names);
  return idx === -1 ? -1 : header.indexOf(names[idx]);
}

async function fetchCsvRows(url) {
  if (inflightRequests.has(url)) return inflightRequests.get(url);

  const promise = (async () => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "sales-grand-prix/1.0" },
      });
      if (!response.ok) {
        throw new Error(`No se pudo descargar el sheet (${response.status})`);
      }
      const csvText = await response.text();
      return parseCsv(csvText);
    } finally {
      inflightRequests.delete(url);
    }
  })();

  inflightRequests.set(url, promise);
  return promise;
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
  let current = null;
  try {
    current = await teamStore.read();
  } catch {
    current = null;
  }

  if (isValidTeamConfig(current)) {
    if (isValidTeamConfig(seedConfig) && getConfigVersion(seedConfig) > getConfigVersion(current)) {
      const seeded = cloneConfig(seedConfig);
      try {
        await teamStore.write(seeded);
      } catch {
        // Si Blobs falla, degradamos a la configuracion incluida para no tumbar la app publica.
      }
      return seeded;
    }

    return current;
  }

  if (isValidTeamConfig(seedConfig)) {
    const seeded = cloneConfig(seedConfig);
    try {
      await teamStore.write(seeded);
    } catch {
      // Si Blobs falla, degradamos a la configuracion incluida para no tumbar la app publica.
    }
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

  try {
    await teamStore.write(config);
  } catch {
    // Mantiene la app operativa aunque el store remoto no acepte la escritura en este request.
  }
  return config;
}

const CAMPAIGN_MAP = {
  radio: "radio",
  "cd at-media": "atmedia",
  "at-media": "atmedia",
  "at media": "atmedia",
};

function classifyCampaign(subId) {
  const lower = subId.toLowerCase().trim();
  if (!lower) return "";
  if (CAMPAIGN_MAP[lower]) return CAMPAIGN_MAP[lower];
  return "ecomfy";
}

const EXCLUDED_AGENTS = new Set([
  "lelis hernandez",
  "karla vazquez",
  "joel trejo",
].map(normalizePersonKey));

const EXCLUDED_FROM_ECOMFY = new Set([
  "axel silva",
  "axel vazquez",
  "melissa",
  "paloma",
].map(normalizePersonKey));

const FORCED_ECOMFY_ROSTER = [
  "Jhasua Angeles",
  "Yuridia Moreno",
  "Damariz Solis",
  "Viridiana Bandala",
];

function isExcludedFromEcomfy(name) {
  const key = normalizePersonKey(name);
  return [...EXCLUDED_FROM_ECOMFY].some((ex) => key.includes(ex) || ex.includes(key));
}

function computeInboundLevels(entries, rosterNames, anchorDate) {
  const monthStart = startOfMonth(anchorDate);
  const monthEnd = anchorDate;

  const agentCampaigns = new Map();

  // Seed with all roster agents so everyone shows up even with 0 sales
  for (const name of rosterNames) {
    if (EXCLUDED_AGENTS.has(normalizePersonKey(name))) continue;
    agentCampaigns.set(normalizePersonKey(name), {
      displayName: name,
      ecomfy: 0,
      radio: 0,
      atmedia: 0,
    });
  }

  const agents = [];
  for (const [, record] of agentCampaigns) {
    agents.push({
      agent: record.displayName,
      ecomfy: isExcludedFromEcomfy(record.displayName) ? 0 : 1,
      radio: 1,
      atmedia: 1,
    });
  }

  return agents;
}

async function loadSheetData(sheetUrl) {
  const resolvedSheetUrl = getSheetUrl(sheetUrl);
  if (cache.payload && cache.sheetUrl === resolvedSheetUrl && Date.now() < cache.expiresAt) {
    return cache.payload;
  }

  const [header = [], ...rows] = await fetchCsvRows(resolvedSheetUrl);

  const indexOf = (name) => header.indexOf(name);
  const dateIdx = indexOf("Date");
  const agentIdx = indexOf("Agent");
  const supervisorIdx = indexOf("Supervisor");
  const teamIdx = indexOf("Team");
  const amountIdx = indexOf("Client's debt amount");
  const subIdIdx = indexOf("Sub - ID");

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

      const subId = subIdIdx !== -1 ? String(row[subIdIdx] || "").trim() : "";

      return {
        date: parseUsDate(row[dateIdx]),
        agent,
        amount,
        campaign: classifyCampaign(subId),
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

function mergeWorkforceData(base, extra) {
  for (const [key, value] of extra.genderMap) {
    base.genderMap.set(key, value);
  }
  base.attendanceEntries.push(...extra.attendanceEntries);
  return base;
}

function parseWorkforceRows(rows) {
  const [header = [], ...dataRows] = rows;
  const nameIdx = readHeaderIndex(header, ["Nombre completo", "Agent", "Agente", "Nombre"]);
  const labelIdx = readHeaderIndex(header, ["Etiqueta", "Gender", "Genero", "Género"]);
  const dateIdx = readHeaderIndex(header, ["Date", "Fecha"]);
  const presentIdx = readHeaderIndex(header, ["Present", "Presente", "Asistencia", "Working"]);
  const teamIdx = readHeaderIndex(header, ["Team", "Equipo"]);

  const parsed = {
    genderMap: new Map(),
    attendanceEntries: [],
  };

  if (nameIdx === -1) return parsed;

  for (const row of dataRows) {
    const name = String(row[nameIdx] || "").trim();
    if (!name) continue;

    const normalizedName = normalizePersonKey(name);
    const gender = labelIdx !== -1 ? normalizeGenderLabel(row[labelIdx]) : "";
    if (gender) parsed.genderMap.set(normalizedName, gender);

    if (dateIdx === -1) continue;

    const date = parseFlexibleDate(row[dateIdx]);
    if (!date) continue;

    parsed.attendanceEntries.push({
      agent: name,
      date,
      present: presentIdx === -1 ? true : parsePresenceFlag(row[presentIdx]),
      gender,
      team: teamIdx === -1 ? "" : String(row[teamIdx] || "").trim(),
    });
  }

  return parsed;
}

async function loadWorkforceData() {
  const headcountUrl = getHeadcountSheetUrl();
  const genderUrl = process.env.GENDER_SHEET_URL || DEFAULT_GENDER_SHEET_URL;
  const urls = [...new Set([headcountUrl, genderUrl].filter(Boolean))];
  const cacheKey = urls.join("|");

  if (workforceCache.data && workforceCache.cacheKey === cacheKey && Date.now() < workforceCache.expiresAt) {
    return workforceCache.data;
  }

  const workforceData = {
    genderMap: new Map(),
    attendanceEntries: [],
  };

  for (const url of urls) {
    try {
      const rows = await fetchCsvRows(url);
      mergeWorkforceData(workforceData, parseWorkforceRows(rows));
    } catch {
      // Si uno de los sheets falla, seguimos con el resto para no tumbar el dashboard.
    }
  }

  workforceCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: workforceData,
    cacheKey,
  };

  return workforceData;
}

function resolveLatestWorkforceDate(workforceData, fallbackDate) {
  let latestDate = fallbackDate;

  for (const attendance of workforceData.attendanceEntries) {
    if (!attendance?.date || attendance.present === null) continue;
    if (!latestDate || attendance.date > latestDate) {
      latestDate = attendance.date;
    }
  }

  return latestDate || fallbackDate;
}

function computeAttendanceCompetition(entries, workforceData, start, end, agentMeta = new Map(), teamConfig = { teams: {}, assignments: {} }) {
  const salesCounts = new Map();
  const salesAmounts = new Map();
  const displayNames = new Map();
  const attendanceDays = new Map();
  const genderByAgent = new Map(workforceData.genderMap);
  const teamByAgent = new Map();

  for (const entry of entries) {
    if (entry.date < start || entry.date > end) continue;
    const agentKey = normalizePersonKey(entry.agent);
    if (!agentKey) continue;
    displayNames.set(agentKey, displayNames.get(agentKey) || entry.agent);
    salesCounts.set(agentKey, (salesCounts.get(agentKey) || 0) + 1);
    salesAmounts.set(agentKey, (salesAmounts.get(agentKey) || 0) + (entry.amount || 0));
  }

  for (const attendance of workforceData.attendanceEntries) {
    if (!attendance.present || attendance.date < start || attendance.date > end) continue;
    const agentKey = normalizePersonKey(attendance.agent);
    if (!agentKey) continue;

    displayNames.set(agentKey, displayNames.get(agentKey) || attendance.agent);
    if (attendance.gender) {
      genderByAgent.set(agentKey, attendance.gender);
    }
    if (attendance.team) {
      teamByAgent.set(agentKey, attendance.team);
    }

    if (!attendanceDays.has(agentKey)) attendanceDays.set(agentKey, new Set());
    attendanceDays.get(agentKey).add(isoDate(attendance.date));
  }

  const groups = {
    m: { agents: 0, totalAverage: 0, totalAmount: 0, totalDeals: 0, attendanceDays: 0 },
    f: { agents: 0, totalAverage: 0, totalAmount: 0, totalDeals: 0, attendanceDays: 0 },
  };
  const agents = [];

  for (const [agentKey, dates] of attendanceDays.entries()) {
    const workedDays = dates.size;
    if (!workedDays) continue;

    const gender = genderByAgent.get(agentKey) || "";
    if (gender !== "m" && gender !== "f") continue;

    const deals = salesCounts.get(agentKey) || 0;
    const amount = salesAmounts.get(agentKey) || 0;
    const average = deals / workedDays;
    const group = groups[gender];

    group.agents += 1;
    group.totalAverage += average;
    group.totalAmount += amount;
    group.totalDeals += deals;
    group.attendanceDays += workedDays;

    const agentName = displayNames.get(agentKey) || agentKey;
    const meta = agentMeta.get(agentName) || {};
    const team = teamByAgent.get(agentKey) || resolveTeamForAgent(agentName, meta, teamConfig);
    agents.push({
      agent: agentName,
      gender,
      team,
      deals,
      amount,
      attendanceDays: workedDays,
      average,
    });
  }

  const boysAverage = groups.m.agents ? groups.m.totalAverage / groups.m.agents : 0;
  const girlsAverage = groups.f.agents ? groups.f.totalAverage / groups.f.agents : 0;
  const tiedOnAverage = Math.abs(boysAverage - girlsAverage) < SCORE_TIE_EPSILON;

  let source = "average";
  let boysWeight = boysAverage;
  let girlsWeight = girlsAverage;

  if (tiedOnAverage) {
    source = "amount_tiebreak";
    boysWeight = groups.m.totalAmount;
    girlsWeight = groups.f.totalAmount;
  }

  const totalWeight = boysWeight + girlsWeight;
  const boys = totalWeight > 0 ? Math.round((boysWeight / totalWeight) * 100) : 50;
  const girls = totalWeight > 0 ? 100 - boys : 50;
  const rankedAgents = agents
    .sort((a, b) => {
      if (b.average !== a.average) return b.average - a.average;
      if (b.deals !== a.deals) return b.deals - a.deals;
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.agent.localeCompare(b.agent, "es");
    })
    .map((agent, index) => ({
      ...agent,
      rank: index + 1,
    }));

  return {
    hasAttendance: attendanceDays.size > 0,
    activeAgents: groups.m.agents + groups.f.agents,
    tugOfWar: {
      boys,
      girls,
      source,
      averages: {
        boys: boysAverage,
        girls: girlsAverage,
      },
      amounts: {
        boys: groups.m.totalAmount,
        girls: groups.f.totalAmount,
      },
      attendance: {
        boysAgents: groups.m.agents,
        girlsAgents: groups.f.agents,
        totalDays: groups.m.attendanceDays + groups.f.attendanceDays,
      },
      agents: rankedAgents,
    },
  };
}

function buildRace(entries, agentMeta, teamConfig, period, anchorDate, genderMap, rangeOptions = {}) {
  const { start, end, label } = normalizeRange(period, anchorDate, rangeOptions);
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

export async function createRacePayload({ period, anchor, refresh, teamStore, sheetUrl, seedConfig, view }) {
  if (refresh) cache.expiresAt = 0;

  const data = await loadSheetData(sheetUrl);
  const teamConfig = await ensureTeamConfig(data.agentMeta, teamStore, seedConfig);
  const parsedAnchor = anchor ? parseIsoDate(anchor) : null;
  const anchorDate = parsedAnchor
    ? clampAnchor(parsedAnchor, data.earliestDate, data.latestDate)
    : data.latestDate;

  const workforceData = await loadWorkforceData();
  const isTeamsView = view === "teams";
  const resolvedPeriod = isTeamsView ? "week" : normalizePeriod(period);
  const rangeOptions = isTeamsView
    ? {
        fixedRange: resolveTeamsCompetitionRange(anchorDate),
        label: "Semana Teams",
      }
    : {};
  const race = buildRace(
    data.entries,
    data.agentMeta,
    teamConfig,
    resolvedPeriod,
    anchorDate,
    workforceData.genderMap,
    rangeOptions,
  );

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
  if (refresh) {
    workforceCache.expiresAt = 0;
    cache.expiresAt = 0;
  }

  const data = await loadSheetData(sheetUrl);
  const workforceData = await loadWorkforceData();
  const teamConfig = await ensureTeamConfig(data.agentMeta, teamStore, seedConfig);
  const anchorDate = resolveLatestWorkforceDate(workforceData, data.latestDate);
  const { start, end } = resolveTugEventRange(anchorDate);

  const race = buildRace(data.entries, data.agentMeta, teamConfig, "month", anchorDate, workforceData.genderMap);

  const totalAmount = race.racers.reduce((sum, racer) => sum + (racer.amount || 0), 0);
  const attendanceCompetition = computeAttendanceCompetition(data.entries, workforceData, start, end, data.agentMeta, teamConfig);

  let tugOfWar = attendanceCompetition.tugOfWar;
  let activeAgents = attendanceCompetition.activeAgents;

  if (!attendanceCompetition.hasAttendance) {
    let boysCount = 0;
    let girlsCount = 0;
    for (const racer of race.racers) {
      if (racer.gender === "m") boysCount += racer.count;
      else if (racer.gender === "f") girlsCount += racer.count;
    }
    const genderTotal = boysCount + girlsCount;
    tugOfWar = {
      boys: genderTotal > 0 ? Math.round((boysCount / genderTotal) * 100) : 50,
      girls: genderTotal > 0 ? 100 - Math.round((boysCount / genderTotal) * 100) : 50,
      source: "sales_count_fallback",
      averages: {
        boys: 0,
        girls: 0,
      },
      amounts: {
        boys: 0,
        girls: 0,
      },
      attendance: {
        boysAgents: 0,
        girlsAgents: 0,
        totalDays: 0,
      },
      agents: [],
    };
    activeAgents = race.activeAgents;
  }

  return {
    totalAmount,
    goal: 9_000_000,
    month: race.anchor,
    totalDeals: race.totalEntries,
    activeAgents,
    tugOfWar,
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

export async function createInboundPayload({ refresh, sheetUrl, teamStore, seedConfig }) {
  if (refresh) cache.expiresAt = 0;

  const data = await loadSheetData(sheetUrl);
  const workforceData = await loadWorkforceData();
  const teamConfig = teamStore
    ? await ensureTeamConfig(data.agentMeta, teamStore, seedConfig)
    : { assignments: {} };

  // Build roster from gender sheet (the 26 active agents)
  const rosterNamesMap = new Map();

  for (const key of workforceData.genderMap.keys()) {
    let displayName = key;
    for (const entry of data.entries) {
      if (normalizePersonKey(entry.agent) === key) {
        displayName = entry.agent;
        break;
      }
    }
    rosterNamesMap.set(key, displayName);
  }

  for (const agent of Object.keys(teamConfig.assignments || {})) {
    rosterNamesMap.set(normalizePersonKey(agent), agent);
  }

  for (const agent of FORCED_ECOMFY_ROSTER) {
    rosterNamesMap.set(normalizePersonKey(agent), agent);
  }

  const rosterNames = [...rosterNamesMap.values()];

  const anchorDate = data.latestDate;
  const agents = computeInboundLevels(data.entries, rosterNames, anchorDate);

  return {
    agents,
    month: isoDate(anchorDate),
  };
}

