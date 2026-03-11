const state = {
  period: "day",
  anchorDate: "",
  latestDate: "",
  earliestDate: "",
};

const $ = (s) => document.querySelector(s);
const summaryCards = $("#summaryCards");
const rangeLabel = $("#rangeLabel");
const track = $("#track");
const spotlight = $("#spotlight");
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

/* ══ Theme ══ */

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
}

themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

applyTheme(localStorage.getItem("theme") || "light");

/* ══ Gender detection ══ */

const FEMALE_NAMES = new Set([
  "adriana","alejandra","alicia","alma","ana","andrea","angela","angelica",
  "araceli","ariadna","beatriz","berenice","blanca","brenda","camila","carla",
  "carmen","carolina","catalina","cecilia","cecia","celia","claudia","cristina",
  "damariz","daniela","delia","diana","dulce","elena","elisa","elizabeth",
  "eloisa","erica","esperanza","estela","estefani","esther","eva","evelyn",
  "fatima","fernanda","flor","francisca","frida","gabriela","gloria","grace",
  "graciela","griselda","guadalupe","hilda","iliana","irene","irma","isabel",
  "ivette","ivonne","jacqueline","janet","jessica","jimena","josefina","juana",
  "julia","juliana","karen","karla","karina","laura","leticia","lilia",
  "liliana","lizbeth","lorena","lourdes","lucia","luisa","luz","magdalena",
  "marcela","margarita","maria","mariana","maribel","marina","marisol",
  "marlene","marta","martha","mercedes","michelle","minerva","miriam",
  "monica","nadia","nancy","natalia","nayeli","nery","nora","norma","ofelia",
  "olga","olivia","paola","patricia","paula","perla","pilar","priscila",
  "raquel","rebeca","regina","rocio","rosa","rosalba","rosario","roxana",
  "ruth","sandra","sara","selene","silvia","sofia","sonia","stephanie",
  "susana","tania","teresa","valentina","valeria","vanessa","veronica",
  "victoria","violeta","viridiana","viviana","wendy","ximena","xochitl",
  "yolanda","yuridia","yuridi","zoila","zulema","melissa","paloma",
]);

const MALE_A = new Set(["borja","garcia","joshua","josue","nikita","luca","jhasua"]);

function isFemale(fullName) {
  const first = fullName.trim().split(/\s+/)[0].toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (FEMALE_NAMES.has(first)) return true;
  if (MALE_A.has(first)) return false;
  return first.endsWith("a");
}

/* ══ SVG icons ══ */

function maleIcon(hue) {
  const s = `hsl(${hue} 50% 42%)`;
  const f = `hsl(${hue} 55% 72%)`;
  return `<svg viewBox="0 0 36 40" class="racer-icon" fill="none">
    <circle cx="18" cy="11" r="5.5" fill="${f}" stroke="${s}" stroke-width="1.6"/>
    <path d="M7 38c0-7.5 6-12 11-12s11 4.5 11 12" fill="${f}" stroke="${s}" stroke-width="1.6"/>
    <path d="M9.5 11c0-6.5 17-6.5 17 0" stroke="${s}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="7" y="9" width="3.2" height="4.8" rx="1.6" fill="${s}"/>
    <rect x="25.8" y="9" width="3.2" height="4.8" rx="1.6" fill="${s}"/>
    <path d="M7.2 13.8v2.5c0 .8.8 1.2 1.6 1.2h2.5" stroke="${s}" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

function femaleIcon(hue) {
  const s = `hsl(${hue} 50% 42%)`;
  const f = `hsl(${hue} 55% 72%)`;
  const h = `hsl(${hue} 35% 32%)`;
  return `<svg viewBox="0 0 36 40" class="racer-icon" fill="none">
    <path d="M12.5 6c-2.5.5-4 4-3.8 8.5l.3 4" stroke="${h}" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M23.5 6c2.5.5 4 4 3.8 8.5l-.3 4" stroke="${h}" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="18" cy="11" r="5.5" fill="${f}" stroke="${s}" stroke-width="1.6"/>
    <path d="M7 38c0-7.5 6-12 11-12s11 4.5 11 12" fill="${f}" stroke="${s}" stroke-width="1.6"/>
    <path d="M9.5 11c0-6.5 17-6.5 17 0" stroke="${s}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect x="7" y="9" width="3.2" height="4.8" rx="1.6" fill="${s}"/>
    <rect x="25.8" y="9" width="3.2" height="4.8" rx="1.6" fill="${s}"/>
    <path d="M7.2 13.8v2.5c0 .8.8 1.2 1.6 1.2h2.5" stroke="${s}" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
}

