const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "state.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const clients = new Set();

function defaultState() {
  return {
    lists: [
      { id: "liste-1", name: "Liste 1", votes: 0 },
      { id: "liste-2", name: "Liste 2", votes: 0 }
    ],
    blankVotes: 0,
    nullVotes: 0,
    history: [],
    updatedAt: new Date().toISOString()
  };
}

function ensureDataFolder() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

function normalizeState(rawState) {
  const fallback = defaultState();
  if (!rawState || !Array.isArray(rawState.lists) || rawState.lists.length !== 2) {
    return fallback;
  }

  const lists = rawState.lists.map((list, index) => {
    const id = index === 0 ? "liste-1" : "liste-2";
    const name =
      typeof list.name === "string" && list.name.trim() ? list.name.trim() : `Liste ${index + 1}`;
    const votes = Number.isInteger(list.votes) && list.votes >= 0 ? list.votes : 0;
    return { id, name, votes };
  });

  return {
    lists,
    blankVotes:
      Number.isInteger(rawState.blankVotes) && rawState.blankVotes >= 0 ? rawState.blankVotes : 0,
    nullVotes:
      Number.isInteger(rawState.nullVotes) && rawState.nullVotes >= 0 ? rawState.nullVotes : 0,
    history: Array.isArray(rawState.history) ? rawState.history.slice(-100) : [],
    updatedAt: typeof rawState.updatedAt === "string" ? rawState.updatedAt : new Date().toISOString()
  };
}

