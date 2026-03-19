import {
  clearStoredAdminPin,
  createAdminAuthModal,
  getStoredAdminPin,
  requestAdminJson,
  validateStoredAdminPin,
} from "./admin-session.js?v=20260317-admin-3";

const state = {
  period: "day",
  individualPeriod: "day",
  anchorDate: "",
  latestDate: "",
  earliestDate: "",
  latestRace: null,
  viewMode: localStorage.getItem("grand_prix_view_mode_v1") === "teams" ? "teams" : "individual",
};

const $ = (s) => document.querySelector(s);
const rangeLabel = $("#rangeLabel");
const track = $("#track");
const leaderboardBody = $("#leaderboardBody");
const leaderboardEyebrow = $("#leaderboardEyebrow");
const leaderboardTitle = $("#leaderboardTitle");
const leaderboardHeadRow = $("#leaderboardHeadRow");
const tickerText = $("#tickerText");
const anchorDateInput = $("#anchorDate");
const refreshButton = $("#refreshButton");
const periodSwitcher = $("#periodSwitcher");
const viewSwitcher = $("#viewSwitcher");
const themeToggle = $("#themeToggle");
const teamBar = $("#teamBar");
const leaderBanner = $("#leaderBanner");
const teamRaceCountdownValue = $("#teamRaceCountdownValue");
const winnerSplash = $("#winnerSplash");
const winnerSplashClose = $("#winnerSplashClose");
const winnerSplashTitle = $("#winnerSplashTitle");
const winnerSplashMeta = $("#winnerSplashMeta");
const winnerSplashAvatar = $("#winnerSplashAvatar");
const winnerSplashSupervisor = $("#winnerSplashSupervisor");
const winnerSplashDeals = $("#winnerSplashDeals");
const winnerSplashEnter = $("#winnerSplashEnter");
const adminAccessButton = $("#adminAccessButton");
const prizeModeButton = $("#prizeModeButton");
const VIEW_MODE_KEY = "grand_prix_view_mode_v1";
const TICKER_GAP_MS = 900;
const TICKER_SPEED_PX_PER_SEC = 160;
const TICKER_SYNC_MS = 30000;
const TICKER_IDLE_MS = 60000;
const TICKER_ACTIVITY_THROTTLE_MS = 10000;
const TICKER_REQUEST_TIMEOUT_MS = 12000;
const MAX_TICKER_LINES = 10;
const TEAMS_COMPETITION_START = "2026-03-16";
const TEAMS_COMPETITION_END = "2026-03-19";
const TEAM_RACE_TIME_ZONE = "America/Cancun";
const TEAMS_WINNER_REVEAL_DATE = "2026-03-20";
const TEAMS_WINNER_SPLASH_STORAGE_KEY = `grand_prix_teams_winner_seen_${TEAMS_WINNER_REVEAL_DATE}`;
const TEAMS_WINNER_SPLASH_AVATAR = "/AvatarSBKS.png?v=20260316-1322";
const PRIZE_SLOTS = new Set(["gold", "silver", "bronze"]);
const TEAMS_COMPETITION_HINT = `La competencia por teams usa el corte fijo del ${TEAMS_COMPETITION_START} al ${TEAMS_COMPETITION_END}.`;
const prizeState = {
  active: false,
  editorSlot: "",
  draftAmount: "",
  awards: {},
  podiumRacers: [],
  version: 0,
  updatedAt: "",
  inputError: "",
  syncPromise: null,
};
const teamsWinnerSplashState = {
  open: false,
  loadingPromise: null,
};
const teamRaceCountdownState = {
  timerId: 0,
};
const DEFAULT_TICKER_MESSAGES = [
  "El Team ganador sera recompensado con STARBUCKS!",
  "Se calcula que lloveran 27 ventas para el dia de hoy 🥵",
  "Cash Avengers ya calienta motores para el cierre de hoy.",
  "Ultima hora: cada deal cuenta en la batalla por la cima.",
  "La mesa de control reporta presion maxima en el leaderboard.",
];
const tickerState = {
  items: [],
  index: 0,
  timerId: 0,
  syncTimerId: 0,
  syncPromise: null,
  version: 0,
  updatedAt: "",
  currentDurationMs: 0,
  presenceTimerId: 0,
  presenceActive: false,
  lastActivitySignalAt: 0,
};
const adminAuthModal = createAdminAuthModal();

/* ══ Theme ══ */

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
}

themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

applyTheme(localStorage.getItem("theme") || "light");
setActiveViewMode(state.viewMode);

/* ══ Racer icon ══ */

const MALE_AVATARS = ["/avatar-hombre-0.png", "/avatar-hombre-1.png", "/avatar-hombre-2.png"];
const FEMALE_AVATARS = ["/avatar-mujer-0.png", "/avatar-mujer-1.png"];

function racerIcon(agent, gender) {
  let src = "/avatars.png";
  if (gender === "m") src = MALE_AVATARS[hashString(agent) % MALE_AVATARS.length];
  else if (gender === "f") src = FEMALE_AVATARS[hashString(agent) % FEMALE_AVATARS.length];

  return `
    <span class="racer-avatar" style="--avatar-url:url('${src}')">
      <img src="${src}" class="racer-icon racer-icon--avatar" alt="" draggable="false" />
    </span>`;
}

/* ══ Helpers ══ */

function hashString(v) {
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) % 360;
  return h;
}

