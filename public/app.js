const state = {
  lists: [],
  totalBallots: 0,
  expressedVotes: 0,
  registeredVoters: 0,
  participationPercent: null,
  writeProtectionEnabled: false,
  authMode: "none",
  isWriteUnlocked: false,
  isAdminView: false,
  blankVotes: 0,
  nullVotes: 0,
  gap: 0,
  leader: null,
  hasTieForLead: false,
  seatAllocation: null,
  history: [],
  updatedAt: null
};

let resetArmTimeout = null;
let isResetArmed = false;
let isAdminDrawerOpen = false;
let isConfigCollapsed = false;
const CONFIG_COLLAPSE_KEY = "depouillement-config-collapsed";
const SIMULATION_COLLAPSE_KEY = "depouillement-simulation-enabled";
const MANUAL_COLLAPSE_KEY = "depouillement-manual-collapsed";
const DEFAULT_TOTAL_SEATS = 19;
const CHARTER_COLORS = ["#004a6d", "#fcc549"];
const UNDO_HOLD_MS = 450;
let currentWritePin = "";
let isSimulationEnabled = false;
let isManualCollapsed = true;
let undoHoldTimeout = null;
let isUndoHolding = false;
const simulationVotesByList = {};

const elements = {
  status: document.getElementById("status"),
  adminMenuButton: document.getElementById("admin-menu-button"),
  adminDrawer: document.getElementById("admin-drawer"),
  adminBackdrop: document.getElementById("admin-backdrop"),
  adminCloseButton: document.getElementById("admin-close-button"),
  adminOnlySections: document.querySelectorAll(".admin-only"),
  accessForm: document.getElementById("access-form"),
  accessUsernameLabel: document.getElementById("access-username-label"),
  accessUsername: document.getElementById("access-username"),
  accessPasswordLabel: document.getElementById("access-password-label"),
  accessPassword: document.getElementById("access-password"),
  accessPinLabel: document.getElementById("access-pin-label"),
  accessPin: document.getElementById("access-pin"),
  accessHelp: document.getElementById("access-help"),
  accessModeBadge: document.getElementById("access-mode-badge"),
  unlockButton: document.getElementById("unlock-button"),
  lockButton: document.getElementById("lock-button"),
  configPanel: document.getElementById("config-panel"),
  configToggle: document.getElementById("config-toggle"),
  configLabel1: document.getElementById("config-label-1"),
  configLabel2: document.getElementById("config-label-2"),
  configForm: document.getElementById("config-form"),
  name1: document.getElementById("name-1"),
  name2: document.getElementById("name-2"),
  registeredVotersInput: document.getElementById("registered-voters"),
  lists: document.getElementById("lists"),
  specialVotes: document.getElementById("special-votes"),
  lastUpdate: document.getElementById("last-update"),
  liveModeBadge: document.getElementById("live-mode-badge"),
  totalBallots: document.getElementById("total-ballots"),
  expressedVotes: document.getElementById("expressed-votes"),
  registeredVotersDisplay: document.getElementById("registered-voters-display"),
  participationRate: document.getElementById("participation-rate"),
  participationDetail: document.getElementById("participation-detail"),
  blankVotes: document.getElementById("blank-votes"),
  nullVotes: document.getElementById("null-votes"),
  leaderCard: document.getElementById("leader-card"),
  leader: document.getElementById("leader"),
  winnerSeatsCard: document.getElementById("winner-seats-card"),
  winnerSeats: document.getElementById("winner-seats"),
  gap: document.getElementById("gap"),
  bars: document.getElementById("bars"),
  seatsTitle: document.getElementById("seats-title"),
  seatsSummary: document.getElementById("seats-summary"),
  seatsDistributionInfo: document.getElementById("seats-distribution-info"),
  seatsQuotientInfo: document.getElementById("seats-quotient-info"),
  seatsTable: document.getElementById("seats-table"),
  simulationPanel: document.getElementById("simulation-panel"),
  simulationToggle: document.getElementById("simulation-toggle"),
  simulationContent: document.getElementById("simulation-content"),
  simulationSubtitle: document.getElementById("simulation-subtitle"),
  simulationDistributionInfo: document.getElementById("simulation-distribution-info"),
  simulationForm: document.getElementById("simulation-form"),
  simulationLabel1: document.getElementById("simulation-label-1"),
  simulationLabel2: document.getElementById("simulation-label-2"),
  simulationVotes1: document.getElementById("simulation-votes-1"),
  simulationVotes2: document.getElementById("simulation-votes-2"),
  simulationPercent1: document.getElementById("simulation-percent-1"),
  simulationPercent2: document.getElementById("simulation-percent-2"),
  simulationQuotientInfo: document.getElementById("simulation-quotient-info"),
  simulationResult: document.getElementById("simulation-result"),
  history: document.getElementById("history"),
  manualEdit: document.getElementById("manual-edit"),
  manualToggle: document.getElementById("manual-toggle"),
  manualContent: document.getElementById("manual-content"),
  manualForm: document.getElementById("manual-form"),
  manualLabel1: document.getElementById("manual-label-1"),
  manualLabel2: document.getElementById("manual-label-2"),
  manualVotes1: document.getElementById("manual-votes-1"),
  manualVotes2: document.getElementById("manual-votes-2"),
  manualBlankVotes: document.getElementById("manual-blank-votes"),
  manualNullVotes: document.getElementById("manual-null-votes"),
  manualSubmit: document.getElementById("manual-submit"),
  resetHint: document.getElementById("reset-hint"),
  resetButton: document.getElementById("reset-button"),
  undoButton: document.getElementById("undo-button")
};

function formatPercentage(value) {
  return `${value.toFixed(1).replace(".", ",")} %`;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString("fr-FR", { hour12: false });
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("fr-FR", { hour12: false });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[char];
  });
}

