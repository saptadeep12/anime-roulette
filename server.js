const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");


const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";


const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_CODE = process.env.ADMIN_CODE || "host123";
const STATE_KEY = "anime-roulette:state";
const LOCK_KEY = "anime-roulette:lock";
const USE_REDIS = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
let redisClient;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function createInitialState() {
  return {
    settings: {
      appName: "AI Anime Prompt Roulette",
      guessLimit: 3
    },
    players: [],
    rounds: [],
    currentRoundId: null,
    updatedAt: new Date().toISOString()
  };
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(createInitialState(), null, 2));
  }
}

function getRedis() {
  if (!redisClient) {
    const { Redis } = require("@upstash/redis");
    redisClient = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN
    });
  }
  return redisClient;
}

async function readStore() {
  if (USE_REDIS) {
    return (await getRedis().get(STATE_KEY)) || createInitialState();
  }

  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

async function writeStore(state) {
  state.updatedAt = new Date().toISOString();
  if (USE_REDIS) {
    await getRedis().set(STATE_KEY, state);
    return state;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  return state;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function withStoreLock(update) {
  if (!USE_REDIS) {
    const state = await readStore();
    const result = await update(state);
    await writeStore(state);
    return result;
  }

  const redis = getRedis();
  const lockToken = createId("lock");
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const locked = await redis.set(LOCK_KEY, lockToken, { nx: true, ex: 10 });
    if (locked === "OK") {
      try {
        const state = await readStore();
        const result = await update(state);
        await writeStore(state);
        return result;
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          [LOCK_KEY],
          [lockToken]
        );
      }
    }
    await delay(80);
  }

  throw new Error("The game is busy. Please try again.");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sanitize(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return sanitize(value).toLowerCase();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function summarizeState(state) {
  const leaderboard = [...state.players]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    })
    .map((player, index) => ({
      rank: index + 1,
      id: player.id,
      name: player.name,
      score: player.score,
      joinedAt: player.joinedAt
    }));

  const currentRound = state.rounds.find((round) => round.id === state.currentRoundId) || null;

  return {
    settings: state.settings,
    players: leaderboard,
    rounds: state.rounds.map((round) => ({
      id: round.id,
      roundNumber: round.roundNumber,
      title: round.title,
      prompt: round.prompt,
      imageUrl: round.imageUrl,
      status: round.status,
      revealedAt: round.revealedAt,
      createdAt: round.createdAt,
      guessCount: round.guesses.length,
      answer:
        round.status === "revealed"
          ? {
              character: round.answer.character,
              anime: round.answer.anime
            }
          : null
    })),
    currentRound: currentRound
      ? {
          id: currentRound.id,
          roundNumber: currentRound.roundNumber,
          title: currentRound.title,
          prompt: currentRound.prompt,
          imageUrl: currentRound.imageUrl,
          status: currentRound.status,
          createdAt: currentRound.createdAt,
          answer:
            currentRound.status === "revealed"
              ? {
                  character: currentRound.answer.character,
                  anime: currentRound.answer.anime
                }
              : null
        }
      : null,
    updatedAt: state.updatedAt
  };
}

function getPlayerView(state, playerId) {
  const base = summarizeState(state);
  const player = state.players.find((entry) => entry.id === playerId) || null;
  const currentRound = state.rounds.find((round) => round.id === state.currentRoundId) || null;

  let guesses = [];
  if (player && currentRound) {
    guesses = currentRound.guesses
      .filter((guess) => guess.playerId === player.id)
      .map((guess) => ({
        id: guess.id,
        characterGuess: guess.characterGuess,
        animeGuess: guess.animeGuess,
        submittedAt: guess.submittedAt,
        pointsAwarded: guess.pointsAwarded
      }));
  }

  return {
    ...base,
    player,
    currentPlayerGuesses: guesses
  };
}

function requireAdmin(req) {
  return req.headers["x-admin-code"] === ADMIN_CODE;
}

function serveStatic(reqPath, res) {
  let filePath = reqPath === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, reqPath);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendText(res, 404, "Not found");
        return;
      }
      sendText(res, 500, "Failed to read file");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    res.end(content);
  });
}

async function handleJoin(req, res, body) {
  const name = sanitize(body.name);
  if (!name) {
    sendJson(res, 400, { error: "Name is required" });
    return;
  }

  const result = await withStoreLock((state) => {
    const existing = state.players.find((player) => normalize(player.name) === normalize(name));
    if (existing) {
      return { status: 200, player: existing, state: getPlayerView(state, existing.id) };
    }

    const player = {
      id: createId("player"),
      name,
      score: 0,
      joinedAt: new Date().toISOString()
    };
    state.players.push(player);
    return { status: 201, player, state: getPlayerView(state, player.id) };
  });
  sendJson(res, result.status, { player: result.player, state: result.state });
}

async function handlePlayerState(req, res, url) {
  const playerId = sanitize(url.searchParams.get("playerId"));
  const state = await readStore();
  sendJson(res, 200, getPlayerView(state, playerId));
}

async function handleAdminState(req, res) {
  if (!requireAdmin(req)) {
    sendJson(res, 401, { error: "Admin code required" });
    return;
  }

  const state = await readStore();
  sendJson(res, 200, summarizeState(state));
}