const fmtNumber = new Intl.NumberFormat("es-MX");
const fmtMoney = new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = new Intl.DateTimeFormat("es-MX", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const fmtMonthYear = new Intl.DateTimeFormat("es-MX", { year: "numeric", month: "long", timeZone: "UTC" });

function formatNumber(v) { return fmtNumber.format(v); }
function formatMoney(v) { return fmtMoney.format(v); }
function formatDate(v) { return fmtDate.format(new Date(`${v}T00:00:00Z`)); }
function formatMonthYear(v) { return fmtMonthYear.format(new Date(`${v}T00:00:00Z`)); }
function formatLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function padCountdownUnit(value) {
  return String(Math.max(0, value)).padStart(2, "0");
}
function formatCountdown(msRemaining) {
  const safeMs = Math.max(0, msRemaining);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${padCountdownUnit(hours)}:${padCountdownUnit(minutes)}:${padCountdownUnit(seconds)}`;
}
function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}
function getTimeZoneOffsetMs(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const offsetLabel = parts.find((part) => part.type === "timeZoneName")?.value || "GMT+0";
  const match = offsetLabel.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * ((hours * 60) + minutes) * 60_000;
}
function getUtcDateForTimeZoneLocal(timeZone, year, month, day, hour = 0, minute = 0, second = 0) {
  let candidateMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const offsetMs = getTimeZoneOffsetMs(new Date(candidateMs), timeZone);
    const adjustedMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs;
    if (Math.abs(adjustedMs - candidateMs) < 1000) {
      candidateMs = adjustedMs;
      break;
    }
    candidateMs = adjustedMs;
  }
  return new Date(candidateMs);
}
function getTeamRaceMidnightCountdownMs(now = new Date()) {
  const current = getTimeZoneParts(now, TEAM_RACE_TIME_ZONE);
  const nextDayUtc = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const target = getUtcDateForTimeZoneLocal(
    TEAM_RACE_TIME_ZONE,
    nextDayUtc.getUTCFullYear(),
    nextDayUtc.getUTCMonth() + 1,
    nextDayUtc.getUTCDate(),
    0,
    0,
    0,
  );
  return Math.max(target.getTime() - now.getTime(), 0);
}
function renderTeamRaceCountdown() {
  if (!teamRaceCountdownValue) return;
  teamRaceCountdownValue.textContent = formatCountdown(getTeamRaceMidnightCountdownMs());
}
function startTeamRaceCountdown() {
  if (!teamRaceCountdownValue) return;
  renderTeamRaceCountdown();
  if (teamRaceCountdownState.timerId) {
    window.clearInterval(teamRaceCountdownState.timerId);
  }
  teamRaceCountdownState.timerId = window.setInterval(renderTeamRaceCountdown, 1000);
}
function formatShortName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}
function buildTeamEntries(race) {
  const leaderCount = race.teamStandings?.[0]?.count || 0;
  const membersByTeam = new Map();

  for (const racer of race.racers || []) {
    if (!membersByTeam.has(racer.team)) membersByTeam.set(racer.team, []);
    membersByTeam.get(racer.team).push(racer);
  }

  return (race.teamStandings || []).map((team) => {
    const members = (membersByTeam.get(team.team) || []).slice().sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.amount !== a.amount) return b.amount - a.amount;
      return a.agent.localeCompare(b.agent, "es");
    });

    return {
      ...team,
      agent: team.team,
      teamColor: team.color,
      progress: leaderCount ? team.count / leaderCount : 0,
      gap: Math.max(leaderCount - team.count, 0),
      topAgent: members[0]?.agent || "",
      topAgentCount: members[0]?.count || 0,
    };
  });
}

function normalizeTickerMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => String(message || "").trim())
    .filter(Boolean)
    .slice(0, MAX_TICKER_LINES);
}

function areTickerMessagesEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((message, index) => message === right[index]);
}

function normalizeTickerPayload(payload) {
  const items = normalizeTickerMessages(payload?.items);
  const parsedVersion = Number(payload?.version);

  return {
    items: items.length ? items : [...DEFAULT_TICKER_MESSAGES],
    version: Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 0,
    updatedAt: typeof payload?.updatedAt === "string" ? payload.updatedAt : "",
  };
}

function applyTickerPayload(payload, { preserveIndex = true } = {}) {
  const normalized = normalizeTickerPayload(payload);
  const previousItems = tickerState.items.length ? tickerState.items : [...DEFAULT_TICKER_MESSAGES];
  const previousMessage = previousItems[tickerState.index] || "";

  tickerState.items = normalized.items;
  tickerState.version = normalized.version;
  tickerState.updatedAt = normalized.updatedAt;

  if (preserveIndex && previousMessage) {
    const nextIndex = tickerState.items.indexOf(previousMessage);
    tickerState.index = nextIndex === -1 ? 0 : nextIndex;
  } else {
    tickerState.index = 0;
  }

  renderTicker();
  startTickerRotation();
}

async function requestTicker({ method = "GET", body } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TICKER_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/ticker", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || "Error al sincronizar el ticker");
      error.statusCode = response.status;
      error.current = payload.current || null;
      throw error;
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function syncTickerFromServer() {
  if (tickerState.syncPromise) return tickerState.syncPromise;

  const task = (async () => {
    try {
      const payload = normalizeTickerPayload(await requestTicker());
      const hasChanged =
        payload.version !== tickerState.version ||
        !areTickerMessagesEqual(payload.items, tickerState.items);

      if (!hasChanged) return payload;

      applyTickerPayload(payload, { preserveIndex: true });
      return payload;
    } catch (error) {
      console.error("Error syncing ticker:", error);
      return null;
    }
  })();

  tickerState.syncPromise = task;

  try {
    return await task;
  } finally {
    if (tickerState.syncPromise === task) tickerState.syncPromise = null;
  }
}

function stopTickerSync() {
  if (tickerState.syncTimerId) {
    window.clearInterval(tickerState.syncTimerId);
    tickerState.syncTimerId = 0;
  }
}

function startTickerSync() {
  stopTickerSync();
  tickerState.syncTimerId = window.setInterval(() => {
    if (!tickerState.presenceActive) return;
    syncTickerFromServer();
  }, TICKER_SYNC_MS);
}

function isTickerPageVisible() {
  return !document.hidden && document.visibilityState === "visible";
}

function stopTickerPresence() {
  stopTickerSync();
  if (tickerState.presenceTimerId) {
    window.clearTimeout(tickerState.presenceTimerId);
    tickerState.presenceTimerId = 0;
  }
  tickerState.presenceActive = false;
}

function scheduleTickerPresenceTimeout() {
  if (tickerState.presenceTimerId) {
    window.clearTimeout(tickerState.presenceTimerId);
  }

  if (!isTickerPageVisible()) {
    tickerState.presenceTimerId = 0;
    return;
  }

  tickerState.presenceTimerId = window.setTimeout(() => {
    tickerState.presenceTimerId = 0;
    tickerState.presenceActive = false;
    stopTickerSync();
  }, TICKER_IDLE_MS);
}

function refreshTickerPresence({ immediate = false } = {}) {
  if (!isTickerPageVisible()) {
    stopTickerPresence();
    return;
  }

  const wasInactive = !tickerState.presenceActive;
  tickerState.presenceActive = true;
  scheduleTickerPresenceTimeout();

  if (wasInactive) {
    startTickerSync();
  }

  if (immediate || wasInactive) {
    syncTickerFromServer();
  }
}

function noteTickerActivity({ immediate = false } = {}) {
  const now = Date.now();
  const wasInactive = !tickerState.presenceActive;
  if (!immediate && !wasInactive && now - tickerState.lastActivitySignalAt < TICKER_ACTIVITY_THROTTLE_MS) {
    return;
  }

  tickerState.lastActivitySignalAt = now;
  refreshTickerPresence({ immediate });
}

function animateTickerText() {
  if (!tickerText) return;
  const tickerViewport = tickerText.closest(".news-ribbon-viewport");
  const viewportWidth = tickerViewport?.clientWidth || tickerText.parentElement?.clientWidth || 0;
  const messageWidth = tickerText.scrollWidth || tickerText.getBoundingClientRect().width || 0;
  const fadeEdge = Math.max(18, Math.min(48, viewportWidth * 0.025));
  const travelDistance = viewportWidth + messageWidth + fadeEdge * 2;
  const durationSeconds = Math.max(8, Math.min(24, travelDistance / TICKER_SPEED_PX_PER_SEC));
  const startOffset = viewportWidth + fadeEdge;
  const endOffset = -(messageWidth + fadeEdge);

  tickerText.style.setProperty("--ticker-duration", `${durationSeconds}s`);
  tickerText.style.setProperty("--ticker-start-offset", `${startOffset}px`);
  tickerText.style.setProperty("--ticker-end-offset", `${endOffset}px`);
  tickerViewport?.style.setProperty("--ticker-fade-edge", `${fadeEdge}px`);
  tickerText.classList.remove("is-animating");
  void tickerText.offsetWidth;
  tickerText.classList.add("is-animating");
  tickerState.currentDurationMs = Math.round(durationSeconds * 1000);
  return tickerState.currentDurationMs;
}

function renderTicker() {
  if (!tickerText) return;
  const items = tickerState.items.length ? tickerState.items : DEFAULT_TICKER_MESSAGES;
  const safeIndex = items.length ? tickerState.index % items.length : 0;
  tickerText.textContent = items[safeIndex] || "Sin leyendas configuradas.";
  animateTickerText();
}

function stopTickerRotation() {
  if (tickerState.timerId) {
    window.clearTimeout(tickerState.timerId);
    tickerState.timerId = 0;
  }
}

function startTickerRotation() {
  stopTickerRotation();
  if (tickerState.items.length < 2) return;

  const scheduleNextRotation = () => {
    const waitTime = Math.max((tickerState.currentDurationMs || 0) + TICKER_GAP_MS, 3000);
    tickerState.timerId = window.setTimeout(() => {
      if (tickerState.items.length < 2) {
        tickerState.timerId = 0;
        return;
      }

      tickerState.index = (tickerState.index + 1) % tickerState.items.length;
      renderTicker();
      scheduleNextRotation();
    }, waitTime);
  };

  scheduleNextRotation();
}

let tickerResizeTimerId = 0;
window.addEventListener("resize", () => {
  if (tickerResizeTimerId) window.clearTimeout(tickerResizeTimerId);
  tickerResizeTimerId = window.setTimeout(() => {
    renderTicker();
    startTickerRotation();
  }, 120);
});

function encodePrizeSlot(slot) {
  return encodeURIComponent(slot);
}

function decodePrizeSlot(slot) {
  const decoded = decodeURIComponent(slot || "");
  return PRIZE_SLOTS.has(decoded) ? decoded : "";
}

function normalizePrizeAmount(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  const amount = Number(digits);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function formatPrizeAmount(amount) {
  return `+${formatNumber(amount)} MXN`;
}

function normalizePrizeAwards(awards) {
  return Object.fromEntries(
    Object.entries(awards || {})
      .map(([slot, amount]) => [slot, Number(amount)])
      .filter(([slot, amount]) => PRIZE_SLOTS.has(slot) && Number.isFinite(amount) && amount > 0),
  );
}

function arePrizeAwardsEqual(left, right) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([slot, amount]) => right[slot] === amount);
}

function normalizePrizeModePayload(payload) {
  const parsedVersion = Number(payload?.version);
  return {
    active: Boolean(payload?.active),
    awards: normalizePrizeAwards(payload?.awards),
    version: Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 0,
    updatedAt: typeof payload?.updatedAt === "string" ? payload.updatedAt : "",
  };
}

function applyPrizeModePayload(payload) {
  const normalized = normalizePrizeModePayload(payload);
  prizeState.active = normalized.active;
  prizeState.awards = normalized.awards;
  prizeState.version = normalized.version;
  prizeState.updatedAt = normalized.updatedAt;
  prizeState.inputError = "";

  if (!prizeState.active) {
    resetPrizeEditor();
  }

  syncPrizeModeButton();
  renderPodium(prizeState.podiumRacers);
}

function syncAdminButton() {
  if (!adminAccessButton) return;
  const hasPin = Boolean(getStoredAdminPin());
  adminAccessButton.classList.toggle("is-active", hasPin);
  adminAccessButton.title = hasPin ? "Administracion activa" : "Administracion";
  adminAccessButton.setAttribute("aria-label", hasPin ? "Administracion activa" : "Administracion");
}

function syncAdminUi() {
  syncAdminButton();
  syncPrizeModeButton();
  renderPodium(prizeState.podiumRacers);
}

function syncPrizeModeButton() {
  if (!prizeModeButton) return;
  prizeModeButton.classList.toggle("is-active", prizeState.active);
  prizeModeButton.setAttribute("aria-pressed", String(prizeState.active));
  prizeModeButton.title = getStoredAdminPin()
    ? prizeState.active ? "Desactivar prize mode" : "Activar prize mode"
    : "Prize mode solo para admins";
}

function promptAdminAccess(options = {}) {
  return adminAuthModal.prompt({
    title: options.title || "Acceso admin",
    description: options.description || "Ingresa el codigo de administracion para continuar.",
    submitLabel: options.submitLabel || "Continuar",
    cancelLabel: options.cancelLabel || "Cancelar",
    allowCancel: options.allowCancel !== false,
  }).then((pin) => {
    syncAdminUi();
    return pin;
  });
}

function shouldShowTeamsWinnerSplash(options = {}) {
  const force = Boolean(options.force);
  if (!winnerSplash) return false;
  if (!force && localStorage.getItem(TEAMS_WINNER_SPLASH_STORAGE_KEY)) return false;
  return force || formatLocalIsoDate() >= TEAMS_WINNER_REVEAL_DATE;
}

function markTeamsWinnerSplashSeen() {
  localStorage.setItem(TEAMS_WINNER_SPLASH_STORAGE_KEY, formatLocalIsoDate());
}

function closeTeamsWinnerSplash() {
  if (!winnerSplash || !teamsWinnerSplashState.open) return;
  teamsWinnerSplashState.open = false;
  winnerSplash.classList.remove("is-open");
  winnerSplash.setAttribute("aria-hidden", "true");
  document.body.classList.remove("winner-splash-open");
}

function openTeamsWinnerSplash(team, race, options = {}) {
  const force = Boolean(options.force);
  if (!winnerSplash || !team || teamsWinnerSplashState.open || !shouldShowTeamsWinnerSplash({ force })) return;

  if (!force) {
    markTeamsWinnerSplashSeen();
  }
  teamsWinnerSplashState.open = true;

  if (winnerSplashTitle) winnerSplashTitle.textContent = team.team || "Team ganador";
  if (winnerSplashMeta) winnerSplashMeta.textContent = `Cierre ${formatDate(race.start)} — ${formatDate(race.end)}`;
  if (winnerSplashAvatar) winnerSplashAvatar.src = TEAMS_WINNER_SPLASH_AVATAR;
  if (winnerSplashSupervisor) {
    winnerSplashSupervisor.textContent = `Supervisor: ${team.supervisor || "Sin supervisor"}`;
  }
  if (winnerSplashDeals) {
    winnerSplashDeals.textContent = `Deals: ${formatNumber(team.count || 0)}`;
  }

  winnerSplash.classList.add("is-open");
  winnerSplash.setAttribute("aria-hidden", "false");
  document.body.classList.add("winner-splash-open");
  requestAnimationFrame(() => {
    winnerSplashEnter?.focus();
  });
}

async function maybeShowTeamsWinnerSplash(options = {}) {
  const force = Boolean(options.force);
  if (!shouldShowTeamsWinnerSplash({ force })) return null;
  if (teamsWinnerSplashState.loadingPromise) return teamsWinnerSplashState.loadingPromise;

  const task = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const params = new URLSearchParams({
        period: "week",
        view: "teams",
        anchor: TEAMS_COMPETITION_END,
      });
      const response = await fetch(`/api/race?${params.toString()}`, { signal: controller.signal });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo cargar el ganador de teams");
      }

      const winnerTeam = payload?.race?.teamStandings?.[0];
      if (winnerTeam && shouldShowTeamsWinnerSplash({ force })) {
        openTeamsWinnerSplash(winnerTeam, payload.race, { force });
      }

      return payload;
    } catch (error) {
      console.error("Error loading teams winner splash:", error);
      return null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  })();

  teamsWinnerSplashState.loadingPromise = task;

  try {
    return await task;
  } finally {
    if (teamsWinnerSplashState.loadingPromise === task) {
      teamsWinnerSplashState.loadingPromise = null;
    }
  }
}

function promptAdminActions() {
  return adminAuthModal.prompt({
    mode: "choice",
    title: "Administracion activa",
    description: "Puedes entrar a la gestion centralizada o cerrar la administracion en este navegador.",
    submitLabel: "Gestion centralizada",
    cancelLabel: "Desactivar administracion",
    primaryValue: "panel",
    secondaryValue: "logout",
    feedbackMessage: "La sesion admin queda activa solo en esta pestaña.",
  });
}

function resetPrizeEditor() {
  prizeState.editorSlot = "";
  prizeState.draftAmount = "";
  prizeState.inputError = "";
}

function focusPrizeEditor(prizeKey) {
  requestAnimationFrame(() => {
    podium.querySelector(`[data-prize-input="${prizeKey}"]`)?.focus();
  });
}

function openPrizeEditor(prizeKey) {
  const slot = decodePrizeSlot(prizeKey);
  if (!slot) return;
  prizeState.editorSlot = slot;
  prizeState.draftAmount = String(prizeState.awards[slot] || "");
  prizeState.inputError = "";
  renderPodium(prizeState.podiumRacers);
  focusPrizeEditor(prizeKey);
}

async function requestPrizeMode() {
  const response = await fetch("/api/prize-mode");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || "No se pudo cargar el prize mode");
    error.statusCode = response.status;
    error.current = payload.current || null;
    throw error;
  }
  return payload;
}

async function syncPrizeModeFromServer() {
  if (prizeState.syncPromise) return prizeState.syncPromise;

  const task = (async () => {
    try {
      const payload = normalizePrizeModePayload(await requestPrizeMode());
      const sameVersion = payload.version === prizeState.version;
      const sameActive = payload.active === prizeState.active;
      const sameAwards = arePrizeAwardsEqual(payload.awards, prizeState.awards);
      if (sameVersion && sameActive && sameAwards) return payload;
      applyPrizeModePayload(payload);
      return payload;
    } catch (error) {
      console.error("Error syncing prize mode:", error);
      return null;
    }
  })();

  prizeState.syncPromise = task;

  try {
    return await task;
  } finally {
    if (prizeState.syncPromise === task) prizeState.syncPromise = null;
  }
}

async function savePrizeMode({ active = prizeState.active, awards = prizeState.awards } = {}) {
  const payload = await requestAdminJson("/api/prize-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      active,
      awards,
      baseVersion: prizeState.version,
    }),
  }, {
    onAuthRequired: () => promptAdminAccess({
      title: "Acceso admin",
      description: "El prize mode es global. Valida tu codigo para editar premios o activarlo.",
      submitLabel: "Validar acceso",
    }),
  });

  applyPrizeModePayload(payload);
  return payload;
}

function setActivePeriod(p) {
  [...periodSwitcher.querySelectorAll("[data-period]")].forEach((b) => {
    b.classList.toggle("is-active", b.dataset.period === p);
  });
}

function syncTeamsCompetitionControls() {
  const teamsLocked = state.viewMode === "teams";

  periodSwitcher?.querySelectorAll("[data-period]").forEach((button) => {
    const isWeek = button.dataset.period === "week";
    button.disabled = teamsLocked && !isWeek;
    button.title = teamsLocked && !isWeek ? TEAMS_COMPETITION_HINT : "";
  });

  if (anchorDateInput) {
    anchorDateInput.disabled = teamsLocked;
    anchorDateInput.title = teamsLocked ? TEAMS_COMPETITION_HINT : "";
  }
}

function setActiveViewMode(mode) {
  const nextMode = mode === "teams" ? "teams" : "individual";

  if (nextMode === "teams") {
    if (state.viewMode !== "teams") state.individualPeriod = state.period;
    state.viewMode = "teams";
    state.period = "week";
  } else {
    state.viewMode = "individual";
    state.period = state.individualPeriod || "day";
  }

  localStorage.setItem(VIEW_MODE_KEY, state.viewMode);
  viewSwitcher?.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.viewMode);
  });
  setActivePeriod(state.period);
  syncTeamsCompetitionControls();
}

/* ══ Render: summary ══ */

function renderSummary(meta, race) {
  rangeLabel.textContent = `${formatDate(race.start)} — ${formatDate(race.end)}`;
}

/* ══ Render: track ══ */

function renderLeaderBanner(race) {
  const leaderTeam = race.teamStandings?.[0];
  if (!leaderTeam) {
    leaderBanner.innerHTML = `
      <p class="leader-banner-label">Escuderia puntera</p>
      <div class="leader-banner-main">Sin datos</div>
      <p class="leader-banner-meta">No hay actividad para este corte</p>`;
    return;
  }

  const monthLabel = formatMonthYear(race.anchor);

  leaderBanner.innerHTML = `
    <p class="leader-banner-label">Escuderia puntera</p>
    <div class="leader-banner-main">
      <span class="leader-banner-dot" style="background:${leaderTeam.color}"></span>
      ${leaderTeam.team}
    </div>
    <p class="leader-banner-meta">Lidera ${monthLabel}</p>`;
}

function renderIndividualTrack(racers, leaderCount) {
  if (!racers.length) {
    track.innerHTML = `<div class="empty-state">No hay Ventas/Deals para ese corte.</div>`;
    return;
  }

  const target = Math.max(leaderCount * 2.2, 10);

  track.innerHTML = racers
    .slice(0, 8)
    .map((r) => {
      const progress = Math.min(r.count / target, 0.88);
      const icon = racerIcon(r.agent, r.gender);
      const laneClass = r.rank === 1 ? "lane--gold" : r.rank === 2 ? "lane--silver" : r.rank === 3 ? "lane--bronze" : "";
      return `
        <article class="lane ${laneClass}" style="--progress:${Math.max(progress, 0.04)}; --hue:${r.colorHue}; --team-color:${r.teamColor || "transparent"}">
          <div class="lane-rank">
            <span class="rank-pill">${r.rank}</span>
            <div>
              <div class="agent-name">${r.agent}</div>
              <div class="agent-subtitle">${r.gap === 0 ? "Lider" : `−${r.gap}`}</div>
            </div>
          </div>
          <div class="lane-track">
            <div class="lane-progress"></div>
            <div class="racer" aria-hidden="true">${icon}</div>
          </div>
          <div class="lane-score">
            <strong>${formatNumber(r.count)}</strong>
            <span class="amount-green">${r.amount ? formatMoney(r.amount) : "Ventas/Deals"}</span>
          </div>
        </article>`;
    })
    .join("");
}

/* ══ Render: team bar (vertical cards) ══ */

function renderTeamTrack(race) {
  const teams = buildTeamEntries(race);
  if (!teams.length) {
    track.innerHTML = `<div class="empty-state">No hay equipos activos para ese corte.</div>`;
    return;
  }

  const totalTeamDeals = teams.reduce((sum, team) => sum + team.count, 0);

  track.innerHTML = `
    <div class="team-telemetry-grid">
      ${teams.map((team) => {
        const cardClass = team.rank === 1 ? "team-telemetry--gold" : team.rank === 2 ? "team-telemetry--silver" : team.rank === 3 ? "team-telemetry--bronze" : "";
        const shareProgress = totalTeamDeals > 0 ? team.count / totalTeamDeals : 0;
        const dialProgress = totalTeamDeals > 0 ? Math.max(shareProgress, 0.08) : 0;

        return `
          <article class="team-telemetry ${cardClass}" style="--team-color:${team.color}; --dial-progress:${dialProgress}">
            <div class="team-telemetry-head">
              <div class="team-rank-wrap">
                <span class="team-rank-pill">${team.rank}</span>
                <div>
                  <div class="team-telemetry-name">${team.team}</div>
                </div>
              </div>
              <div class="team-telemetry-score">
                <strong>${formatNumber(team.count)} Deals</strong>
                <span class="amount-green">${formatMoney(team.amount || 0)}</span>
              </div>
            </div>
            <div class="team-dial">
              <div class="team-dial-core">
                <strong>${Math.round(shareProgress * 100)}%</strong>
                <span>del total</span>
              </div>
            </div>
            <div class="team-stats-row">
              <div class="team-stat">
                <span>Gap</span>
                <strong>${team.gap === 0 ? "Lider" : `-${formatNumber(team.gap)}`}</strong>
              </div>
              <div class="team-stat">
                <span>Top seller</span>
                <strong>${team.topAgent ? formatShortName(team.topAgent) : "Sin actividad"}</strong>
              </div>
              <div class="team-stat">
                <span>Deals best seller</span>
                <strong>${formatNumber(team.topAgentCount)} deals</strong>
              </div>
            </div>
          </article>`;
      }).join("")}
    </div>`;
}

function renderTeamBar(standings) {
  if (!standings || !standings.length) { teamBar.innerHTML = ""; return; }

  teamBar.innerHTML = standings.map((t) => `
    <div class="team-card ${t.rank === 1 ? 'is-first' : ''}" style="--tc:${t.color}">
      <div class="tc-top">
        <span class="tc-name">${t.team}</span>
        <span class="tc-count">${formatNumber(t.count)}</span>
      </div>
      <div class="tc-meta">${t.agents} vendedores · ${t.supervisor || "—"}</div>
    </div>
  `).join("");
}

/* ══ Render: podium ══ */

const podium = $("#podium");

function getPodiumEntries(race) {
  return state.viewMode === "teams" ? buildTeamEntries(race) : race.racers;
}

function renderPodium(racers) {
  prizeState.podiumRacers = racers.slice(0, 3);
  const canEditPrize = prizeState.active && Boolean(getStoredAdminPin());

  if (racers.length < 3) {
    podium.innerHTML = "";
    return;
  }

  const medals = [
    { r: racers[1], cls: "silver" },
    { r: racers[0], cls: "gold" },
    { r: racers[2], cls: "bronze" },
  ];

  podium.innerHTML = medals.map(({ r, cls }) => {
    const prizeKey = encodePrizeSlot(cls);
    const savedPrize = prizeState.awards[cls];
    const isEditing = canEditPrize && prizeState.editorSlot === cls;
    const hasPrize = Boolean(savedPrize || isEditing);
    const draftValue = isEditing ? prizeState.draftAmount : savedPrize ? String(savedPrize) : "";
    const prizeError = isEditing ? prizeState.inputError : "";
    const teamLeaderBadge = state.viewMode === "teams" && cls === "gold"
      ? `
        <div class="podium-team-badge">
          <img src="/AvatarSBKS.png?v=20260316-1322" alt="Avatar del team lider" class="podium-team-badge-img" />
        </div>
      `
      : "";

    const prizeMarkup = canEditPrize && isEditing
      ? `
        <div class="podium-prize-zone">
          <div class="podium-prize-editor">
            <input class="prize-input" type="text" inputmode="numeric" placeholder="Monto MXN" value="${draftValue}" data-prize-input="${prizeKey}" />
            ${prizeError ? `<p class="podium-prize-error">${prizeError}</p>` : ""}
            <div class="podium-prize-actions">
            <button class="prize-confirm-btn" type="button" data-prize-confirm="${prizeKey}">Confirmar premio</button>
            <button class="prize-cancel-btn" type="button" data-prize-cancel="${prizeKey}">Cancelar</button>
          </div>
        </div>
        </div>
      `
      : savedPrize
        ? `
          <div class="podium-prize-zone podium-prize-has-award">
            <button class="podium-prize-display ${canEditPrize ? "is-editable" : ""}" ${canEditPrize ? `type="button" data-prize-open="${prizeKey}"` : 'type="button" disabled'}>
              <span class="podium-prize-amount">${formatPrizeAmount(savedPrize)}</span>
            </button>
            ${canEditPrize ? `<button class="podium-prize-clear" type="button" data-prize-clear="${prizeKey}" title="Quitar premio">Quitar</button>` : ""}
          </div>
        `
        : canEditPrize
          ? `
            <div class="podium-prize-zone">
              <button class="podium-prize-slot" type="button" data-prize-open="${prizeKey}" title="Agregar premio"></button>
            </div>
          `
          : "";

    return `
      <div class="podium-card podium-card--${cls} ${hasPrize ? "podium-card--with-prize" : ""}">
        <div class="podium-main">
          <div class="podium-info">
            <div class="podium-name">${state.viewMode === "teams" ? r.team : r.agent}</div>
            <div class="podium-team">
              <span class="podium-team-dot" style="background:${state.viewMode === "teams" ? r.color : r.teamColor}"></span>
              ${state.viewMode === "teams" ? (r.supervisor || "Sin supervisor") : r.team}
            </div>
            ${state.viewMode === "teams" ? "" : `<div class="podium-meta">${r.supervisor || r.team}</div>`}
          </div>
          <div class="podium-score ${state.viewMode === "teams" && cls === "gold" ? "podium-score--hero" : ""}">${formatNumber(r.count)}</div>
          ${teamLeaderBadge}
        </div>
        ${prizeMarkup}
      </div>
    `;
  }).join("");
}

/* ══ Render: leaderboard ══ */

function renderLeaderboard(race) {
  if (state.viewMode === "teams") {
    const teams = buildTeamEntries(race);
    leaderboardEyebrow.textContent = "Clasificacion por equipo";
    leaderboardTitle.textContent = "Tabla de equipos";
    leaderboardHeadRow.innerHTML = `
      <th>#</th>
      <th>Equipo</th>
      <th>Supervisor</th>
      <th>Vendedores</th>
      <th>Ventas/Deals</th>
      <th>Gap</th>
    `;

    if (!teams.length) {
      leaderboardBody.innerHTML = `<tr><td colspan="6">Sin equipos activos.</td></tr>`;
      return;
    }

    leaderboardBody.innerHTML = teams
      .map((team) => `
        <tr>
          <td data-label="Posicion">${team.rank}</td>
          <td data-label="Equipo"><span class="badge"><span class="team-dot" style="background:${team.color}"></span>${team.team}</span></td>
          <td data-label="Supervisor">${team.supervisor || "Sin supervisor"}</td>
          <td data-label="Vendedores">${formatNumber(team.agents)}</td>
          <td data-label="Ventas/Deals"><span class="amount-green">${formatNumber(team.count)}</span> · ${formatMoney(team.amount || 0)}</td>
          <td data-label="Gap">${team.gap === 0 ? "Lider" : `-${formatNumber(team.gap)}`}</td>
        </tr>`)
      .join("");
    return;
  }

  leaderboardEyebrow.textContent = "Clasificacion";
  leaderboardTitle.textContent = "Tabla completa";
  leaderboardHeadRow.innerHTML = `
    <th>#</th>
    <th>Vendedor</th>
    <th>Equipo</th>
    <th>Ventas/Deals</th>
    <th>Deuda</th>
    <th>Gap</th>
  `;
  const racers = race.racers;
  if (!racers.length) {
    leaderboardBody.innerHTML = `<tr><td colspan="6">Sin vendedores activos.</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = racers
    .map((r) => `
      <tr>
        <td data-label="Posicion">${r.rank}</td>
        <td data-label="Vendedor"><span class="badge"><span class="dot" style="--hue:${r.colorHue}"></span>${r.agent}</span></td>
        <td data-label="Equipo"><span class="team-dot" style="background:${r.teamColor}"></span>${r.team}</td>
        <td data-label="Ventas/Deals">${formatNumber(r.count)}</td>
        <td data-label="Deuda" class="amount-green">${formatMoney(r.amount || 0)}</td>
        <td>${r.gap === 0 ? "Lider" : `−${formatNumber(r.gap)}`}</td>
      </tr>`)
    .join("");
}

/* ══ Team editor (drag & drop) ══ */

function renderRaceView(race) {
  if (state.viewMode === "teams") {
    renderTeamTrack(race);
  } else {
    renderIndividualTrack(race.racers, race.leaderCount);
  }

  renderPodium(getPodiumEntries(race));
  renderLeaderboard(race);
}

async function togglePrizeMode() {
  try {
    await savePrizeMode({ active: !prizeState.active });
  } catch (error) {
    if (error.message === "Se requiere acceso admin para continuar.") return;
    console.error("Error updating prize mode:", error);
    if (error.statusCode === 409 && error.current) {
      applyPrizeModePayload(error.current);
    }
  }
}

if (prizeModeButton) {
  prizeModeButton.addEventListener("click", togglePrizeMode);
  syncPrizeModeButton();
}

if (podium) {
  podium.addEventListener("click", async (e) => {
    const openBtn = e.target.closest("[data-prize-open]");
    if (openBtn) {
      openPrizeEditor(openBtn.dataset.prizeOpen);
      return;
    }

    const clearBtn = e.target.closest("[data-prize-clear]");
    if (clearBtn) {
      const slot = decodePrizeSlot(clearBtn.dataset.prizeClear);
      if (!slot) return;

      try {
        const nextAwards = { ...prizeState.awards };
        delete nextAwards[slot];
        await savePrizeMode({ awards: nextAwards });
        if (prizeState.editorSlot === slot) {
          resetPrizeEditor();
        }
      } catch (error) {
        console.error("Error clearing prize amount:", error);
        if (error.statusCode === 409 && error.current) {
          applyPrizeModePayload(error.current);
        }
      }
      return;
    }

    const cancelBtn = e.target.closest("[data-prize-cancel]");
    if (cancelBtn) {
      resetPrizeEditor();
      renderPodium(prizeState.podiumRacers);
      return;
    }

    const confirmBtn = e.target.closest("[data-prize-confirm]");
    if (confirmBtn) {
      const prizeKey = confirmBtn.dataset.prizeConfirm;
      const slot = decodePrizeSlot(prizeKey);
      if (!slot) return;
      const input = podium.querySelector(`[data-prize-input="${prizeKey}"]`);
      const amount = normalizePrizeAmount(input?.value || prizeState.draftAmount);
      if (!amount) {
        prizeState.inputError = "Ingresa un monto valido para el premio.";
        renderPodium(prizeState.podiumRacers);
        focusPrizeEditor(prizeKey);
        return;
      }

      try {
        const nextAwards = {
          ...prizeState.awards,
          [slot]: amount,
        };
        await savePrizeMode({ awards: nextAwards });
        resetPrizeEditor();
        renderPodium(prizeState.podiumRacers);
      } catch (error) {
        console.error("Error saving prize amount:", error);
        if (error.statusCode === 409 && error.current) {
          applyPrizeModePayload(error.current);
        } else {
          prizeState.inputError = error.message || "No se pudo guardar el premio.";
          renderPodium(prizeState.podiumRacers);
        }
      }
    }
  });

  podium.addEventListener("input", (e) => {
    const input = e.target.closest("[data-prize-input]");
    if (!input) return;
    prizeState.draftAmount = input.value;
    prizeState.inputError = "";
  });
}

/* La edicion de ticker vive en /admin.html */

/* ══ Fetch ══ */

const RACE_CACHE_TTL_MS = 60_000;
const raceRequestCache = new Map();

function getFriendlyErrorMessage() {
  return "Ups, ahorita queda joven.";
}

function clearRaceCache() {
  raceRequestCache.clear();
}

function readRaceCacheEntry(cacheKey) {
  const entry = raceRequestCache.get(cacheKey);
  if (!entry) return null;
  if (!entry.payload) return entry;
  if (Date.now() > entry.expiresAt) {
    raceRequestCache.delete(cacheKey);
    return null;
  }
  return entry;
}

function writeRaceCachePayload(cacheKey, payload) {
  raceRequestCache.set(cacheKey, {
    payload,
    promise: null,
    expiresAt: Date.now() + RACE_CACHE_TTL_MS,
  });
  return payload;
}

function writeRaceCachePromise(cacheKey, promise) {
  const current = raceRequestCache.get(cacheKey) || {};
  raceRequestCache.set(cacheKey, {
    payload: current.payload || null,
    promise,
    expiresAt: current.expiresAt || 0,
  });
}

function applyRacePayload(payload) {
  const { meta, race } = payload;
  state.latestDate = meta.latestDate;
  state.earliestDate = meta.earliestDate;
  state.anchorDate = state.anchorDate || meta.latestDate;
  state.latestRace = race;

  anchorDateInput.value = state.anchorDate;
  anchorDateInput.max = meta.latestDate;
  anchorDateInput.min = meta.earliestDate;

  setActiveViewMode(state.viewMode);
  renderSummary(meta, race);
  renderLeaderBanner(race);
  renderTeamBar(race.teamStandings);
  renderRaceView(race);
}

async function loadRace(forceRefresh = false) {
  const requestPeriod = state.viewMode === "teams" ? "week" : state.period;
  const params = new URLSearchParams({ period: requestPeriod });
  if (state.anchorDate) params.set("anchor", state.anchorDate);
  if (state.viewMode === "teams") params.set("view", "teams");
  if (forceRefresh) params.set("refresh", "1");
  const cacheKey = params.toString();

  if (forceRefresh) {
    clearRaceCache();
  } else {
    const cachedEntry = readRaceCacheEntry(cacheKey);
    if (cachedEntry?.payload) {
      applyRacePayload(cachedEntry.payload);
      return;
    }
  }

  track.innerHTML = `<div class="empty-state">Actualizando...</div>`;

  try {
    const currentEntry = !forceRefresh ? readRaceCacheEntry(cacheKey) : null;
    const pendingPromise = currentEntry?.promise;

    const requestPromise = pendingPromise || (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await fetch(`/api/race?${params.toString()}`, { signal: controller.signal });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Error de carga");
        return writeRaceCachePayload(cacheKey, payload);
      } finally {
        clearTimeout(timeout);
      }
    })();

    if (!pendingPromise) {
      writeRaceCachePromise(cacheKey, requestPromise);
    }

    const payload = await requestPromise;
    writeRaceCachePayload(cacheKey, payload);
    applyRacePayload(payload);
  } catch (err) {
    raceRequestCache.delete(cacheKey);
    const friendlyMessage = getFriendlyErrorMessage(err);
    console.error("Error loading race:", err);
    track.innerHTML = `<div class="empty-state">${friendlyMessage}</div>`;
    leaderBanner.innerHTML = `<p class="leader-banner-label">Escuderia puntera</p><div class="leader-banner-main">Ups</div><p class="leader-banner-meta">${friendlyMessage}</p>`;
    leaderboardEyebrow.textContent = "Clasificacion";
    leaderboardTitle.textContent = "Tabla completa";
    leaderboardHeadRow.innerHTML = `
      <th>#</th>
      <th>Vendedor</th>
      <th>Equipo</th>
      <th>Ventas/Deals</th>
      <th>Deuda</th>
      <th>Gap</th>
    `;
    leaderboardBody.innerHTML = `<tr><td colspan="6">${friendlyMessage}</td></tr>`;
  }
}