function formatDecimal(value, decimals = 2) {
  return Number(value).toFixed(decimals).replace(".", ",");
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function canWrite() {
  return state.isAdminView && (!state.writeProtectionEnabled || state.isWriteUnlocked);
}

function setAdminDrawerOpen(open) {
  isAdminDrawerOpen = open;
  elements.adminDrawer.hidden = !open;
  if (elements.adminBackdrop) {
    elements.adminBackdrop.hidden = !open;
  }
  document.body.classList.toggle("admin-drawer-open", open);
}

function setAdminView(active) {
  state.isAdminView = active;
  if (!active) {
    state.isWriteUnlocked = false;
    currentWritePin = "";
  } else if (!state.writeProtectionEnabled) {
    state.isWriteUnlocked = true;
  }
}

function setInputValueIfIdle(input, value) {
  if (document.activeElement !== input) {
    input.value = String(value);
  }
}

function computeSeatAllocationDetailed(listsInput, totalSeatsInput = DEFAULT_TOTAL_SEATS) {
  const lists = listsInput.map((list) => ({ ...list, votes: Math.max(0, Number(list.votes) || 0) }));
  const expressedVotes = sum(lists.map((list) => list.votes));
  const totalSeats =
    Number.isInteger(totalSeatsInput) && totalSeatsInput > 0 ? totalSeatsInput : DEFAULT_TOTAL_SEATS;
  const primeSeats = Math.ceil(totalSeats / 2);
  const proportionalSeats = totalSeats - primeSeats;
  const thresholdPercent = 5;
  const thresholdVotesRaw = expressedVotes * (thresholdPercent / 100);
  const quotientElectoral = proportionalSeats > 0 ? expressedVotes / proportionalSeats : 0;

  if (expressedVotes === 0) {
    return {
      status: "no_expressed_votes",
      expressedVotes,
      totalSeats,
      primeSeats,
      proportionalSeats,
      thresholdPercent,
      thresholdVotes: 0,
      quotientElectoral: 0,
      rows: lists.map((list) => ({
        ...list,
        initialProportionalSeats: 0,
        proportionalSeats: 0,
        primeBonus: 0,
        totalSeats: 0,
        eligible: false
      })),
      rounds: [],
      leaderId: null,
      leaderName: null,
      hasTieForLead: false
    };
  }

  const sorted = [...lists].sort((a, b) => b.votes - a.votes);
  const leaderCandidate = sorted[0];
  const runnerUp = sorted[1];
  const hasTieForLead = Boolean(runnerUp && leaderCandidate && leaderCandidate.votes === runnerUp.votes);
  if (hasTieForLead || !leaderCandidate) {
    return {
      status: "tie_for_lead",
      expressedVotes,
      totalSeats,
      primeSeats,
      proportionalSeats,
      thresholdPercent,
      thresholdVotes: Number(thresholdVotesRaw.toFixed(2)),
      quotientElectoral: Number(quotientElectoral.toFixed(4)),
      rows: lists.map((list) => ({
        ...list,
        initialProportionalSeats: 0,
        proportionalSeats: 0,
        primeBonus: 0,
        totalSeats: 0,
        eligible: list.votes >= thresholdVotesRaw
      })),
      rounds: [],
      leaderId: null,
      leaderName: null,
      hasTieForLead: true
    };
  }

  const leaderId = leaderCandidate.id;
  const eligibleLists = lists.filter((list) => list.votes >= thresholdVotesRaw);
  const proportionalByListId = Object.fromEntries(lists.map((list) => [list.id, 0]));
  const initialByListId = Object.fromEntries(lists.map((list) => [list.id, 0]));

  if (quotientElectoral > 0) {
    for (const list of eligibleLists) {
      const seats = Math.floor(list.votes / quotientElectoral);
      proportionalByListId[list.id] = seats;
      initialByListId[list.id] = seats;
    }
  }

  let remaining = Math.max(0, proportionalSeats - sum(eligibleLists.map((list) => proportionalByListId[list.id] || 0)));
  const rounds = [];

  while (remaining > 0 && eligibleLists.length > 0) {
    const ranked = [...eligibleLists]
      .map((list) => {
        const currentSeats = proportionalByListId[list.id] || 0;
        return {
          listId: list.id,
          listName: list.name,
          votes: list.votes,
          currentSeats,
          average: list.votes / (currentSeats + 1)
        };
      })
      .sort((a, b) => {
        if (b.average !== a.average) return b.average - a.average;
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.listId.localeCompare(b.listId);
      });

    const winner = ranked[0];
    rounds.push({
      round: rounds.length + 1,
      winnerId: winner.listId,
      winnerName: winner.listName,
      winnerAverage: winner.average,
      candidates: ranked
    });
    proportionalByListId[winner.listId] = (proportionalByListId[winner.listId] || 0) + 1;
    remaining -= 1;
  }

  const rows = lists.map((list) => {
    const proportional = proportionalByListId[list.id] || 0;
    const primeBonus = list.id === leaderId ? primeSeats : 0;
    return {
      ...list,
      initialProportionalSeats: initialByListId[list.id] || 0,
      proportionalSeats: proportional,
      primeBonus,
      totalSeats: primeBonus + proportional,
      eligible: list.votes >= thresholdVotesRaw
    };
  });

  return {
    status: "ok",
    expressedVotes,
    totalSeats,
    primeSeats,
    proportionalSeats,
    thresholdPercent,
    thresholdVotes: Number(thresholdVotesRaw.toFixed(2)),
    quotientElectoral: Number(quotientElectoral.toFixed(4)),
    rows,
    rounds,
    leaderId,
    leaderName: leaderCandidate.name,
    hasTieForLead: false
  };
}

function historyLabel(entry) {
  if (!entry) return "";
  if (entry.type === "vote") {
    const sign = entry.delta > 0 ? `+${entry.delta}` : String(entry.delta);
    return `${formatDate(entry.at)} - ${entry.listName} ${sign}`;
  }
  if (entry.type === "special_vote") {
    const sign = entry.delta > 0 ? `+${entry.delta}` : String(entry.delta);
    return `${formatDate(entry.at)} - ${entry.label} ${sign}`;
  }
  if (entry.type === "reset") {
    return `${formatDate(entry.at)} - Remise à zéro`;
  }
  if (entry.type === "config") {
    return `${formatDate(entry.at)} - Noms des listes modifiés`;
  }
  if (entry.type === "set_totals") {
    return `${formatDate(entry.at)} - Totaux saisis manuellement`;
  }
  return `${formatDate(entry.at)} - Action`;
}

function getLastActionMarker() {
  const latest = state.history[0];
  if (!latest || typeof latest !== "object") {
    return null;
  }
  if (latest.type === "vote" && typeof latest.listId === "string") {
    return { type: "vote", listId: latest.listId };
  }
  if (latest.type === "special_vote" && (latest.kind === "blank" || latest.kind === "null")) {
    return { type: "special_vote", kind: latest.kind };
  }
  return null;
}

function renderLists() {
  const writable = canWrite();
  const lastMarker = getLastActionMarker();
  elements.lists.innerHTML = state.lists
    .map((list, index) => {
      const isLastAction = lastMarker?.type === "vote" && lastMarker.listId === list.id;
      return `
      <button class="quick-button candidate candidate-${index + 1} ${isLastAction ? "is-last-action" : ""}" data-action="vote" data-list-id="${list.id}" data-delta="1" aria-disabled="${
        writable ? "false" : "true"
      }">
        <span class="quick-title">${escapeHtml(list.name)}</span>
        <span class="quick-meta">
          <span class="quick-count">${list.votes}</span>
          <span class="quick-percent">${formatPercentage(list.percentage)}</span>
        </span>
        ${isLastAction ? '<span class="last-action-tag">Dernière action</span>' : ""}
      </button>
    `;
    })
    .join("");
}

function renderBars() {
  elements.bars.innerHTML = state.lists
    .map(
      (list, index) => `
      <div>
        <div class="bar-label">
          <strong>${escapeHtml(list.name)}</strong>
          <span>${list.votes} (${formatPercentage(list.percentage)})</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${list.percentage}%;background:${CHARTER_COLORS[index % CHARTER_COLORS.length]}"></div>
        </div>
      </div>
    `
    )
    .join("");
}

function renderSpecialVotes() {
  const writable = canWrite();
  const lastMarker = getLastActionMarker();
  const special = [
    { kind: "blank", label: "Blancs", votes: state.blankVotes, className: "blanc" },
    { kind: "null", label: "Nuls", votes: state.nullVotes, className: "nul" }
  ];

  elements.specialVotes.innerHTML = special
    .map((item) => {
      const isLastAction = lastMarker?.type === "special_vote" && lastMarker.kind === item.kind;
      return `
      <button class="quick-button soft ${item.className} ${isLastAction ? "is-last-action" : ""}" data-action="special-vote" data-kind="${item.kind}" data-delta="1" aria-disabled="${
        writable ? "false" : "true"
      }">
        <span class="quick-title">${escapeHtml(item.label)}</span>
        <span class="quick-meta">
          <span class="quick-count">${item.votes}</span>
        </span>
        ${isLastAction ? '<span class="last-action-tag">Dernière action</span>' : ""}
      </button>
    `;
    })
    .join("");
}

function renderSeatAllocation() {
  const allocation = state.seatAllocation;
  if (!allocation) {
    elements.seatsTitle.textContent = `Calcul des élus (${DEFAULT_TOTAL_SEATS} sièges)`;
    elements.seatsSummary.textContent = "Calcul indisponible pour le moment.";
    elements.seatsDistributionInfo.textContent = "Sieges a repartir: -";
    elements.seatsQuotientInfo.textContent = "QE: -";
    elements.seatsTable.innerHTML = "";
    return;
  }
  elements.seatsTitle.textContent = `Calcul des élus (${allocation.totalSeats} sièges)`;
  elements.seatsDistributionInfo.textContent = `Sièges à répartir (proportionnelle) : ${allocation.totalSeats} - ${allocation.primeSeats} = ${allocation.proportionalSeats}`;

  const quotientLabel = `QE: ${state.expressedVotes} / ${allocation.proportionalSeats} = ${formatDecimal(
    allocation.quotientElectoral,
    2
  )}`;
  elements.seatsQuotientInfo.textContent = quotientLabel;

  if (allocation.status === "no_expressed_votes") {
    elements.seatsSummary.textContent =
      `Ajoute des suffrages exprimés pour calculer la répartition des ${allocation.totalSeats} sièges.`;
    elements.seatsTable.innerHTML = '<p class="seats-note">Aucun siège ne peut être calculé sans suffrage exprimé.</p>';
    return;
  }

  if (allocation.status === "tie_for_lead") {
    elements.seatsSummary.textContent =
      "Égalité en tête : il faut départager la liste en tête pour attribuer la prime majoritaire.";
    elements.seatsTable.innerHTML = '<p class="seats-note">Le calcul des élus reste en attente d\'une tête de liste unique.</p>';
    return;
  }

  const sortedRows = [...allocation.rows].sort((a, b) => {
    if (b.totalSeats !== a.totalSeats) return b.totalSeats - a.totalSeats;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.listName.localeCompare(b.listName);
  });

  elements.seatsSummary.textContent = `Prime majoritaire : ${allocation.primeSeats} sièges pour ${allocation.leaderName}. Quotient électoral : ${allocation.quotientElectoral}.`;

  elements.seatsTable.innerHTML = `
    <div class="table-wrap">
      <table class="seats-table">
        <thead>
          <tr>
            <th>Liste</th>
            <th>Voix</th>
            <th>Proportionnelle</th>
            <th>Prime</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRows
            .map(
              (row) => `
              <tr class="${row.listId === allocation.leaderId ? "leader-row" : ""}">
                <td>${escapeHtml(row.listName)}</td>
                <td>${row.votes}</td>
                <td>${row.proportionalSeats}</td>
                <td>${row.primeBonus}</td>
                <td><strong>${row.totalSeats}</strong></td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function setSimulationEnabled(enabled) {
  isSimulationEnabled = enabled;
  elements.simulationPanel.classList.toggle("enabled", enabled);
  elements.simulationToggle.textContent = enabled ? "Désactiver" : "Activer";
  try {
    localStorage.setItem(SIMULATION_COLLAPSE_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage errors on restricted browsers.
  }
}

function loadSimulationPreference() {
  try {
    return localStorage.getItem(SIMULATION_COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function syncSimulationVotesWithCurrentState() {
  for (const list of state.lists) {
    if (!Number.isInteger(simulationVotesByList[list.id])) {
      simulationVotesByList[list.id] = list.votes;
    }
  }
}

function updateSimulationLabels() {
  const list1 = state.lists[0];
  const list2 = state.lists[1];
  if (list1) {
    elements.simulationLabel1.textContent = list1.name;
  }
  if (list2) {
    elements.simulationLabel2.textContent = list2.name;
  }
}

function setSimulationInputValues() {
  const list1 = state.lists[0];
  const list2 = state.lists[1];
  if (!list1 || !list2) return;
  elements.simulationVotes1.value = String(simulationVotesByList[list1.id] ?? list1.votes ?? 0);
  elements.simulationVotes2.value = String(simulationVotesByList[list2.id] ?? list2.votes ?? 0);
}

function parseSimulationVotes() {
  const list1 = state.lists[0];
  const list2 = state.lists[1];
  if (!list1 || !list2) return [];

  const votes1 = Math.max(0, Number.parseInt(elements.simulationVotes1.value || "0", 10) || 0);
  const votes2 = Math.max(0, Number.parseInt(elements.simulationVotes2.value || "0", 10) || 0);
  simulationVotesByList[list1.id] = votes1;
  simulationVotesByList[list2.id] = votes2;
  return [
    { id: list1.id, name: list1.name, votes: votes1 },
    { id: list2.id, name: list2.name, votes: votes2 }
  ];
}

function updateSimulationPercentages(simulatedLists) {
  if (!simulatedLists.length) return;
  const totalSimulated = sum(simulatedLists.map((item) => item.votes));
  const pct = (votes) => (totalSimulated > 0 ? (votes / totalSimulated) * 100 : 0);
  const list1Percent = pct(simulatedLists[0].votes);
  const list2Percent = pct(simulatedLists[1].votes);
  elements.simulationPercent1.textContent = `${formatPercentage(list1Percent)} des exprimés simulés`;
  elements.simulationPercent2.textContent = `${formatPercentage(list2Percent)} des exprimés simulés`;
}

function renderSimulationResult() {
  const seatBase = Number(state.seatAllocation?.totalSeats) || DEFAULT_TOTAL_SEATS;
  elements.simulationSubtitle.textContent = `Simule une répartition sur ${seatBase} sièges avec des voix exprimées fictives.`;
  if (!isSimulationEnabled) {
    elements.simulationDistributionInfo.textContent = "Sièges à répartir en simulation : -";
    elements.simulationQuotientInfo.textContent = "QE simulation: -";
    elements.simulationResult.innerHTML = "";
    return;
  }

  const simulatedLists = parseSimulationVotes();
  updateSimulationPercentages(simulatedLists);
  const allocation = computeSeatAllocationDetailed(
    simulatedLists,
    seatBase
  );
  elements.simulationDistributionInfo.textContent = `Sièges à répartir en simulation : ${allocation.totalSeats} - ${allocation.primeSeats} = ${allocation.proportionalSeats}`;
  elements.simulationQuotientInfo.textContent = `QE simulation: ${
    allocation.expressedVotes
  } / ${allocation.proportionalSeats} = ${formatDecimal(allocation.quotientElectoral, 2)}`;

  if (allocation.status === "no_expressed_votes") {
    elements.simulationResult.innerHTML =
      '<p class="seats-note">Entre des voix exprimées pour lancer la simulation des élus.</p>';
    return;
  }

  if (allocation.status === "tie_for_lead") {
    elements.simulationResult.innerHTML =
      `<p class="seats-note">Égalité en tête dans la simulation : il faut un gagnant unique pour attribuer la prime de ${allocation.primeSeats} sièges.</p>`;
    return;
  }

  const initialAllocated = sum(allocation.rows.map((row) => row.initialProportionalSeats));
  const remainderSeats = Math.max(0, allocation.proportionalSeats - initialAllocated);
  const finalRows = [...allocation.rows].sort((a, b) => b.totalSeats - a.totalSeats);

  elements.simulationResult.innerHTML = `
    <div class="simulation-step">
      <h3>1. Prime majoritaire</h3>
      <p>La liste en tête (${escapeHtml(allocation.leaderName)}) reçoit <strong>${allocation.primeSeats} sièges</strong>.</p>
    </div>
    <div class="simulation-step">
      <h3>2. Sièges restant à répartir</h3>
      <p>${allocation.totalSeats} - ${allocation.primeSeats} = <strong>${allocation.proportionalSeats} sièges</strong> en proportionnelle.</p>
    </div>
    <div class="simulation-step">
      <h3>3. Quotient électoral</h3>
      <p>QE = suffrages exprimés / ${allocation.proportionalSeats} = ${allocation.expressedVotes} / ${allocation.proportionalSeats} = <strong>${formatDecimal(allocation.quotientElectoral, 2)}</strong></p>
    </div>
    <div class="simulation-step">
      <h3>4. Attribution initiale</h3>
      <div class="table-wrap">
        <table class="seats-table compact">
          <thead>
            <tr><th>Liste</th><th>Voix</th><th>Sièges initiaux</th></tr>
          </thead>
          <tbody>
            ${allocation.rows
              .map(
                (row) => `
                <tr>
                  <td>${escapeHtml(row.name)}</td>
                  <td>${row.votes}</td>
                  <td>${row.initialProportionalSeats}</td>
                </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <p>Total initial : <strong>${initialAllocated}</strong> siège(s). Reste : <strong>${remainderSeats}</strong>.</p>
    </div>
    <div class="simulation-step">
      <h3>5. Plus forte moyenne</h3>
      ${
        allocation.rounds.length
          ? `<div class="table-wrap">
              <table class="seats-table compact">
                <thead>
                  <tr><th>Tour</th><th>Moyennes</th><th>Siège attribué</th></tr>
                </thead>
                <tbody>
                  ${allocation.rounds
                    .map(
                      (round) => `
                      <tr>
                        <td>${round.round}</td>
                        <td>${round.candidates
                          .map((c) => `${escapeHtml(c.listName)}: ${formatDecimal(c.average, 2)}`)
                          .join(" | ")}</td>
                        <td>${escapeHtml(round.winnerName)}</td>
                      </tr>
                    `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
          : '<p class="seats-note">Aucun tour supplémentaire nécessaire.</p>'
      }
    </div>
    <div class="simulation-step">
      <h3>6. Resultat final</h3>
      <div class="table-wrap">
        <table class="seats-table">
          <thead>
            <tr><th>Liste</th><th>Proportionnelle</th><th>Prime</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${finalRows
              .map(
                (row) => `
                <tr class="${row.id === allocation.leaderId ? "leader-row" : ""}">
                  <td>${escapeHtml(row.name)}</td>
                  <td>${row.proportionalSeats}</td>
                  <td>${row.primeBonus}</td>
                  <td><strong>${row.totalSeats}</strong></td>
                </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAccessControls() {
  const menuLabel = state.isAdminView ? "Admin actif" : "Menu admin";
  elements.adminMenuButton.textContent = menuLabel;
  elements.adminMenuButton.classList.toggle("active", state.isAdminView);

  elements.adminOnlySections.forEach((section) => {
    section.hidden = !state.isAdminView;
  });
  if (elements.simulationPanel) {
    elements.simulationPanel.hidden = !canWrite();
  }

  const isAccountMode = state.authMode === "account";
  const isPinMode = state.authMode === "pin";
  if (elements.accessUsernameLabel) {
    elements.accessUsernameLabel.hidden = !isAccountMode;
  }
  if (elements.accessPasswordLabel) {
    elements.accessPasswordLabel.hidden = !isAccountMode;
  }
  if (elements.accessPinLabel) {
    elements.accessPinLabel.hidden = !isPinMode;
  }

  if (state.authMode === "none" || !state.writeProtectionEnabled) {
    elements.accessModeBadge.textContent = state.isAdminView ? "Admin local" : "Lecture seule";
    elements.accessModeBadge.className = state.isAdminView
      ? "access-badge open"
      : "access-badge readonly";
    elements.accessHelp.textContent =
      "Aucune protection serveur active. Configure ADMIN_USERNAME et ADMIN_PASSWORD pour activer la connexion par compte.";
    elements.accessPin.disabled = false;
    if (elements.accessUsername) elements.accessUsername.disabled = false;
    if (elements.accessPassword) elements.accessPassword.disabled = false;
    elements.unlockButton.textContent = "Entrer en mode admin";
    elements.unlockButton.disabled = state.isAdminView;
    elements.lockButton.disabled = !state.isAdminView;
    if (elements.liveModeBadge) {
      elements.liveModeBadge.textContent = state.isAdminView ? "Mode admin" : "Mode lecteur";
      elements.liveModeBadge.className = state.isAdminView ? "mode-chip mode-admin" : "mode-chip mode-readonly";
    }
    return;
  }

  elements.accessPin.disabled = false;
  if (elements.accessUsername) elements.accessUsername.disabled = false;
  if (elements.accessPassword) elements.accessPassword.disabled = false;
  elements.unlockButton.textContent = isAccountMode ? "Connexion compte" : "Se connecter admin";
  elements.unlockButton.disabled = state.isAdminView;
  elements.lockButton.disabled = !state.isAdminView;
  if (state.isWriteUnlocked && state.isAdminView) {
    elements.accessModeBadge.textContent = "Admin connecté";
    elements.accessModeBadge.className = "access-badge write";
    elements.accessHelp.textContent =
      "Mode admin actif sur cet appareil. La session reste ouverte après rechargement.";
    if (elements.liveModeBadge) {
      elements.liveModeBadge.textContent = "Mode admin";
      elements.liveModeBadge.className = "mode-chip mode-admin";
    }
  } else {
      elements.accessModeBadge.textContent = "Lecture seule";
    elements.accessModeBadge.className = "access-badge readonly";
    elements.accessHelp.textContent =
      isAccountMode
        ? "Saisis identifiant et mot de passe admin pour activer la saisie."
        : "Entre le PIN pour activer le mode admin sur cet appareil.";
    if (elements.liveModeBadge) {
      elements.liveModeBadge.textContent = "Mode lecteur";
      elements.liveModeBadge.className = "mode-chip mode-readonly";
    }
  }
}

function renderManualTotals() {
  const list1 = state.lists[0];
  const list2 = state.lists[1];
  if (!list1 || !list2) return;
  elements.manualLabel1.textContent = list1.name;
  elements.manualLabel2.textContent = list2.name;
  setInputValueIfIdle(elements.manualVotes1, list1.votes);
  setInputValueIfIdle(elements.manualVotes2, list2.votes);
  setInputValueIfIdle(elements.manualBlankVotes, state.blankVotes);
  setInputValueIfIdle(elements.manualNullVotes, state.nullVotes);

  const writable = canWrite();
  elements.manualVotes1.disabled = !writable;
  elements.manualVotes2.disabled = !writable;
  elements.manualBlankVotes.disabled = !writable;
  elements.manualNullVotes.disabled = !writable;
  elements.manualSubmit.disabled = !writable;
}

function setConfigCollapsed(collapsed) {
  isConfigCollapsed = collapsed;
  elements.configPanel.classList.toggle("collapsed", collapsed);
  elements.configToggle.textContent = collapsed ? "Modifier" : "Replier";
  try {
    localStorage.setItem(CONFIG_COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore storage errors on restricted browsers.
  }
}

function loadConfigCollapsePreference() {
  try {
    const value = localStorage.getItem(CONFIG_COLLAPSE_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

function setManualCollapsed(collapsed) {
  isManualCollapsed = collapsed;
  if (!elements.manualEdit || !elements.manualToggle) return;
  elements.manualEdit.classList.toggle("collapsed", collapsed);
  elements.manualToggle.textContent = collapsed ? "Afficher" : "Replier";
  try {
    localStorage.setItem(MANUAL_COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore storage errors on restricted browsers.
  }
}

function loadManualCollapsePreference() {
  try {
    const value = localStorage.getItem(MANUAL_COLLAPSE_KEY);
    if (value === "1") return true;
    if (value === "0") return false;
    return true;
  } catch {
    return true;
  }
}

function setResetHint(message = "") {
  elements.resetHint.textContent = message;
  elements.resetHint.classList.toggle("visible", Boolean(message));
}

function disarmResetButton(message = "") {
  isResetArmed = false;
  if (resetArmTimeout) {
    clearTimeout(resetArmTimeout);
    resetArmTimeout = null;
  }
  elements.resetButton.classList.remove("armed");
  elements.resetButton.textContent = "Remettre à 0";
  setResetHint(message);
}

function armResetButton() {
  isResetArmed = true;
  elements.resetButton.classList.add("armed");
  elements.resetButton.textContent = "Confirmer 0";
  setResetHint("Action sensible : appuie une 2e fois pour confirmer.");
  resetArmTimeout = setTimeout(() => {
    disarmResetButton();
  }, 2500);
}

function setUndoButtonIdleLabel() {
  if (elements.undoButton) {
    elements.undoButton.textContent = "Annuler (maintenir)";
  }
}

function clearUndoHoldState() {
  if (undoHoldTimeout) {
    clearTimeout(undoHoldTimeout);
    undoHoldTimeout = null;
  }
  isUndoHolding = false;
  if (elements.undoButton) {
    elements.undoButton.classList.remove("holding");
  }
  setUndoButtonIdleLabel();
}

async function performUndo() {
  if (!canWrite()) return;
  try {
    const payload = await callApi("/api/undo");
    mergeState(payload);
    hapticFeedback();
  } catch (error) {
    alert(error.message);
  }
}

function renderHistory() {
  if (!state.history.length) {
    elements.history.innerHTML = "<li>Aucune action pour le moment.</li>";
    return;
  }
  elements.history.innerHTML = state.history
    .slice(0, 12)
    .map((entry) => `<li>${escapeHtml(historyLabel(entry))}</li>`)
    .join("");
}

function render() {
  renderLists();
  renderSpecialVotes();
  renderBars();
  renderSeatAllocation();
  renderHistory();
  elements.totalBallots.textContent = String(state.totalBallots);
  elements.expressedVotes.textContent = String(state.expressedVotes);
  elements.registeredVotersDisplay.textContent = String(state.registeredVoters);
  elements.participationRate.textContent =
    state.participationPercent === null ? "-" : formatPercentage(state.participationPercent);
  elements.participationDetail.textContent = `${state.totalBallots} / ${state.registeredVoters}`;
  elements.blankVotes.textContent = String(state.blankVotes);
  elements.nullVotes.textContent = String(state.nullVotes);
  elements.gap.textContent = String(state.gap);
  let leaderLabel = "-";
  let winnerTone = "winner-none";
  if (state.expressedVotes > 0) {
    leaderLabel = state.hasTieForLead ? "Égalité" : state.leader?.name || "-";
    if (!state.hasTieForLead && state.leader?.id === "liste-1") {
      winnerTone = "winner-candidate-1";
    } else if (!state.hasTieForLead && state.leader?.id === "liste-2") {
      winnerTone = "winner-candidate-2";
    }
  }
  elements.leader.textContent = leaderLabel;
  if (elements.leaderCard) {
    elements.leaderCard.className = `stat-card stat-winner stat-focus ${winnerTone}`;
  }
  let seatsLabel = "-";
  if (!state.hasTieForLead && state.leader && state.seatAllocation?.status === "ok") {
    const winnerRow = state.seatAllocation.rows.find((row) => row.listId === state.leader.id);
    if (winnerRow) {
      seatsLabel = String(winnerRow.totalSeats);
    }
  }
  if (elements.winnerSeats) {
    elements.winnerSeats.textContent = seatsLabel;
  }
  if (elements.winnerSeatsCard) {
    elements.winnerSeatsCard.className = `stat-card stat-winner stat-focus ${winnerTone}`;
  }
  elements.lastUpdate.textContent = `Dernière mise à jour : ${formatDateTime(state.updatedAt)}`;
  setInputValueIfIdle(elements.name1, state.lists[0]?.name || "");
  setInputValueIfIdle(elements.name2, state.lists[1]?.name || "");
  setInputValueIfIdle(elements.registeredVotersInput, state.registeredVoters);
  elements.configLabel1.innerHTML = `<span class="color-dot color-candidate-1"></span>${escapeHtml(
    state.lists[0]?.name || "J'aime St Paul - PEREZ"
  )} (bouton bleu foncé)`;
  elements.configLabel2.innerHTML = `<span class="color-dot color-candidate-2"></span>${escapeHtml(
    state.lists[1]?.name || "Osons St Paul - URBAN"
  )} (bouton orange)`;
  const writable = canWrite();
  elements.name1.disabled = !writable;
  elements.name2.disabled = !writable;
  elements.registeredVotersInput.disabled = !writable;
  const configSubmitButton = elements.configForm.querySelector("button[type='submit']");
  if (configSubmitButton) {
    configSubmitButton.disabled = !writable;
  }
  syncSimulationVotesWithCurrentState();
  updateSimulationLabels();
  setSimulationInputValues();
  renderSimulationResult();
  renderAccessControls();
  renderManualTotals();
  elements.undoButton.disabled = !writable || state.history.length === 0;
  if (elements.undoButton.disabled || !writable) {
    clearUndoHoldState();
  } else if (!isUndoHolding) {
    setUndoButtonIdleLabel();
  }
  const canReset = state.totalBallots > 0;
  elements.resetButton.disabled = !writable || !canReset;
  if (!canReset) {
    disarmResetButton("Remise à 0 indisponible : tous les compteurs sont déjà à zéro.");
  } else if (!isResetArmed && writable) {
    setResetHint("");
  } else if (!writable) {
    disarmResetButton("");
  }
}

function mergeState(nextState) {
  state.lists = nextState.lists || [];
  state.totalBallots = nextState.totalBallots || nextState.totalVotes || 0;
  state.expressedVotes = nextState.expressedVotes || 0;
  state.registeredVoters = nextState.registeredVoters || 0;
  state.participationPercent =
    typeof nextState.participationPercent === "number" ? nextState.participationPercent : null;
  state.writeProtectionEnabled = Boolean(nextState.writeProtectionEnabled);
  if (!state.writeProtectionEnabled && state.isAdminView) {
    state.isWriteUnlocked = true;
  }
  state.blankVotes = nextState.blankVotes || 0;
  state.nullVotes = nextState.nullVotes || 0;
  state.gap = nextState.gap || 0;
  state.leader = nextState.leader || null;
  state.hasTieForLead = Boolean(nextState.hasTieForLead);
  state.seatAllocation = nextState.seatAllocation || null;
  state.history = nextState.history || [];
  state.updatedAt = nextState.updatedAt || null;
  render();
}

function hapticFeedback() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(12);
  }
}

async function callApi(endpoint, body = {}) {
  const headers = { "Content-Type": "application/json" };
  if (currentWritePin) {
    headers["X-Write-Pin"] = currentWritePin;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 403) {
      setAdminView(false);
      render();
    }
    throw new Error(payload.error || "Erreur API");
  }
  return payload;
}

async function verifyWritePin(pin) {
  const response = await fetch("/api/access/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Erreur de vérification du PIN");
  }
  return payload;
}

async function loginAdmin(username, password) {
  const response = await fetch("/api/access/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Erreur de connexion admin");
  }
  return payload;
}

async function logoutWriteAccess() {
  const response = await fetch("/api/access/logout", {
    method: "POST"
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Erreur de déconnexion admin");
  }
  return payload;
}

async function initializeWriteAccess() {
  const response = await fetch("/api/access");
  const payload = await response.json();
  state.writeProtectionEnabled = Boolean(payload.writeProtectionEnabled);
  const rawAuthMode = typeof payload.authMode === "string" ? payload.authMode.trim().toLowerCase() : "";
  state.authMode =
    rawAuthMode === "account" || rawAuthMode === "pin" || rawAuthMode === "none"
      ? rawAuthMode
      : state.writeProtectionEnabled
        ? "pin"
        : "none";
  state.isWriteUnlocked = Boolean(payload.writeAuthorized);
  if (!state.writeProtectionEnabled) {
    currentWritePin = "";
  } else if (state.authMode !== "pin") {
    currentWritePin = "";
  }
  state.isAdminView = state.isWriteUnlocked;
}

async function loadInitialState() {
  const headers = {};
  if (currentWritePin) {
    headers["X-Write-Pin"] = currentWritePin;
  }
  const response = await fetch("/api/state", { headers });
  const payload = await response.json();
  mergeState(payload);
}

function setupEvents() {
  elements.adminMenuButton.addEventListener("click", () => {
    setAdminDrawerOpen(!isAdminDrawerOpen);
  });

  elements.adminCloseButton.addEventListener("click", () => {
    setAdminDrawerOpen(false);
  });

  if (elements.adminBackdrop) {
    elements.adminBackdrop.addEventListener("click", () => {
      setAdminDrawerOpen(false);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isAdminDrawerOpen) {
      setAdminDrawerOpen(false);
    }
  });

  elements.accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.authMode === "none" || !state.writeProtectionEnabled) {
      setAdminView(true);
      setAdminDrawerOpen(false);
      render();
      return;
    }

    if (state.authMode === "account") {
      const username = elements.accessUsername?.value.trim() || "";
      const password = elements.accessPassword?.value || "";
      if (!username || !password) {
        alert("Entre l'identifiant et le mot de passe admin.");
        return;
      }
      try {
        const result = await loginAdmin(username, password);
        currentWritePin = "";
        state.isWriteUnlocked = Boolean(result.writeAuthorized);
        setAdminView(state.isWriteUnlocked);
        if (elements.accessUsername) {
          elements.accessUsername.value = "";
        }
        if (elements.accessPassword) {
          elements.accessPassword.value = "";
        }
        setAdminDrawerOpen(false);
        render();
      } catch (error) {
        alert(error.message);
      }
      return;
    }

    const pin = elements.accessPin.value.trim();
    if (!pin) {
      alert("Entre le PIN pour déverrouiller la saisie.");
      return;
    }
    try {
      const verification = await verifyWritePin(pin);
      if (!verification.ok) {
        alert("PIN incorrect.");
        return;
      }
      currentWritePin = "";
      state.isWriteUnlocked = Boolean(verification.writeAuthorized);
      setAdminView(state.isWriteUnlocked);
      elements.accessPin.value = "";
      setAdminDrawerOpen(false);
      render();
    } catch (error) {
      alert(error.message);
    }
  });

  elements.lockButton.addEventListener("click", async () => {
    if (state.writeProtectionEnabled) {
      try {
        await logoutWriteAccess();
      } catch (error) {
        alert(error.message);
        return;
      }
    }
    setAdminView(false);
    elements.accessPin.value = "";
    if (elements.accessUsername) {
      elements.accessUsername.value = "";
    }
    if (elements.accessPassword) {
      elements.accessPassword.value = "";
    }
    setAdminDrawerOpen(false);
    render();
  });

  elements.configToggle.addEventListener("click", () => {
    setConfigCollapsed(!isConfigCollapsed);
  });

  elements.simulationToggle.addEventListener("click", () => {
    setSimulationEnabled(!isSimulationEnabled);
    renderSimulationResult();
  });

  if (elements.manualToggle) {
    elements.manualToggle.addEventListener("click", () => {
      setManualCollapsed(!isManualCollapsed);
    });
  }

  elements.simulationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    renderSimulationResult();
  });

  elements.simulationVotes1.addEventListener("input", () => {
    renderSimulationResult();
  });

  elements.simulationVotes2.addEventListener("input", () => {
    renderSimulationResult();
  });

  elements.configForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canWrite()) {
      alert("Mode lecture seule : déverrouille d'abord la saisie.");
      return;
    }
    try {
      const registeredVoters = Math.max(
        0,
        Number.parseInt(elements.registeredVotersInput.value || "0", 10) || 0
      );
      const payload = await callApi("/api/config", {
        names: [elements.name1.value, elements.name2.value],
        registeredVoters
      });
      mergeState(payload);
      setConfigCollapsed(true);
    } catch (error) {
      alert(error.message);
    }
  });

  elements.lists.addEventListener("click", async (event) => {
    if (!canWrite()) return;
    const button = event.target.closest("button[data-action='vote']");
    if (!button) return;
    const listId = button.dataset.listId;
    const delta = Number(button.dataset.delta);
    try {
      const payload = await callApi("/api/vote", { listId, delta });
      mergeState(payload);
      hapticFeedback();
    } catch (error) {
      alert(error.message);
    }
  });

  elements.specialVotes.addEventListener("click", async (event) => {
    if (!canWrite()) return;
    const button = event.target.closest("button[data-action='special-vote']");
    if (!button) return;
    const kind = button.dataset.kind;
    const delta = Number(button.dataset.delta);
    try {
      const payload = await callApi("/api/special-vote", { kind, delta });
      mergeState(payload);
      hapticFeedback();
    } catch (error) {
      alert(error.message);
    }
  });

  elements.resetButton.addEventListener("click", async () => {
    if (!canWrite()) return;
    if (elements.resetButton.disabled) return;
    if (!isResetArmed) {
      armResetButton();
      hapticFeedback();
      return;
    }
    try {
      const payload = await callApi("/api/reset");
      mergeState(payload);
      disarmResetButton("Compteurs remis à zéro.");
      hapticFeedback();
    } catch (error) {
      alert(error.message);
      disarmResetButton();
    }
  });

  elements.undoButton.addEventListener("pointerdown", () => {
    if (!canWrite() || elements.undoButton.disabled) return;
    clearUndoHoldState();
    isUndoHolding = true;
    elements.undoButton.classList.add("holding");
    elements.undoButton.textContent = "Relâcher pour annuler";
    undoHoldTimeout = setTimeout(async () => {
      undoHoldTimeout = null;
      if (!isUndoHolding) return;
      clearUndoHoldState();
      await performUndo();
    }, UNDO_HOLD_MS);
  });

  const cancelUndoHold = () => {
    if (isUndoHolding) {
      clearUndoHoldState();
    }
  };
  elements.undoButton.addEventListener("pointerup", cancelUndoHold);
  elements.undoButton.addEventListener("pointerleave", cancelUndoHold);
  elements.undoButton.addEventListener("pointercancel", cancelUndoHold);

  // Keep keyboard accessibility (Enter/Space triggers click with detail=0).
  elements.undoButton.addEventListener("click", async (event) => {
    if (event.detail !== 0) return;
    if (!canWrite() || elements.undoButton.disabled) return;
    await performUndo();
  });

  elements.manualForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canWrite()) {
      alert("Mode lecture seule : déverrouille d'abord la saisie.");
      return;
    }
    const listVotes = [
      Math.max(0, Number.parseInt(elements.manualVotes1.value || "0", 10) || 0),
      Math.max(0, Number.parseInt(elements.manualVotes2.value || "0", 10) || 0)
    ];
    const blankVotes = Math.max(0, Number.parseInt(elements.manualBlankVotes.value || "0", 10) || 0);
    const nullVotes = Math.max(0, Number.parseInt(elements.manualNullVotes.value || "0", 10) || 0);
    try {
      const payload = await callApi("/api/set-totals", { listVotes, blankVotes, nullVotes });
      mergeState(payload);
      setManualCollapsed(true);
      hapticFeedback();
    } catch (error) {
      alert(error.message);
    }
  });
}

function setupRealtime() {
  const events = new EventSource("/api/events");
  events.onopen = () => {
    if (elements.status) {
      elements.status.textContent = "Connecté en direct";
      elements.status.classList.remove("offline");
      elements.status.classList.add("online");
    }
  };
  events.onerror = () => {
    if (elements.status) {
      elements.status.textContent = "Connexion en cours...";
      elements.status.classList.remove("online");
      elements.status.classList.add("offline");
    }
  };
  events.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      mergeState(payload);
    } catch {
      // Ignore malformed stream payloads.
    }
  };
}

async function boot() {
  setConfigCollapsed(loadConfigCollapsePreference());
  setSimulationEnabled(loadSimulationPreference());
  setManualCollapsed(loadManualCollapsePreference());
  setAdminDrawerOpen(false);
  await initializeWriteAccess();
  setupEvents();
  await loadInitialState();
  setupRealtime();
}

boot().catch((error) => {
  if (elements.status) {
    elements.status.textContent = `Erreur: ${error.message}`;
    elements.status.classList.remove("online");
    elements.status.classList.add("offline");
  }
});