/* ══ Helpers ══ */

function hashString(v) {
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) % 360;
  return h;
}

function formatNumber(v) { return new Intl.NumberFormat("es-MX").format(v); }

function formatDate(v) {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${v}T00:00:00Z`));
}

function formatMonthYear(v) {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(`${v}T00:00:00Z`));
}

function setActivePeriod(p) {
  [...periodSwitcher.querySelectorAll("[data-period]")].forEach((b) => {
    b.classList.toggle("is-active", b.dataset.period === p);
  });
}

/* ══ Render: summary ══ */

function renderSummary(meta, race) {
  summaryCards.textContent =
    `${formatDate(race.anchor)} · ${race.label} · ${formatNumber(race.totalEntries)} reg · ${formatNumber(race.activeAgents)} vendedores`;
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
    track.innerHTML = `<div class="empty-state">No hay registros para ese corte.</div>`;
    return;
  }

  const target = Math.max(leaderCount * 2.2, 10);

  track.innerHTML = racers
    .slice(0, 8)
    .map((r) => {
      const progress = Math.min(r.count / target, 0.88);
      const icon = isFemale(r.agent) ? femaleIcon(r.colorHue) : maleIcon(r.colorHue);
      return `
        <article class="lane" style="--progress:${Math.max(progress, 0.04)}; --hue:${r.colorHue}; --team-color:${r.teamColor || 'transparent'}">
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
            <span>reg</span>
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

/* ══ Render: spotlight ══ */

function renderSpotlight(race) {
  const leader = race.racers[0];
  if (!leader) {
    spotlight.innerHTML = `
      <p class="eyebrow">Pole position</p>
      <h2>Sin datos</h2>
      <p class="spotlight-copy">No hay actividad.</p>`;
    return;
  }

  const ru = race.racers[1];
  const adv = ru ? leader.count - ru.count : leader.count;

  spotlight.innerHTML = `
    <p class="eyebrow">Pole position</p>
    <h2>${leader.agent}</h2>
    <div class="spotlight-team">
      <span class="spot-dot" style="background:${leader.teamColor}"></span>
      ${leader.team} · ${leader.supervisor || "—"}
    </div>
    <span class="spotlight-badge">#${leader.rank}</span>
    <div class="spotlight-value">${formatNumber(leader.count)}</div>
    <p class="spotlight-copy">
      ${ru ? `+${formatNumber(adv)} sobre ${ru.agent}` : "Sin rival cercano"}
    </p>`;
}

/* ══ Render: leaderboard ══ */

function renderLeaderboard(racers) {
  if (!racers.length) {
    leaderboardBody.innerHTML = `<tr><td colspan="5">Sin vendedores activos.</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = racers
    .map((r) => `
      <tr>
        <td>${r.rank}</td>
        <td><span class="badge"><span class="dot" style="--hue:${r.colorHue}"></span>${r.agent}</span></td>
        <td><span class="team-dot" style="background:${r.teamColor}"></span>${r.team}</td>
        <td>${formatNumber(r.count)}</td>
        <td>${r.gap === 0 ? "Lider" : `−${formatNumber(r.gap)}`}</td>
      </tr>`)
    .join("");
}

/* ══ Team editor (drag & drop) ══ */

let editorTeams = {};
let editorAssignments = {};

async function openTeamEditor() {
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

/* ══ Fetch ══ */

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
    renderSpotlight(race);
    renderLeaderboard(race.racers);
  } catch (err) {
    track.innerHTML = `<div class="empty-state">${err.message}</div>`;
    leaderBanner.innerHTML = `<p class="leader-banner-label">Escuderia puntera</p><div class="leader-banner-main">Error</div><p class="leader-banner-meta">${err.message}</p>`;
    spotlight.innerHTML = `<p class="eyebrow">Pole position</p><h2>Error</h2><p class="spotlight-copy">${err.message}</p>`;
    leaderboardBody.innerHTML = `<tr><td colspan="5">${err.message}</td></tr>`;
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

loadRace();