/* ══ Events ══ */

periodSwitcher.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-period]");
  if (!btn || btn.disabled) return;
  state.individualPeriod = btn.dataset.period;
  state.period = btn.dataset.period;
  loadRace();
});

viewSwitcher?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;
  setActiveViewMode(btn.dataset.view);
  loadRace();
});

anchorDateInput.addEventListener("change", () => {
  state.anchorDate = anchorDateInput.value;
  loadRace();
});

winnerSplashClose?.addEventListener("click", closeTeamsWinnerSplash);
winnerSplashEnter?.addEventListener("click", closeTeamsWinnerSplash);
winnerSplash?.addEventListener("click", (event) => {
  if (event.target !== winnerSplash) return;
  closeTeamsWinnerSplash();
});

adminAccessButton?.addEventListener("click", async () => {
  if (!getStoredAdminPin()) {
    const pin = await promptAdminAccess({
      title: "Acceso admin",
      description: "Ingresa el codigo para abrir la gestion centralizada.",
      submitLabel: "Entrar al panel",
    });

    if (pin) {
      window.location.href = "/admin.html";
    }
    return;
  }

  const action = await promptAdminActions();
  if (action === "logout") {
    clearStoredAdminPin();
    resetPrizeEditor();
    syncAdminUi();
    return;
  }

  if (action === "panel") {
    window.location.href = "/admin.html";
  }
});