function loadState() {
  try {
    ensureDataFolder();
    if (!fs.existsSync(DATA_FILE)) {
      return defaultState();
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  ensureDataFolder();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8");
}

function computePublicState() {
  const expressedVotes = state.lists.reduce((sum, list) => sum + list.votes, 0);
  const nonExpressedVotes = state.blankVotes + state.nullVotes;
  const totalBallots = expressedVotes + nonExpressedVotes;
  const sorted = [...state.lists].sort((a, b) => b.votes - a.votes);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const gap = leader ? leader.votes - (runnerUp ? runnerUp.votes : 0) : 0;

  return {
    lists: state.lists.map((list) => ({
      ...list,
      percentage:
        expressedVotes === 0 ? 0 : Number(((list.votes / expressedVotes) * 100).toFixed(1))
    })),
    totalVotes: totalBallots,
    totalBallots,
    expressedVotes,
    nonExpressedVotes,
    blankVotes: state.blankVotes,
    nullVotes: state.nullVotes,
    leader: leader || null,
    gap,
    history: [...state.history].slice(-50).reverse(),
    updatedAt: state.updatedAt
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function pushHistory(entry) {
  state.history.push({
    at: new Date().toISOString(),
    ...entry
  });
  if (state.history.length > 100) {
    state.history = state.history.slice(-100);
  }
}

function updateTimestamp() {
  state.updatedAt = new Date().toISOString();
}

function broadcast() {
  const payload = `data: ${JSON.stringify(computePublicState())}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function safeName(input, fallback) {
  if (typeof input !== "string") {
    return fallback;
  }
  const cleaned = input.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 40) : fallback;
}

function snapshotBeforeChange() {
  return {
    previousVotes: state.lists.map((list) => list.votes),
    previousNames: state.lists.map((list) => list.name),
    previousSpecial: {
      blankVotes: state.blankVotes,
      nullVotes: state.nullVotes
    }
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, computePublicState());
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    res.write(`data: ${JSON.stringify(computePublicState())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/config") {
    try {
      const body = await parseJsonBody(req);
      const names = Array.isArray(body.names) ? body.names : [];
      if (names.length !== 2) {
        sendJson(res, 400, { error: "Le champ names doit contenir exactement 2 valeurs." });
        return true;
      }

      const previous = snapshotBeforeChange();
      state.lists[0].name = safeName(names[0], state.lists[0].name);
      state.lists[1].name = safeName(names[1], state.lists[1].name);
      updateTimestamp();
      pushHistory({
        type: "config",
        ...previous,
        names: state.lists.map((list) => list.name)
      });
      saveState();
      broadcast();
      sendJson(res, 200, computePublicState());
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/vote") {
    try {
      const body = await parseJsonBody(req);
      const delta = Number(body.delta);
      if (![1, -1].includes(delta)) {
        sendJson(res, 400, { error: "delta doit valoir 1 ou -1." });
        return true;
      }
      const list = state.lists.find((item) => item.id === body.listId);
      if (!list) {
        sendJson(res, 404, { error: "Liste introuvable." });
        return true;
      }
      if (delta < 0 && list.votes === 0) {
        sendJson(res, 400, { error: "Le compteur ne peut pas descendre sous 0." });
        return true;
      }

      const previous = snapshotBeforeChange();
      list.votes += delta;
      updateTimestamp();
      pushHistory({
        type: "vote",
        listId: list.id,
        listName: list.name,
        delta,
        ...previous
      });
      saveState();
      broadcast();
      sendJson(res, 200, computePublicState());
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/special-vote") {
    try {
      const body = await parseJsonBody(req);
      const delta = Number(body.delta);
      if (![1, -1].includes(delta)) {
        sendJson(res, 400, { error: "delta doit valoir 1 ou -1." });
        return true;
      }

      const kind = body.kind;
      if (!["blank", "null"].includes(kind)) {
        sendJson(res, 400, { error: "kind doit valoir blank ou null." });
        return true;
      }

      if (kind === "blank" && delta < 0 && state.blankVotes === 0) {
        sendJson(res, 400, { error: "Le compteur blancs ne peut pas descendre sous 0." });
        return true;
      }
      if (kind === "null" && delta < 0 && state.nullVotes === 0) {
        sendJson(res, 400, { error: "Le compteur nuls ne peut pas descendre sous 0." });
        return true;
      }

      const previous = snapshotBeforeChange();
      if (kind === "blank") {
        state.blankVotes += delta;
      } else {
        state.nullVotes += delta;
      }

      updateTimestamp();
      pushHistory({
        type: "special_vote",
        kind,
        label: kind === "blank" ? "Blancs" : "Nuls",
        delta,
        ...previous
      });
      saveState();
      broadcast();
      sendJson(res, 200, computePublicState());
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    const previous = snapshotBeforeChange();
    state.lists = state.lists.map((list) => ({ ...list, votes: 0 }));
    state.blankVotes = 0;
    state.nullVotes = 0;
    updateTimestamp();
    pushHistory({
      type: "reset",
      ...previous
    });
    saveState();
    broadcast();
    sendJson(res, 200, computePublicState());
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/undo") {
    const last = state.history.pop();
    if (!last) {
      sendJson(res, 400, { error: "Aucune action a annuler." });
      return true;
    }

    if (Array.isArray(last.previousVotes) && last.previousVotes.length === state.lists.length) {
      state.lists.forEach((list, index) => {
        const value = last.previousVotes[index];
        list.votes = Number.isInteger(value) && value >= 0 ? value : 0;
      });
    }

    if (Array.isArray(last.previousNames) && last.previousNames.length === state.lists.length) {
      state.lists.forEach((list, index) => {
        list.name = safeName(last.previousNames[index], list.name);
      });
    }

    if (last.previousSpecial && typeof last.previousSpecial === "object") {
      const blankVotes = last.previousSpecial.blankVotes;
      const nullVotes = last.previousSpecial.nullVotes;
      state.blankVotes = Number.isInteger(blankVotes) && blankVotes >= 0 ? blankVotes : 0;
      state.nullVotes = Number.isInteger(nullVotes) && nullVotes >= 0 ? nullVotes : 0;
    }

    updateTimestamp();
    saveState();
    broadcast();
    sendJson(res, 200, computePublicState());
    return true;
  }

  return false;
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(STATIC_DIR, normalizedPath);

  if (!filePath.startsWith(STATIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        sendJson(res, 404, { error: "Not Found" });
        return;
      }
      sendJson(res, 500, { error: "Erreur serveur." });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) {
        sendJson(res, 404, { error: "Endpoint inconnu." });
      }
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erreur inattendue." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Serveur depouillement pret sur http://${HOST}:${PORT}`);
});
