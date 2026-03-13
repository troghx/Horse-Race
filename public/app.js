const state = {
  period: "day",
  anchorDate: "",
  latestDate: "",
  earliestDate: "",
};

const $ = (s) => document.querySelector(s);
const rangeLabel = $("#rangeLabel");
const track = $("#track");
const leaderboardBody = $("#leaderboardBody");
const anchorDateInput = $("#anchorDate");
const refreshButton = $("#refreshButton");
const periodSwitcher = $("#periodSwitcher");
const themeToggle = $("#themeToggle");
const teamBar = $("#teamBar");
const leaderBanner = $("#leaderBanner");
const teamModal = $("#teamModal");
const teamEditor = $("#teamEditor");
const closeModalBtn = $("#closeModal");
const saveTeamsBtn = $("#saveTeams");
const editTeamsBtn = $("#editTeamsBtn");
const prizeModeButton = $("#prizeModeButton");
const TEAM_EDITOR_PIN = "75572144";
const PRIZE_AWARDS_KEY = "grand_prix_prize_awards_v1";
const prizeState = {
  active: false,
  editorAgent: "",
  draftAmount: "",
  awards: {},
  podiumRacers: [],
};

/* ══ Theme ══ */

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
}

themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

applyTheme(localStorage.getItem("theme") || "light");

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

function loadPrizeAwards() {
  try {
    const raw = JSON.parse(localStorage.getItem(PRIZE_AWARDS_KEY) || "{}");
    return Object.fromEntries(
      Object.entries(raw)
        .map(([agent, amount]) => [agent, Number(amount)])
        .filter(([agent, amount]) => agent && Number.isFinite(amount) && amount > 0),
    );
  } catch {
    return {};
  }
}

function savePrizeAwards() {
  localStorage.setItem(PRIZE_AWARDS_KEY, JSON.stringify(prizeState.awards));
}

function encodePrizeAgent(agent) {
  return encodeURIComponent(agent);
}

function decodePrizeAgent(agent) {
  try {
    return decodeURIComponent(agent);
  } catch {
    return agent;
  }
}

