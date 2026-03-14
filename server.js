const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const parsedTotalSeats = Number.parseInt(process.env.TOTAL_SEATS || "19", 10);
const TOTAL_SEATS = Number.isInteger(parsedTotalSeats) && parsedTotalSeats > 0 ? parsedTotalSeats : 19;
const WRITE_PIN = String(process.env.WRITE_PIN || "").trim();
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
const ACCOUNT_AUTH_ENABLED = ADMIN_USERNAME.length > 0 && ADMIN_PASSWORD.length > 0;
const PIN_AUTH_ENABLED = !ACCOUNT_AUTH_ENABLED && WRITE_PIN.length > 0;
const AUTH_MODE = ACCOUNT_AUTH_ENABLED ? "account" : PIN_AUTH_ENABLED ? "pin" : "none";
const WRITE_PROTECTION_ENABLED = AUTH_MODE !== "none";
const parsedSessionTtl = Number.parseInt(process.env.ADMIN_SESSION_TTL_SEC || "43200", 10);
const ADMIN_SESSION_TTL_SEC =
  Number.isInteger(parsedSessionTtl) && parsedSessionTtl > 0 ? parsedSessionTtl : 43200;
const ADMIN_SESSION_COOKIE = "dep_admin_session";
const ADMIN_SESSION_SECRET =
  String(process.env.ADMIN_SESSION_SECRET || "").trim() ||
  crypto.createHash("sha256").update(`${WRITE_PIN}|${ADMIN_USERNAME}|${ADMIN_PASSWORD}`).digest("hex");
const STATIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "state.json");
const DEFAULT_LIST_NAMES = ["J'aime St Paul - PEREZ", "Osons St Paul - URBAN"];
const DEFAULT_TABLES = [
  { id: "table-1", name: "Table 1" },
  { id: "table-2", name: "Table 2" }
];
const DEFAULT_REGISTERED_VOTERS = 1152;
const LEGACY_LIST_NAMES = ["Liste 1", "Liste 2", "Liste lagon", "Liste orange", "Liste corail"];

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const clients = new Set();

function defaultState() {
  return {
    lists: [
      { id: "liste-1", name: DEFAULT_LIST_NAMES[0] },
      { id: "liste-2", name: DEFAULT_LIST_NAMES[1] }
    ],
    tables: [
      { id: DEFAULT_TABLES[0].id, name: DEFAULT_TABLES[0].name, listVotes: { "liste-1": 0, "liste-2": 0 }, blankVotes: 0, nullVotes: 0 },
      { id: DEFAULT_TABLES[1].id, name: DEFAULT_TABLES[1].name, listVotes: { "liste-1": 0, "liste-2": 0 }, blankVotes: 0, nullVotes: 0 }
    ],
    registeredVoters: DEFAULT_REGISTERED_VOTERS,
    history: [],
    updatedAt: new Date().toISOString()
  };
}

function ensureDataFolder() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

function toNonNegativeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizeListNames(rawLists) {
  return rawLists.map((list, index) => {
    const id = index === 0 ? "liste-1" : "liste-2";
    const cleanedName = typeof list.name === "string" ? list.name.trim() : "";
    const shouldUseDefault = !cleanedName || LEGACY_LIST_NAMES.includes(cleanedName);
    const name = shouldUseDefault
      ? DEFAULT_LIST_NAMES[index] || `Liste ${index + 1}`
      : cleanedName.slice(0, 40);
    return { id, name };
  });
}

function defaultTablesState() {
  return DEFAULT_TABLES.map((table) => ({
    id: table.id,
    name: table.name,
    listVotes: { "liste-1": 0, "liste-2": 0 },
    blankVotes: 0,
    nullVotes: 0
  }));
}