refreshButton.addEventListener("click", async () => {
  await Promise.all([loadRace(true), syncPrizeModeFromServer()]);
});

/* ══ Jackpot ══ */

const jackpotButton = $("#jackpotButton");
if (jackpotButton) {
  jackpotButton.addEventListener("click", () => {
    window.location.href = "/jackpot.html";
  });
}

/* ══ Inbound Competition ══ */

const inboundCompetitionButton = $("#inboundCompetitionButton");
if (inboundCompetitionButton) {
  inboundCompetitionButton.addEventListener("click", () => {
    window.location.href = "/jackpot.html#inbound";
  });
}

/* ══ Jackpot logo animation (spin + bounce → dance loop) ══ */

(function initJackpotAnim() {
  const logo = document.querySelector(".jackpot-logo");
  if (!logo) return;

  function startDance() {
    logo.classList.remove("is-spinning", "is-bouncing");
    void logo.offsetWidth;
    logo.classList.add("is-dancing");
  }

  function runBurst() {
    logo.classList.remove("is-dancing");
    void logo.offsetWidth;
    logo.classList.add("is-spinning");
    logo.addEventListener("animationend", () => {
      logo.classList.remove("is-spinning");
      void logo.offsetWidth;
      logo.classList.add("is-bouncing");
      logo.addEventListener("animationend", () => {
        logo.classList.remove("is-bouncing");
        void logo.offsetWidth;
        startDance();
      }, { once: true });
    }, { once: true });
  }

  // Start dancing right away, burst every 12s
  setTimeout(startDance, 500);
  setInterval(runBurst, 12000);
  setTimeout(runBurst, 3000);
})();