function normalizePrizeAmount(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  const amount = Number(digits);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function formatPrizeAmount(amount) {
  return `+${formatNumber(amount)} MXN`;
}

function syncPrizeModeButton() {
  if (!prizeModeButton) return;
  prizeModeButton.classList.toggle("is-active", prizeState.active);
  prizeModeButton.setAttribute("aria-pressed", String(prizeState.active));
}

function setPrizeMode(active) {
  prizeState.active = active;
  if (!active) {
    prizeState.editorAgent = "";
    prizeState.draftAmount = "";
  }
  syncPrizeModeButton();
  renderPodium(prizeState.podiumRacers);
}

function setActivePeriod(p) {
  [...periodSwitcher.querySelectorAll("[data-period]")].forEach((b) => {
    b.classList.toggle("is-active", b.dataset.period === p);
  });
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

function renderTrack(racers, leaderCount) {
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
        <article class="lane ${laneClass}" style="--progress:${Math.max(progress, 0.04)}; --hue:${r.colorHue}; --team-color:${r.teamColor || 'transparent'}">
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

function renderPodium(racers) {
  prizeState.podiumRacers = racers.slice(0, 3);

  if (racers.length < 3) {
    podium.innerHTML = "";
    return;
  }

  const medals = [
    { r: racers[1], cls: "silver", label: "Plata" },
    { r: racers[0], cls: "gold",   label: "Oro" },
    { r: racers[2], cls: "bronze", label: "Bronce" },
  ];

  podium.innerHTML = medals.map(({ r, cls }) => {
    const prizeKey = encodePrizeAgent(r.agent);
    const savedPrize = prizeState.awards[r.agent];
    const isEditing = prizeState.active && prizeState.editorAgent === r.agent;
    const hasPrize = Boolean(savedPrize || isEditing);
    const draftValue = isEditing ? prizeState.draftAmount : savedPrize ? String(savedPrize) : "";

    const prizeMarkup = prizeState.active && isEditing
      ? `
        <div class="podium-prize-zone">
          <div class="podium-prize-editor">
            <input class="prize-input" type="text" inputmode="numeric" placeholder="Monto MXN" value="${draftValue}" data-prize-input="${prizeKey}" />
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
            <button class="podium-prize-display ${prizeState.active ? "is-editable" : ""}" ${prizeState.active ? `type="button" data-prize-open="${prizeKey}"` : 'type="button" disabled'}>
              <span class="podium-prize-amount">${formatPrizeAmount(savedPrize)}</span>
            </button>
            ${prizeState.active ? `<button class="podium-prize-clear" type="button" data-prize-clear="${prizeKey}" title="Quitar premio">Quitar</button>` : ""}
          </div>
        `
        : prizeState.active
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
            <div class="podium-name">${r.agent}</div>
            <div class="podium-team">
              <span class="podium-team-dot" style="background:${r.teamColor}"></span>
              ${r.team}
            </div>
          </div>
          <div class="podium-score">${formatNumber(r.count)}</div>
        </div>
        ${prizeMarkup}
      </div>
    `;
  }).join("");
}

/* ══ Render: leaderboard ══ */

function renderLeaderboard(racers) {
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

let editorTeams = {};
let editorAssignments = {};
prizeState.awards = loadPrizeAwards();

async function openTeamEditor() {
  const pin = window.prompt("Ingresa el PIN para editar equipos");
  if (pin === null) return;

  if (pin.trim() !== TEAM_EDITOR_PIN) {
    window.alert("PIN incorrecto");
    return;
  }

  try {
    const res = await fetch("/api/teams");
    const data = await res.json();
    editorTeams = data.teams;
    editorAssignments = { ...data.assignments };
    renderEditorColumns();
    teamModal.classList.add("is-open");
  } catch (err) {
    console.error("Error loading teams:", err);
  }
}

function closeTeamEditor() {
  teamModal.classList.remove("is-open");
}

function renderEditorColumns() {
  const teamNames = Object.keys(editorTeams);
  const groups = {};
  for (const name of teamNames) groups[name] = [];

  for (const [agent, team] of Object.entries(editorAssignments)) {
    if (groups[team]) groups[team].push(agent);
    else if (teamNames[0]) { groups[teamNames[0]].push(agent); editorAssignments[agent] = teamNames[0]; }
  }

  for (const arr of Object.values(groups)) arr.sort((a, b) => a.localeCompare(b, "es"));

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
          ${agents.map((a) => `
            <div class="agent-chip" draggable="true" data-agent="${a}">
              <span class="chip-dot" style="background:hsl(${hashString(a)} 55% 52%)"></span>
              ${a}
            </div>`).join("")}
        </div>
      </div>`;
  }).join("");

  bindDragDrop();
}

function bindDragDrop() {
  const chips = teamEditor.querySelectorAll(".agent-chip");
  const cols = teamEditor.querySelectorAll(".team-col");

  chips.forEach((chip) => {
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", chip.dataset.agent);
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => chip.classList.add("dragging"));
    });
    chip.addEventListener("dragend", () => {
      chip.classList.remove("dragging");
      cols.forEach((c) => c.classList.remove("drag-over"));
    });
  });

  cols.forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove("drag-over");
    });
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const agent = e.dataTransfer.getData("text/plain");
      const newTeam = col.dataset.team;
      if (agent && newTeam && editorAssignments[agent] !== newTeam) {
        editorAssignments[agent] = newTeam;
        renderEditorColumns();
      }
    });
  });
}

async function saveTeamAssignments() {
  try {
    saveTeamsBtn.textContent = "Guardando...";
    await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: editorAssignments }),
    });
    closeTeamEditor();
    loadRace();
  } catch (err) {
    console.error("Error saving teams:", err);
  } finally {
    saveTeamsBtn.textContent = "Guardar cambios";
  }
}

editTeamsBtn.addEventListener("click", openTeamEditor);
closeModalBtn.addEventListener("click", closeTeamEditor);
saveTeamsBtn.addEventListener("click", saveTeamAssignments);
teamModal.addEventListener("click", (e) => { if (e.target === teamModal) closeTeamEditor(); });

async function togglePrizeMode() {
  if (prizeState.active) {
    setPrizeMode(false);
    return;
  }

  const pin = window.prompt("Ingresa el PIN para activar prize mode");
  if (pin === null) return;

  if (pin.trim() !== TEAM_EDITOR_PIN) {
    window.alert("PIN incorrecto");
    return;
  }

  setPrizeMode(true);
}

if (prizeModeButton) {
  prizeModeButton.addEventListener("click", togglePrizeMode);
  syncPrizeModeButton();
}

