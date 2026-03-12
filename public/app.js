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
      (list) => `
      <article class="card">
        <h3>${escapeHtml(list.name)}</h3>
        <p class="votes">${list.votes}</p>
        <p class="percent">${formatPercentage(list.percentage)}</p>
        <div class="vote-actions vote-actions-mobile">
          <button class="plus-one" data-action="vote" data-list-id="${list.id}" data-delta="1">+1</button>
          <button class="plus-five" data-action="vote" data-list-id="${list.id}" data-delta="5">+5</button>
        </div>
        <div class="vote-actions vote-actions-secondary">
          <button class="ghost" data-action="vote" data-list-id="${list.id}" data-delta="-1" ${
            list.votes < 1 ? "disabled" : ""
          }>-1 Corriger</button>
          <button class="ghost" data-action="vote" data-list-id="${list.id}" data-delta="-5" ${
            list.votes < 5 ? "disabled" : ""
          }>-5 Corriger lot</button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderBars() {
  const colors = ["#1b74d4", "#22a561"];
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
      <article class="card">
        <h3>${escapeHtml(item.label)}</h3>
        <p class="votes">${item.votes}</p>
        <div class="vote-actions vote-actions-mobile">
          <button class="${item.className} plus-one" data-action="special-vote" data-kind="${item.kind}" data-delta="1">+1</button>
          <button class="${item.className} plus-five" data-action="special-vote" data-kind="${item.kind}" data-delta="5">+5</button>
        </div>
        <div class="vote-actions vote-actions-secondary">
          <button class="ghost" data-action="special-vote" data-kind="${item.kind}" data-delta="-1" ${
            item.votes < 1 ? "disabled" : ""
          }>-1 Corriger</button>
          <button class="ghost" data-action="special-vote" data-kind="${item.kind}" data-delta="-5" ${
            item.votes < 5 ? "disabled" : ""
          }>-5 Corriger lot</button>
        </div>
      </article>
    `
    )
    .join("");
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
    const confirmed = window.confirm("Confirmer la remise a zero de tous les compteurs ?");
    if (!confirmed) return;
    try {
      const payload = await callApi("/api/reset");
      mergeState(payload);
    } catch (error) {
      alert(error.message);
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
