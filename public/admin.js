import {
  clearStoredAdminPin,
  createAdminAuthModal,
  getStoredAdminPin,
  requestAdminJson,
  requestJson,
  validateStoredAdminPin,
} from "./admin-session.js?v=20260317-admin-3";

const $ = (selector) => document.querySelector(selector);

const themeToggle = $("#themeToggle");
const reAuthButton = $("#reAuthButton");
const adminStatus = $("#adminStatus");
const teamEditor = $("#teamEditor");
const saveTeamsBtn = $("#saveTeams");
const tickerEditor = $("#tickerEditor");
const addTickerLineBtn = $("#addTickerLine");
const saveTickerLinesBtn = $("#saveTickerLines");

const authModal = createAdminAuthModal();
const MAX_TICKER_LINES = 10;

let editorTeams = {};
let editorAssignments = {};
let dragDropBound = false;
let tickerVersion = 0;
let tickerDraftItems = [];

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function setStatus(message, tone = "") {
  if (!adminStatus) return;
  adminStatus.textContent = message;
  adminStatus.dataset.tone = tone;
}

function setEditorEnabled(enabled) {
  teamEditor?.toggleAttribute("aria-busy", !enabled);
  tickerEditor?.toggleAttribute("aria-busy", !enabled);
  saveTeamsBtn.disabled = !enabled;
  addTickerLineBtn.disabled = !enabled || tickerDraftItems.length >= MAX_TICKER_LINES;
  saveTickerLinesBtn.disabled = !enabled;
  reAuthButton.disabled = false;
}

async function ensureAdminSession({ force = false } = {}) {
  setEditorEnabled(false);

  const hasValidStoredPin = !force ? await validateStoredAdminPin() : false;
  if (hasValidStoredPin) {
    setStatus("Acceso admin validado.", "success");
    setEditorEnabled(true);
    return getStoredAdminPin();
  }

  clearStoredAdminPin();
  setStatus("Ingresa el codigo admin para continuar.", "");
  const pin = await authModal.prompt({
    title: "Acceso admin",
    description: "Valida tu codigo para abrir la gestion centralizada.",
    submitLabel: "Entrar",
    cancelLabel: "Volver",
  });

  if (!pin) {
    window.location.href = "/";
    return "";
  }

  setStatus("Acceso admin validado.", "success");
  setEditorEnabled(true);
  return pin;
}

async function requestProtectedJson(url, options = {}) {
  return requestAdminJson(url, options, {
    onAuthRequired: async ({ reason }) => {
      setStatus(reason === "invalid" ? "PIN rechazado. Vuelve a validarte." : "Ingresa el codigo admin para continuar.", "warning");
      return ensureAdminSession({ force: true });
    },
  });
}

function normalizeTickerMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((message) => String(message || "").trim())
    .filter(Boolean)
    .slice(0, MAX_TICKER_LINES);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

function captureTickerDraftValues() {
  const fields = [...tickerEditor.querySelectorAll("[data-ticker-line]")];
  tickerDraftItems = fields.map((field) => field.value);
}

function renderTickerEditor() {
  const items = tickerDraftItems.length ? tickerDraftItems : [""];

  tickerEditor.innerHTML = items.map((message, index) => `
    <div class="ticker-field">
      <div class="ticker-field-top">
        <span class="ticker-field-label">Leyenda ${index + 1}</span>
        ${items.length > 1 ? `
          <button class="edit-btn ticker-remove" type="button" data-remove-ticker-line="${index}" title="Eliminar leyenda">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        ` : `<span></span>`}
      </div>
      <textarea class="ticker-input" data-ticker-line="${index}" placeholder="Escribe una leyenda">${message}</textarea>
    </div>
  `).join("");

  addTickerLineBtn.disabled = items.length >= MAX_TICKER_LINES;
}

async function loadTicker() {
  const payload = await requestJson("/api/ticker");
  tickerVersion = Number(payload.version) || 0;
  tickerDraftItems = normalizeTickerMessages(payload.items);
  renderTickerEditor();
}

async function saveTicker() {
  const nextItems = normalizeTickerMessages(
    [...tickerEditor.querySelectorAll("[data-ticker-line]")].map((field) => field.value),
  );

  if (!nextItems.length) {
    setStatus("Agrega al menos una leyenda para el ticker.", "warning");
    tickerEditor.querySelector("[data-ticker-line]")?.focus();
    return;
  }

  const originalLabel = saveTickerLinesBtn.textContent;
  saveTickerLinesBtn.disabled = true;
  saveTickerLinesBtn.textContent = "Guardando...";

  try {
    const payload = await requestProtectedJson("/api/ticker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: nextItems,
        baseVersion: tickerVersion,
      }),
    });

    tickerVersion = Number(payload.version) || tickerVersion;
    tickerDraftItems = normalizeTickerMessages(payload.items);
    renderTickerEditor();
    setStatus("Leyendas guardadas y publicadas.", "success");
  } catch (error) {
    console.error("Error saving ticker:", error);

    if (error.statusCode === 409 && error.current) {
      tickerVersion = Number(error.current.version) || tickerVersion;
      tickerDraftItems = normalizeTickerMessages(error.current.items);
      renderTickerEditor();
      setStatus("El ticker cambio en otro navegador. Ya cargue la version mas reciente.", "warning");
    } else {
      setStatus(error.message || "No se pudieron guardar las leyendas.", "warning");
    }
  } finally {
    saveTickerLinesBtn.disabled = false;
    saveTickerLinesBtn.textContent = originalLabel;
  }
}