if (podium) {
  podium.addEventListener("click", (e) => {
    const openBtn = e.target.closest("[data-prize-open]");
    if (openBtn) {
      prizeState.editorAgent = decodePrizeAgent(openBtn.dataset.prizeOpen);
      prizeState.draftAmount = String(prizeState.awards[prizeState.editorAgent] || "");
      renderPodium(prizeState.podiumRacers);
      requestAnimationFrame(() => {
        podium.querySelector(`[data-prize-input="${openBtn.dataset.prizeOpen}"]`)?.focus();
      });
      return;
    }

    const editBtn = e.target.closest("[data-prize-edit]");
    if (editBtn) {
      prizeState.editorAgent = decodePrizeAgent(editBtn.dataset.prizeEdit);
      prizeState.draftAmount = String(prizeState.awards[prizeState.editorAgent] || "");
      renderPodium(prizeState.podiumRacers);
      requestAnimationFrame(() => {
        podium.querySelector(`[data-prize-input="${editBtn.dataset.prizeEdit}"]`)?.focus();
      });
      return;
    }

    const clearBtn = e.target.closest("[data-prize-clear]");
    if (clearBtn) {
      const agent = decodePrizeAgent(clearBtn.dataset.prizeClear);
      delete prizeState.awards[agent];
      savePrizeAwards();
      if (prizeState.editorAgent === agent) {
        prizeState.editorAgent = "";
        prizeState.draftAmount = "";
      }
      renderPodium(prizeState.podiumRacers);
      return;
    }

    const cancelBtn = e.target.closest("[data-prize-cancel]");
    if (cancelBtn) {
      prizeState.editorAgent = "";
      prizeState.draftAmount = "";
      renderPodium(prizeState.podiumRacers);
      return;
    }

    const confirmBtn = e.target.closest("[data-prize-confirm]");
    if (confirmBtn) {
      const prizeKey = confirmBtn.dataset.prizeConfirm;
      const agent = decodePrizeAgent(prizeKey);
      const input = podium.querySelector(`[data-prize-input="${prizeKey}"]`);
      const amount = normalizePrizeAmount(input?.value || prizeState.draftAmount);
      if (!amount) {
        window.alert("Ingresa un monto valido para el premio");
        input?.focus();
        return;
      }
      prizeState.awards[agent] = amount;
      savePrizeAwards();
      prizeState.editorAgent = "";
      prizeState.draftAmount = "";
      renderPodium(prizeState.podiumRacers);
    }
  });

  podium.addEventListener("input", (e) => {
    const input = e.target.closest("[data-prize-input]");
    if (!input) return;
    prizeState.draftAmount = input.value;
  });
}

/* ══ Fetch ══ */

function getFriendlyErrorMessage() {
  return "Ups, ahorita queda joven.";
}

async function loadRace(forceRefresh = false) {
  const params = new URLSearchParams({ period: state.period });
  if (state.anchorDate) params.set("anchor", state.anchorDate);
  if (forceRefresh) params.set("refresh", "1");

  track.innerHTML = `<div class="empty-state">Actualizando...</div>`;

  try {
    const res = await fetch(`/api/race?${params.toString()}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Error de carga");

    const { meta, race } = payload;
    state.latestDate = meta.latestDate;
    state.earliestDate = meta.earliestDate;
    state.anchorDate = state.anchorDate || meta.latestDate;

    anchorDateInput.value = state.anchorDate;
    anchorDateInput.max = meta.latestDate;
    anchorDateInput.min = meta.earliestDate;

    setActivePeriod(state.period);
    renderSummary(meta, race);
    renderLeaderBanner(race);
    renderTrack(race.racers, race.leaderCount);
    renderTeamBar(race.teamStandings);
    renderPodium(race.racers);
    renderLeaderboard(race.racers);
  } catch (err) {
    const friendlyMessage = getFriendlyErrorMessage(err);
    console.error("Error loading race:", err);
    track.innerHTML = `<div class="empty-state">${friendlyMessage}</div>`;
    leaderBanner.innerHTML = `<p class="leader-banner-label">Escuderia puntera</p><div class="leader-banner-main">Ups</div><p class="leader-banner-meta">${friendlyMessage}</p>`;
    leaderboardBody.innerHTML = `<tr><td colspan="6">${friendlyMessage}</td></tr>`;
  }
}

/* ══ Events ══ */

periodSwitcher.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-period]");
  if (!btn) return;
  state.period = btn.dataset.period;
  loadRace();
});

anchorDateInput.addEventListener("change", () => {
  state.anchorDate = anchorDateInput.value;
  loadRace();
});

refreshButton.addEventListener("click", () => loadRace(true));

/* ══ Jackpot ══ */

const jackpotButton = $("#jackpotButton");
if (jackpotButton) {
  jackpotButton.addEventListener("click", () => {
    window.open("/jackpot.html", "_blank");
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
    logo.addEventListener("animationend", function onSpin() {
      logo.removeEventListener("animationend", onSpin);
      logo.classList.remove("is-spinning");
      void logo.offsetWidth;
      logo.classList.add("is-bouncing");
      logo.addEventListener("animationend", function onBounce() {
        logo.removeEventListener("animationend", onBounce);
        logo.classList.remove("is-bouncing");
        void logo.offsetWidth;
        startDance();
      });
    });
  }

  // Start dancing right away, burst every 12s
  setTimeout(startDance, 500);
  setInterval(runBurst, 12000);
  setTimeout(runBurst, 3000);
})();

loadRace();