async function handleCreateRound(req, res, body) {
  if (!requireAdmin(req)) {
    sendJson(res, 401, { error: "Admin code required" });
    return;
  }

  const prompt = sanitize(body.prompt);
  const requestedTitle = sanitize(body.title);
  const imageUrl = sanitize(body.imageUrl);
  const character = sanitize(body.character);
  const anime = sanitize(body.anime);

  if (!prompt || !character || !anime) {
    sendJson(res, 400, { error: "Prompt, character, and anime are required" });
    return;
  }

  const summary = await withStoreLock((state) => {
    const roundNumber = state.rounds.length + 1;
    const round = {
      id: createId("round"),
      roundNumber,
      title: requestedTitle || `Round ${roundNumber}`,
      prompt,
      imageUrl,
      status: "open",
      createdAt: new Date().toISOString(),
      revealedAt: null,
      answer: { character, anime },
      guesses: []
    };
    state.rounds.push(round);
    state.currentRoundId = round.id;
    return summarizeState(state);
  });
  sendJson(res, 201, summary);
}

async function handleSubmitGuess(req, res, body) {
  const playerId = sanitize(body.playerId);
  const characterGuess = sanitize(body.characterGuess);
  const animeGuess = sanitize(body.animeGuess);

  if (!playerId || !characterGuess) {
    sendJson(res, 400, { error: "Player and character guess are required" });
    return;
  }

  const result = await withStoreLock((state) => {
    const player = state.players.find((entry) => entry.id === playerId);
    if (!player) return { status: 404, error: "Player not found" };

    const round = state.rounds.find((entry) => entry.id === state.currentRoundId);
    if (!round || round.status !== "open") return { status: 400, error: "No active round is open" };

    const playerGuesses = round.guesses.filter((guess) => guess.playerId === playerId);
    if (playerGuesses.length >= state.settings.guessLimit) {
      return { status: 400, error: `You already used all ${state.settings.guessLimit} guesses` };
    }

    round.guesses.push({
      id: createId("guess"), playerId, characterGuess, animeGuess,
      submittedAt: new Date().toISOString(), pointsAwarded: 0
    });
    return { status: 201, payload: getPlayerView(state, playerId) };
  });
  if (result.error) {
    sendJson(res, result.status, { error: result.error });
    return;
  }
  sendJson(res, result.status, result.payload);
}

async function handleReveal(req, res) {
  if (!requireAdmin(req)) {
    sendJson(res, 401, { error: "Admin code required" });
    return;
  }

  const result = await withStoreLock((state) => {
    const round = state.rounds.find((entry) => entry.id === state.currentRoundId);
    if (!round || round.status !== "open") return { error: "No open round to reveal" };

    const answerCharacter = normalize(round.answer.character);
    const answerAnime = normalize(round.answer.anime);
    for (const guess of round.guesses) {
      const characterMatch = normalize(guess.characterGuess) === answerCharacter;
      const animeMatch = normalize(guess.animeGuess) === answerAnime;
      let points = 0;
      if (characterMatch) {
        points += 1;
        if (animeMatch) points += 1;
      }
      guess.pointsAwarded = points;
      if (points > 0) {
        const player = state.players.find((entry) => entry.id === guess.playerId);
        if (player) player.score += points;
      }
    }
    round.status = "revealed";
    round.revealedAt = new Date().toISOString();
    state.currentRoundId = null;
    return { payload: summarizeState(state) };
  });
  if (result.error) {
    sendJson(res, 400, { error: result.error });
    return;
  }
  sendJson(res, 200, result.payload);
}

async function handleReset(req, res) {
  if (!requireAdmin(req)) {
    sendJson(res, 401, { error: "Admin code required" });
    return;
  }


  const summary = await withStoreLock((state) => {
    Object.assign(state, createInitialState());
    return summarizeState(state);
  });
  sendJson(res, 200, summary);
}



async function generateRoundContent(usedCharacters) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");

  const avoid = usedCharacters.length
    ? `Avoid these already-used characters: ${usedCharacters.join(", ")}.`
    : "";

  const systemPrompt = `You generate rounds for an anime character guessing game.
Reply with ONLY a JSON object, no markdown, matching this exact shape:
{"title": string, "prompt": string, "character": string, "anime": string}
Rules:
- "character" is a well-known anime character's commonly used name.
- "anime" is the anime that character appears in.
- "prompt" is a 2-4 sentence riddle-like description of the character that NEVER names the character or the anime.
- "title" is short, like "Round 7".
- Vary genre/difficulty and pick a different character each time.
${avoid}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate one round." }
      ],
      temperature: 1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`Groq request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Groq returned no content");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Groq returned invalid JSON");
  }

  const title = sanitize(parsed.title);
  const prompt = sanitize(parsed.prompt);
  const character = sanitize(parsed.character);
  const anime = sanitize(parsed.anime);

  if (!prompt || !character || !anime) {
    throw new Error("Groq response was missing required fields");
  }
  return { title, prompt, character, anime };
}

async function handleGenerateRound(req, res) {
  if (!requireAdmin(req)) {
    sendJson(res, 401, { error: "Admin code required" });
    return;
  }
  try {
    const state = await readStore();
    const usedCharacters = state.rounds.map((r) => r.answer.character);
    const generated = await generateRoundContent(usedCharacters);
    sendJson(res, 200, generated);
  } catch (error) {
    sendJson(res, 502, { error: error.message || "AI generation failed" });
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
    serveStatic(url.pathname, res);
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      await handlePlayerState(req, res, url);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/state") {
      await handleAdminState(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/join") {
      const body = await parseBody(req);
      await handleJoin(req, res, body);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rounds") {
      const body = await parseBody(req);
      await handleCreateRound(req, res, body);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rounds/generate") {
      await handleGenerateRound(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/guesses") {
      const body = await parseBody(req);
      await handleSubmitGuess(req, res, body);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rounds/reveal") {
      await handleReveal(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      await handleReset(req, res);
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error" });
  }
}

if (require.main === module) {
  ensureStore();
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`AI Anime Prompt Roulette running at http://localhost:${PORT}`);
    console.log(`Admin code: ${ADMIN_CODE}`);
  });
}

module.exports = { handleRequest };