function renderEditorColumns() {
  const teamNames = Object.keys(editorTeams);
  const groups = {};
  for (const name of teamNames) groups[name] = [];

  for (const [agent, team] of Object.entries(editorAssignments)) {
    if (groups[team]) groups[team].push(agent);
    else if (teamNames[0]) {
      groups[teamNames[0]].push(agent);
      editorAssignments[agent] = teamNames[0];
    }
  }

  for (const agents of Object.values(groups)) {
    agents.sort((a, b) => a.localeCompare(b, "es"));
  }

  teamEditor.innerHTML = teamNames.map((name) => {
    const info = editorTeams[name];
    const agents = groups[name] || [];
    return `
      <div class="team-col" data-team="${name}" style="--col-color:${info.color}">
        <div class="team-col-header">
          <strong>${name}</strong>
          <span class="team-col-sup">${info.supervisor || ""}</span>
        </div>
        <div class="team-col-list">
          ${agents.map((agent) => `
            <div class="agent-chip" draggable="true" data-agent="${agent}">
              <span class="chip-dot" style="background:hsl(${hashString(agent)} 55% 52%)"></span>
              ${agent}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  bindDragDrop();
}

function bindDragDrop() {
  if (dragDropBound) return;
  dragDropBound = true;

  teamEditor.addEventListener("dragstart", (event) => {
    const chip = event.target.closest(".agent-chip");
    if (!chip) return;
    event.dataTransfer.setData("text/plain", chip.dataset.agent);
    event.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => chip.classList.add("dragging"));
  });

  teamEditor.addEventListener("dragend", (event) => {
    const chip = event.target.closest(".agent-chip");
    if (chip) chip.classList.remove("dragging");
    teamEditor.querySelectorAll(".team-col").forEach((col) => col.classList.remove("drag-over"));
  });

  teamEditor.addEventListener("dragover", (event) => {
    const col = event.target.closest(".team-col");
    if (!col) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    col.classList.add("drag-over");
  });

  teamEditor.addEventListener("dragleave", (event) => {
    const col = event.target.closest(".team-col");
    if (col && !col.contains(event.relatedTarget)) col.classList.remove("drag-over");
  });

  teamEditor.addEventListener("drop", (event) => {
    const col = event.target.closest(".team-col");
    if (!col) return;

    event.preventDefault();
    col.classList.remove("drag-over");

    const agent = event.dataTransfer.getData("text/plain");
    const newTeam = col.dataset.team;
    if (agent && newTeam && editorAssignments[agent] !== newTeam) {
      editorAssignments[agent] = newTeam;
      renderEditorColumns();
    }
  });
}

async function loadTeams() {
  const payload = await requestProtectedJson("/api/teams");
  editorTeams = payload.teams || {};
  editorAssignments = { ...(payload.assignments || {}) };
  renderEditorColumns();
}

async function saveTeams() {
  const originalLabel = saveTeamsBtn.textContent;
  saveTeamsBtn.disabled = true;
  saveTeamsBtn.textContent = "Guardando...";

  try {
    await requestProtectedJson("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: editorAssignments }),
    });

    setStatus("Equipos guardados.", "success");
  } catch (error) {
    console.error("Error saving teams:", error);
    setStatus(error.message || "No se pudieron guardar los equipos.", "warning");
  } finally {
    saveTeamsBtn.disabled = false;
    saveTeamsBtn.textContent = originalLabel;
  }
}

function bindEvents() {
  themeToggle?.addEventListener("click", () => {
    const nextTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  reAuthButton?.addEventListener("click", async () => {
    clearStoredAdminPin();
    setStatus("Vuelve a validar tu acceso.", "warning");
    const pin = await ensureAdminSession({ force: true });
    if (pin) {
      await loadProtectedData();
    }
  });

  tickerEditor?.addEventListener("input", () => {
    captureTickerDraftValues();
  });

  tickerEditor?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-ticker-line]");
    if (!removeButton) return;

    const index = Number(removeButton.dataset.removeTickerLine);
    if (!Number.isInteger(index)) return;

    captureTickerDraftValues();
    tickerDraftItems = tickerDraftItems.filter((_, itemIndex) => itemIndex !== index);
    if (!tickerDraftItems.length) tickerDraftItems = [""];
    renderTickerEditor();
  });

  addTickerLineBtn?.addEventListener("click", () => {
    captureTickerDraftValues();
    if (tickerDraftItems.length >= MAX_TICKER_LINES) return;
    tickerDraftItems = [...tickerDraftItems, ""];
    renderTickerEditor();
    requestAnimationFrame(() => {
      const inputs = tickerEditor?.querySelectorAll("[data-ticker-line]");
      inputs?.[inputs.length - 1]?.focus();
    });
  });

  saveTickerLinesBtn?.addEventListener("click", saveTicker);
  saveTeamsBtn?.addEventListener("click", saveTeams);
}

async function loadProtectedData() {
  setEditorEnabled(false);
  setStatus("Cargando panel admin...", "");

  try {
    await Promise.all([loadTicker(), loadTeams()]);
    setStatus("Panel admin listo.", "success");
  } catch (error) {
    console.error("Error loading admin panel:", error);
    setStatus(error.message || "No se pudo cargar el panel admin.", "warning");
  } finally {
    setEditorEnabled(true);
  }
}

async function init() {
  applyTheme(localStorage.getItem("theme") || "light");
  bindEvents();
  setEditorEnabled(false);

  const pin = await ensureAdminSession();
  if (!pin) return;

  await loadProtectedData();
}

init();