function normalizeTableState(rawTable, index) {
  const fallback = DEFAULT_TABLES[index] || { id: `table-${index + 1}`, name: `Table ${index + 1}` };
  const listVotes = rawTable && typeof rawTable.listVotes === "object" ? rawTable.listVotes : {};
  return {
    id: fallback.id,
    name:
      rawTable && typeof rawTable.name === "string" && rawTable.name.trim()
        ? rawTable.name.trim().slice(0, 30)
        : fallback.name,
    listVotes: {
      "liste-1": toNonNegativeInteger(listVotes["liste-1"], 0),
      "liste-2": toNonNegativeInteger(listVotes["liste-2"], 0)
    },
    blankVotes: toNonNegativeInteger(rawTable?.blankVotes, 0),
    nullVotes: toNonNegativeInteger(rawTable?.nullVotes, 0)
  };
}

function normalizeState(rawState) {
  const fallback = defaultState();
  if (!rawState || !Array.isArray(rawState.lists) || rawState.lists.length !== 2) {
    return fallback;
  }

  const lists = normalizeListNames(rawState.lists);
  let tables = defaultTablesState();

  if (Array.isArray(rawState.tables) && rawState.tables.length === 2) {
    tables = rawState.tables.map((table, index) => normalizeTableState(table, index));
  } else {
    // Migration douce de l'ancien format (totaux globaux) vers 2 tables:
    // on conserve l'existant sur la table 1 et on initialise la table 2 à zéro.
    const legacyVotes1 = toNonNegativeInteger(rawState.lists?.[0]?.votes, 0);
    const legacyVotes2 = toNonNegativeInteger(rawState.lists?.[1]?.votes, 0);
    tables = defaultTablesState();
    tables[0].listVotes["liste-1"] = legacyVotes1;
    tables[0].listVotes["liste-2"] = legacyVotes2;
    tables[0].blankVotes = toNonNegativeInteger(rawState.blankVotes, 0);
    tables[0].nullVotes = toNonNegativeInteger(rawState.nullVotes, 0);
  }

  return {
    lists,
    tables,
    registeredVoters:
      Number.isInteger(rawState.registeredVoters) && rawState.registeredVoters >= 0
        ? rawState.registeredVoters
        : DEFAULT_REGISTERED_VOTERS,
    history: Array.isArray(rawState.history) ? rawState.history.slice(-200) : [],
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

function computeSeatAllocation({ lists, expressedVotes, leader, hasTieForLead }) {
  const totalSeats = TOTAL_SEATS;
  const primeSeats = Math.ceil(totalSeats / 2);
  const proportionalSeats = totalSeats - primeSeats;
  const thresholdPercent = 5;
  const thresholdVotesRaw = expressedVotes * (thresholdPercent / 100);
  const thresholdVotes = Number(thresholdVotesRaw.toFixed(2));

  const baseRows = lists.map((list) => ({
    listId: list.id,
    listName: list.name,
    votes: list.votes,
    proportionalSeats: 0,
    primeBonus: 0,
    totalSeats: 0,
    eligible: expressedVotes > 0 && list.votes >= thresholdVotesRaw
  }));

  if (expressedVotes === 0) {
    return {
      status: "no_expressed_votes",
      totalSeats,
      primeSeats,
      proportionalSeats,
      thresholdPercent,
      thresholdVotes,
      quotientElectoral: 0,
      eligibleListIds: [],
      remainingAfterQuotient: proportionalSeats,
      rounds: [],
      rows: baseRows,
      leaderId: null,
      leaderName: null
    };
  }

  if (!leader || hasTieForLead) {
    return {
      status: "tie_for_lead",
      totalSeats,
      primeSeats,
      proportionalSeats,
      thresholdPercent,
      thresholdVotes,
      quotientElectoral: Number((expressedVotes / Math.max(proportionalSeats, 1)).toFixed(4)),
      eligibleListIds: baseRows.filter((row) => row.eligible).map((row) => row.listId),
      remainingAfterQuotient: proportionalSeats,
      rounds: [],
      rows: baseRows,
      leaderId: null,
      leaderName: null
    };
  }

  const eligibleLists = lists.filter((list) => list.votes >= thresholdVotesRaw);
  const proportionalByListId = Object.fromEntries(lists.map((list) => [list.id, 0]));
  const quotientElectoral = proportionalSeats > 0 ? expressedVotes / proportionalSeats : 0;

  if (quotientElectoral > 0) {
    for (const list of eligibleLists) {
      proportionalByListId[list.id] = Math.floor(list.votes / quotientElectoral);
    }
  }

  let distributedSeats = eligibleLists.reduce(
    (sum, list) => sum + (proportionalByListId[list.id] || 0),
    0
  );
  let remainingAfterQuotient = Math.max(0, proportionalSeats - distributedSeats);
  const seatsToAllocateByAverage = remainingAfterQuotient;
  const rounds = [];

  while (remainingAfterQuotient > 0 && eligibleLists.length > 0) {
    const ranked = [...eligibleLists]
      .map((list) => ({
        ...list,
        currentSeats: proportionalByListId[list.id] || 0,
        average: list.votes / ((proportionalByListId[list.id] || 0) + 1)
      }))
      .sort((a, b) => {
        if (b.average !== a.average) return b.average - a.average;
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.id.localeCompare(b.id);
      });

    const winner = ranked[0];
    const previousSeats = proportionalByListId[winner.id] || 0;
    proportionalByListId[winner.id] = previousSeats + 1;
    rounds.push({
      round: rounds.length + 1,
      listId: winner.id,
      listName: winner.name,
      average: Number(winner.average.toFixed(4)),
      seatsBefore: previousSeats,
      seatsAfter: previousSeats + 1
    });
    remainingAfterQuotient -= 1;
  }

  const rows = lists.map((list) => {
    const proportional = proportionalByListId[list.id] || 0;
    const primeBonus = list.id === leader.id ? primeSeats : 0;
    return {
      listId: list.id,
      listName: list.name,
      votes: list.votes,
      proportionalSeats: proportional,
      primeBonus,
      totalSeats: proportional + primeBonus,
      eligible: list.votes >= thresholdVotesRaw
    };
  });

  return {
    status: "ok",
    totalSeats,
    primeSeats,
    proportionalSeats,
    thresholdPercent,
    thresholdVotes,
    quotientElectoral: Number(quotientElectoral.toFixed(4)),
    eligibleListIds: eligibleLists.map((list) => list.id),
    remainingAfterQuotient: seatsToAllocateByAverage,
    seatsAllocatedByAverage: rounds.length,
    seatsStillUnallocated: remainingAfterQuotient,
    rounds,
    rows,
    leaderId: leader.id,
    leaderName: leader.name
  };
}

function getMergedListVotes() {
  const merged = { "liste-1": 0, "liste-2": 0 };
  for (const table of state.tables) {
    merged["liste-1"] += toNonNegativeInteger(table.listVotes?.["liste-1"], 0);
    merged["liste-2"] += toNonNegativeInteger(table.listVotes?.["liste-2"], 0);
  }
  return merged;
}

function getMergedSpecialVotes() {
  return state.tables.reduce(
    (acc, table) => {
      acc.blankVotes += toNonNegativeInteger(table.blankVotes, 0);
      acc.nullVotes += toNonNegativeInteger(table.nullVotes, 0);
      return acc;
    },
    { blankVotes: 0, nullVotes: 0 }
  );
}

function tableById(tableId) {
  return state.tables.find((table) => table.id === tableId);
}

function computePublicState() {
  const mergedVotes = getMergedListVotes();
  const mergedSpecial = getMergedSpecialVotes();
  const listsWithVotes = state.lists.map((list) => ({
    ...list,
    votes: toNonNegativeInteger(mergedVotes[list.id], 0)
  }));
  const expressedVotes = listsWithVotes.reduce((sum, list) => sum + list.votes, 0);
  const nonExpressedVotes = mergedSpecial.blankVotes + mergedSpecial.nullVotes;
  const totalBallots = expressedVotes + nonExpressedVotes;
  const participationPercent =
    state.registeredVoters > 0
      ? Number(((totalBallots / state.registeredVoters) * 100).toFixed(1))
      : null;
  const sorted = [...listsWithVotes].sort((a, b) => b.votes - a.votes);
  const potentialLeader = sorted[0];
  const runnerUp = sorted[1];
  const gap = potentialLeader ? potentialLeader.votes - (runnerUp ? runnerUp.votes : 0) : 0;
  const hasTieForLead = Boolean(
    expressedVotes > 0 && runnerUp && potentialLeader && potentialLeader.votes === runnerUp.votes
  );
  const leader = expressedVotes > 0 && !hasTieForLead ? potentialLeader : null;
  const seatAllocation = computeSeatAllocation({ lists: listsWithVotes, expressedVotes, leader, hasTieForLead });

  return {
    lists: listsWithVotes.map((list) => ({
      ...list,
      percentage:
        expressedVotes === 0 ? 0 : Number(((list.votes / expressedVotes) * 100).toFixed(1))
    })),
    tables: state.tables.map((table) => {
      const votesByList = {
        "liste-1": toNonNegativeInteger(table.listVotes?.["liste-1"], 0),
        "liste-2": toNonNegativeInteger(table.listVotes?.["liste-2"], 0)
      };
      const tableExpressed = votesByList["liste-1"] + votesByList["liste-2"];
      const tableTotal = tableExpressed + toNonNegativeInteger(table.blankVotes, 0) + toNonNegativeInteger(table.nullVotes, 0);
      return {
        id: table.id,
        name: table.name,
        listVotes: votesByList,
        blankVotes: toNonNegativeInteger(table.blankVotes, 0),
        nullVotes: toNonNegativeInteger(table.nullVotes, 0),
        totalVotes: tableTotal
      };
    }),
    totalVotes: totalBallots,
    totalBallots,
    expressedVotes,
    nonExpressedVotes,
    registeredVoters: state.registeredVoters,
    participationPercent,
    writeProtectionEnabled: WRITE_PROTECTION_ENABLED,
    blankVotes: mergedSpecial.blankVotes,
    nullVotes: mergedSpecial.nullVotes,
    leader: leader || null,
    hasTieForLead,
    gap,
    seatAllocation,
    history: [...state.history].slice(-50).reverse(),
    updatedAt: state.updatedAt
  };
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function parseCookies(req) {
  const raw = req.headers.cookie;
  if (typeof raw !== "string" || !raw.trim()) {
    return {};
  }
  return raw.split(";").reduce((cookies, item) => {
    const [key, ...rest] = item.trim().split("=");
    if (!key) {
      return cookies;
    }
    cookies[key] = decodeURIComponent(rest.join("=") || "");
    return cookies;
  }, {});
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function isHttpsRequest(req) {
  const protoHeader = req.headers["x-forwarded-proto"];
  if (typeof protoHeader === "string" && protoHeader.trim()) {
    return protoHeader.split(",")[0].trim() === "https";
  }
  return Boolean(req.socket && req.socket.encrypted);
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_SESSION_COOKIE];
  return typeof token === "string" ? token : "";
}

function signSessionPayload(encodedPayload) {
  return crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(encodedPayload).digest("base64url");
}

function createAdminSessionToken({ mode, user = "" }) {
  const payload = {
    mode,
    user: user || "",
    exp: Date.now() + ADMIN_SESSION_TTL_SEC * 1000
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signSessionPayload(encoded);
  return `${encoded}.${signature}`;
}

function verifyAdminSessionToken(token) {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signSessionPayload(encodedPayload);
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (!Number.isInteger(payload.exp) || payload.exp <= Date.now()) {
    return null;
  }
  return payload;
}

function buildSessionCookie(req, token) {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${ADMIN_SESSION_TTL_SEC}`,
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (isHttpsRequest(req)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function buildSessionClearCookie(req) {
  const parts = [`${ADMIN_SESSION_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (isHttpsRequest(req)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function isWriteAuthorized(req) {
  if (!WRITE_PROTECTION_ENABLED) {
    return true;
  }
  const sessionToken = getSessionTokenFromRequest(req);
  const session = verifyAdminSessionToken(sessionToken);
  if (session) {
    if (AUTH_MODE === "account") {
      return session.mode === "account" && session.user === ADMIN_USERNAME;
    }
    if (AUTH_MODE === "pin") {
      return session.mode === "pin";
    }
  }

  if (AUTH_MODE === "pin") {
    const provided = req.headers["x-write-pin"];
    if (Array.isArray(provided)) {
      return provided.some((value) => constantTimeEqual(value, WRITE_PIN));
    }
    return typeof provided === "string" && constantTimeEqual(provided, WRITE_PIN);
  }
  return false;
}

function ensureWriteAccess(req, res) {
  if (isWriteAuthorized(req)) {
    return true;
  }
  sendJson(res, 403, {
    error:
      AUTH_MODE === "account"
        ? "Mode lecture seule : compte admin requis pour modifier le dépouillement."
        : "Mode lecture seule : PIN requis pour modifier le dépouillement."
  });
  return false;
}

function pushHistory(entry) {
  state.history.push({
    at: new Date().toISOString(),
    ...entry
  });
  if (state.history.length > 200) {
    state.history = state.history.slice(-200);
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
    previousNames: state.lists.map((list) => list.name),
    previousRegisteredVoters: state.registeredVoters,
    previousTables: state.tables.map((table) => ({
      id: table.id,
      listVotes: {
        "liste-1": toNonNegativeInteger(table.listVotes?.["liste-1"], 0),
        "liste-2": toNonNegativeInteger(table.listVotes?.["liste-2"], 0)
      },
      blankVotes: toNonNegativeInteger(table.blankVotes, 0),
      nullVotes: toNonNegativeInteger(table.nullVotes, 0)
    }))
  };
}

function parseTableId(input) {
  const value = typeof input === "string" ? input.trim() : "";
  return DEFAULT_TABLES.some((table) => table.id === value) ? value : "";
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/state") {
    sendJson(res, 200, computePublicState());
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/access") {
    sendJson(res, 200, {
      writeProtectionEnabled: WRITE_PROTECTION_ENABLED,
      writeAuthorized: isWriteAuthorized(req),
      authMode: AUTH_MODE
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/access/verify") {
    if (AUTH_MODE !== "pin") {
      sendJson(res, 400, { error: "La vérification PIN n'est pas active sur ce serveur." });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const providedPin = typeof body.pin === "string" ? body.pin.trim() : "";
      const ok = constantTimeEqual(providedPin, WRITE_PIN);
      if (!ok) {
        sendJson(res, 200, {
          ok,
          writeProtectionEnabled: WRITE_PROTECTION_ENABLED,
          writeAuthorized: isWriteAuthorized(req),
          authMode: AUTH_MODE
        });
        return true;
      }
      const token = createAdminSessionToken({ mode: "pin" });
      sendJson(
        res,
        200,
        {
          ok,
          writeProtectionEnabled: WRITE_PROTECTION_ENABLED,
          writeAuthorized: true,
          authMode: AUTH_MODE
        },
        { "Set-Cookie": buildSessionCookie(req, token) }
      );
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/access/login") {
    if (AUTH_MODE !== "account") {
      sendJson(res, 400, { error: "La connexion compte admin n'est pas active sur ce serveur." });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const ok = constantTimeEqual(username, ADMIN_USERNAME) && constantTimeEqual(password, ADMIN_PASSWORD);
      if (!ok) {
        sendJson(res, 401, { error: "Identifiant ou mot de passe incorrect." });
        return true;
      }
      const token = createAdminSessionToken({ mode: "account", user: ADMIN_USERNAME });
      sendJson(
        res,
        200,
        {
          ok: true,
          writeProtectionEnabled: WRITE_PROTECTION_ENABLED,
          writeAuthorized: true,
          authMode: AUTH_MODE
        },
        { "Set-Cookie": buildSessionCookie(req, token) }
      );
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/access/logout") {
    sendJson(
      res,
      200,
      {
        ok: true,
        writeProtectionEnabled: WRITE_PROTECTION_ENABLED,
        writeAuthorized: false,
        authMode: AUTH_MODE
      },
      { "Set-Cookie": buildSessionClearCookie(req) }
    );
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
    if (!ensureWriteAccess(req, res)) {
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const names = Array.isArray(body.names) ? body.names : [];
      if (names.length !== 2) {
        sendJson(res, 400, { error: "Le champ names doit contenir exactement 2 valeurs." });
        return true;
      }
      let registeredVoters = state.registeredVoters;
      if (body.registeredVoters !== undefined) {
        const parsed = Number(body.registeredVoters);
        if (!Number.isInteger(parsed) || parsed < 0) {
          sendJson(res, 400, { error: "registeredVoters doit être un entier supérieur ou égal à 0." });
          return true;
        }
        registeredVoters = parsed;
      }

      const previous = snapshotBeforeChange();
      state.lists[0].name = safeName(names[0], state.lists[0].name);
      state.lists[1].name = safeName(names[1], state.lists[1].name);
      state.registeredVoters = registeredVoters;
      updateTimestamp();
      pushHistory({
        type: "config",
        ...previous,
        names: state.lists.map((list) => list.name),
        registeredVoters: state.registeredVoters
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
    if (!ensureWriteAccess(req, res)) {
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const tableId = parseTableId(body.tableId);
      if (!tableId) {
        sendJson(res, 400, { error: "tableId doit valoir table-1 ou table-2." });
        return true;
      }
      const table = tableById(tableId);
      if (!table) {
        sendJson(res, 404, { error: "Table introuvable." });
        return true;
      }
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
      const currentVotes = toNonNegativeInteger(table.listVotes?.[list.id], 0);
      if (currentVotes + delta < 0) {
        sendJson(res, 400, { error: "Le compteur ne peut pas descendre sous 0." });
        return true;
      }

      table.listVotes[list.id] = currentVotes + delta;
      updateTimestamp();
      pushHistory({
        type: "vote",
        tableId: table.id,
        tableName: table.name,
        listId: list.id,
        listName: list.name,
        delta
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
    if (!ensureWriteAccess(req, res)) {
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const tableId = parseTableId(body.tableId);
      if (!tableId) {
        sendJson(res, 400, { error: "tableId doit valoir table-1 ou table-2." });
        return true;
      }
      const table = tableById(tableId);
      if (!table) {
        sendJson(res, 404, { error: "Table introuvable." });
        return true;
      }
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

      const currentBlank = toNonNegativeInteger(table.blankVotes, 0);
      const currentNull = toNonNegativeInteger(table.nullVotes, 0);
      if (kind === "blank" && currentBlank + delta < 0) {
        sendJson(res, 400, { error: "Le compteur Blancs ne peut pas descendre sous 0." });
        return true;
      }
      if (kind === "null" && currentNull + delta < 0) {
        sendJson(res, 400, { error: "Le compteur Nuls ne peut pas descendre sous 0." });
        return true;
      }

      if (kind === "blank") {
        table.blankVotes = currentBlank + delta;
      } else {
        table.nullVotes = currentNull + delta;
      }

      updateTimestamp();
      pushHistory({
        type: "special_vote",
        tableId: table.id,
        tableName: table.name,
        kind,
        label: kind === "blank" ? "Blancs" : "Nuls",
        delta
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
    if (!ensureWriteAccess(req, res)) {
      return true;
    }
    const previous = snapshotBeforeChange();
    state.tables = state.tables.map((table, index) => ({
      ...normalizeTableState(table, index),
      listVotes: { "liste-1": 0, "liste-2": 0 },
      blankVotes: 0,
      nullVotes: 0
    }));
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
    if (!ensureWriteAccess(req, res)) {
      return true;
    }
    let body = {};
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return true;
    }

    const tableId = parseTableId(body.tableId);
    if (!tableId) {
      sendJson(res, 400, { error: "tableId doit valoir table-1 ou table-2." });
      return true;
    }
    const table = tableById(tableId);
    if (!table) {
      sendJson(res, 404, { error: "Table introuvable." });
      return true;
    }

    let indexToUndo = -1;
    for (let index = state.history.length - 1; index >= 0; index -= 1) {
      const entry = state.history[index];
      const isUndoableType = entry?.type === "vote" || entry?.type === "special_vote";
      if (isUndoableType && entry.tableId === tableId) {
        indexToUndo = index;
        break;
      }
    }

    if (indexToUndo < 0) {
      sendJson(res, 400, { error: "Aucune action à annuler pour cette table." });
      return true;
    }
    const target = state.history[indexToUndo];

    if (target.type === "vote") {
      const listId = target.listId === "liste-1" || target.listId === "liste-2" ? target.listId : "";
      if (!listId) {
        sendJson(res, 400, { error: "Action impossible à annuler (liste invalide)." });
        return true;
      }
      const currentVotes = toNonNegativeInteger(table.listVotes?.[listId], 0);
      const reversed = currentVotes - Number(target.delta || 0);
      if (!Number.isInteger(reversed) || reversed < 0) {
        sendJson(res, 400, { error: "Action impossible à annuler (compteur incohérent)." });
        return true;
      }
      table.listVotes[listId] = reversed;
    } else if (target.type === "special_vote") {
      const reversedDelta = Number(target.delta || 0);
      if (target.kind === "blank") {
        const next = toNonNegativeInteger(table.blankVotes, 0) - reversedDelta;
        if (!Number.isInteger(next) || next < 0) {
          sendJson(res, 400, { error: "Action impossible à annuler (blancs incohérents)." });
          return true;
        }
        table.blankVotes = next;
      } else if (target.kind === "null") {
        const next = toNonNegativeInteger(table.nullVotes, 0) - reversedDelta;
        if (!Number.isInteger(next) || next < 0) {
          sendJson(res, 400, { error: "Action impossible à annuler (nuls incohérents)." });
          return true;
        }
        table.nullVotes = next;
      } else {
        sendJson(res, 400, { error: "Action impossible à annuler (type spécial invalide)." });
        return true;
      }
    }

    state.history.splice(indexToUndo, 1);
    updateTimestamp();
    pushHistory({
      type: "undo",
      tableId: table.id,
      tableName: table.name,
      revertedType: target.type,
      revertedLabel:
        target.type === "vote" ? target.listName : target.kind === "blank" ? "Blancs" : "Nuls"
    });
    saveState();
    broadcast();
    sendJson(res, 200, computePublicState());
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/set-totals") {
    if (!ensureWriteAccess(req, res)) {
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const listVotes = Array.isArray(body.listVotes) ? body.listVotes : [];
      if (listVotes.length !== state.lists.length) {
        sendJson(res, 400, { error: "listVotes doit contenir 2 valeurs." });
        return true;
      }

      const parsedVotes = listVotes.map((value) => Number(value));
      if (!parsedVotes.every((value) => Number.isInteger(value) && value >= 0)) {
        sendJson(res, 400, { error: "Les voix des listes doivent être des entiers >= 0." });
        return true;
      }

      const blankVotes = Number(body.blankVotes);
      const nullVotes = Number(body.nullVotes);
      if (!Number.isInteger(blankVotes) || blankVotes < 0) {
        sendJson(res, 400, { error: "blankVotes doit être un entier >= 0." });
        return true;
      }
      if (!Number.isInteger(nullVotes) || nullVotes < 0) {
        sendJson(res, 400, { error: "nullVotes doit être un entier >= 0." });
        return true;
      }

      const previous = snapshotBeforeChange();
      state.tables = state.tables.map((table, index) => ({
        ...normalizeTableState(table, index),
        listVotes: index === 0 ? { "liste-1": parsedVotes[0], "liste-2": parsedVotes[1] } : { "liste-1": 0, "liste-2": 0 },
        blankVotes: index === 0 ? blankVotes : 0,
        nullVotes: index === 0 ? nullVotes : 0
      }));
      updateTimestamp();
      pushHistory({
        type: "set_totals_merged",
        listVotes: parsedVotes,
        blankVotes,
        nullVotes,
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

  return false;
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(STATIC_DIR, normalizedPath);

  if (!filePath.startsWith(STATIC_DIR)) {
    sendJson(res, 403, { error: "Accès interdit." });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        sendJson(res, 404, { error: "Ressource introuvable." });
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
        sendJson(res, 404, { error: "Point d'entrée inconnu." });
      }
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Méthode non autorisée." });
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erreur inattendue." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Serveur dépouillement prêt sur http://${HOST}:${PORT}`);
});
