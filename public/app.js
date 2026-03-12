const state = {
  lists: [],
  totalBallots: 0,
  expressedVotes: 0,
  blankVotes: 0,
  nullVotes: 0,
  gap: 0,
  leader: null,
  history: [],
  updatedAt: null
};

let resetArmTimeout = null;
let isResetArmed = false;

const elements = {
  status: document.getElementById("status"),
  configForm: document.getElementById("config-form"),
  name1: document.getElementById("name-1"),
  name2: document.getElementById("name-2"),
  lists: document.getElementById("lists"),
  specialVotes: document.getElementById("special-votes"),
  lastUpdate: document.getElementById("last-update"),
  totalBallots: document.getElementById("total-ballots"),
  expressedVotes: document.getElementById("expressed-votes"),
  blankVotes: document.getElementById("blank-votes"),
  nullVotes: document.getElementById("null-votes"),
  leader: document.getElementById("leader"),
  gap: document.getElementById("gap"),
  bars: document.getElementById("bars"),
  history: document.getElementById("history"),
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
    return `${formatDate(entry.at)} - Remise a zero`;
  }
  if (entry.type === "config") {
    return `${formatDate(entry.at)} - Noms des listes modifies`;
  }
  return `${formatDate(entry.at)} - Action`;
}

function renderLists() {
  elements.lists.innerHTML = state.lists
    .map(
      (list, index) => `
      <button class="quick-button candidate candidate-${index + 1}" data-action="vote" data-list-id="${list.id}" data-delta="1">
        <span class="quick-title">${escapeHtml(list.name)}</span>
        <span class="quick-meta">
          <span class="quick-count">${list.votes}</span>
          <span class="quick-percent">${formatPercentage(list.percentage)}</span>
        </span>
        <span class="quick-cta">+1 voix</span>
      </button>
    `
    )
    .join("");
}

function renderBars() {
  const colors = ["#1b74d4", "#d5821a"];
  elements.bars.innerHTML = state.lists
    .map(
      (list, index) => `
      <div>
        <div class="bar-label">
          <strong>${escapeHtml(list.name)}</strong>
          <span>${list.votes} (${formatPercentage(list.percentage)})</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${list.percentage}%;background:${colors[index % colors.length]}"></div>
        </div>
      </div>
    `
    )
    .join("");
}

function renderSpecialVotes() {
  const special = [
    { kind: "blank", label: "Blancs", votes: state.blankVotes, className: "blanc" },
    { kind: "null", label: "Nuls", votes: state.nullVotes, className: "nul" }
  ];

  elements.specialVotes.innerHTML = special
    .map(
      (item) => `
      <button class="quick-button soft ${item.className}" data-action="special-vote" data-kind="${item.kind}" data-delta="1">
        <span class="quick-title">${escapeHtml(item.label)}</span>
        <span class="quick-meta">
          <span class="quick-count">${item.votes}</span>
        </span>
        <span class="quick-cta">+1 bulletin</span>
      </button>
    `
    )
    .join("");
}

function setResetHint(message) {
  elements.resetHint.textContent = message;
}

function disarmResetButton(message = 'Double appui sur "Remettre a 0" pour confirmer.') {
  isResetArmed = false;
  if (resetArmTimeout) {
    clearTimeout(resetArmTimeout);
    resetArmTimeout = null;
  }
  elements.resetButton.classList.remove("armed");
  elements.resetButton.textContent = "Remettre a 0";
  setResetHint(message);
}

function armResetButton() {
  isResetArmed = true;
  elements.resetButton.classList.add("armed");
  elements.resetButton.textContent = "Confirmer 0";
  setResetHint("Action sensible: appuie une 2e fois pour confirmer.");
  resetArmTimeout = setTimeout(() => {
    disarmResetButton();
  }, 2500);
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
  renderHistory();
  elements.totalBallots.textContent = String(state.totalBallots);
  elements.expressedVotes.textContent = String(state.expressedVotes);
  elements.blankVotes.textContent = String(state.blankVotes);
  elements.nullVotes.textContent = String(state.nullVotes);
  elements.gap.textContent = String(state.gap);
  elements.leader.textContent = state.leader ? state.leader.name : "-";
  elements.lastUpdate.textContent = `Derniere mise a jour: ${formatDateTime(state.updatedAt)}`;
  elements.name1.value = state.lists[0]?.name || "";
  elements.name2.value = state.lists[1]?.name || "";
  elements.undoButton.disabled = state.history.length === 0;
  const canReset = state.totalBallots > 0;
  elements.resetButton.disabled = !canReset;
  if (!canReset) {
    disarmResetButton("Remise a 0 indisponible: tous les compteurs sont deja a zero.");
  } else if (!isResetArmed && elements.resetHint.textContent.includes("indisponible")) {
    setResetHint('Double appui sur "Remettre a 0" pour confirmer.');
  }
}

function mergeState(nextState) {
  state.lists = nextState.lists || [];
  state.totalBallots = nextState.totalBallots || nextState.totalVotes || 0;
  state.expressedVotes = nextState.expressedVotes || 0;
  state.blankVotes = nextState.blankVotes || 0;
  state.nullVotes = nextState.nullVotes || 0;
  state.gap = nextState.gap || 0;
  state.leader = nextState.leader || null;
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
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Erreur API");
  }
  return payload;
}

async function loadInitialState() {
  const response = await fetch("/api/state");
  const payload = await response.json();
  mergeState(payload);
}

function setupEvents() {
  elements.configForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = await callApi("/api/config", { names: [elements.name1.value, elements.name2.value] });
      mergeState(payload);
    } catch (error) {
      alert(error.message);
    }
  });

  elements.lists.addEventListener("click", async (event) => {
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
    if (elements.resetButton.disabled) return;
    if (!isResetArmed) {
      armResetButton();
      hapticFeedback();
      return;
    }
    try {
      const payload = await callApi("/api/reset");
      mergeState(payload);
      disarmResetButton("Compteurs remis a zero.");
      hapticFeedback();
    } catch (error) {
      alert(error.message);
      disarmResetButton();
    }
  });

  elements.undoButton.addEventListener("click", async () => {
    try {
      const payload = await callApi("/api/undo");
      mergeState(payload);
    } catch (error) {
      alert(error.message);
    }
  });
}

function setupRealtime() {
  const events = new EventSource("/api/events");
  events.onopen = () => {
    elements.status.textContent = "Connecte en direct";
    elements.status.classList.remove("offline");
    elements.status.classList.add("online");
  };
  events.onerror = () => {
    elements.status.textContent = "Connexion en cours...";
    elements.status.classList.remove("online");
    elements.status.classList.add("offline");
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
  setupEvents();
  await loadInitialState();
  setupRealtime();
}

boot().catch((error) => {
  elements.status.textContent = `Erreur: ${error.message}`;
  elements.status.classList.remove("online");
  elements.status.classList.add("offline");
});