applyTickerPayload({ items: DEFAULT_TICKER_MESSAGES, version: 0 }, { preserveIndex: false });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopTickerPresence();
    return;
  }
  noteTickerActivity({ immediate: true });
  syncPrizeModeFromServer();
});
window.addEventListener("focus", () => {
  noteTickerActivity({ immediate: true });
  syncPrizeModeFromServer();
});
window.addEventListener("blur", stopTickerPresence);
window.addEventListener("pagehide", stopTickerPresence);
window.addEventListener("pageshow", () => {
  noteTickerActivity({ immediate: true });
  syncPrizeModeFromServer();
});
window.addEventListener("pointerdown", () => {
  noteTickerActivity();
}, { passive: true });
window.addEventListener("keydown", () => {
  noteTickerActivity();
});
window.addEventListener("scroll", () => {
  noteTickerActivity();
}, { passive: true });
window.addEventListener("touchstart", () => {
  noteTickerActivity();
}, { passive: true });
window.addEventListener("mousemove", () => {
  noteTickerActivity();
}, { passive: true });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !winnerSplash?.classList.contains("is-open")) return;
  closeTeamsWinnerSplash();
});
syncAdminUi();
noteTickerActivity({ immediate: true });
startTeamRaceCountdown();
Promise.all([
  loadRace(),
  maybeShowTeamsWinnerSplash(),
  syncPrizeModeFromServer(),
  validateStoredAdminPin().then(() => {
    syncAdminUi();
  }),
]);
