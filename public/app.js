const state = {
  playerId: localStorage.getItem("roulette-player-id") || "",
  playerName: localStorage.getItem("roulette-player-name") || "",
  adminCode: localStorage.getItem("roulette-admin-code") || "",
  snapshot: null
};

const joinForm = document.getElementById("join-form");
const playerNameInput = document.getElementById("player-name");
const playerSession = document.getElementById("player-session");
const playerBadge = document.getElementById("player-badge");
const currentRound = document.getElementById("current-round");
const guessForm = document.getElementById("guess-form");
const characterGuessInput = document.getElementById("character-guess");
const animeGuessInput = document.getElementById("anime-guess");
const guessHistory = document.getElementById("guess-history");
const adminCodeInput = document.getElementById("admin-code");
const roundForm = document.getElementById("round-form");
const roundTitleInput = document.getElementById("round-title");
const roundPromptInput = document.getElementById("round-prompt");
const roundImageInput = document.getElementById("round-image");
const answerCharacterInput = document.getElementById("answer-character");
const answerAnimeInput = document.getElementById("answer-anime");
const revealRoundButton = document.getElementById("reveal-round");
const resetGameButton = document.getElementById("reset-game");
const leaderboard = document.getElementById("leaderboard");
const roundList = document.getElementById("round-list");
const playerCount = document.getElementById("player-count");
const toast = document.getElementById("toast");

playerNameInput.value = state.playerName;
adminCodeInput.value = state.adminCode;

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 2800);
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.adminCode) {
    headers["x-admin-code"] = state.adminCode;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCurrentRound(snapshot) {
  const round = snapshot.currentRound;
  if (!round) {
    currentRound.className = "round-card empty-state";
    currentRound.innerHTML = "Waiting for the host to open the next round.";
    guessForm.classList.add("hidden");
    return;
  }

  const guessesUsed = snapshot.currentPlayerGuesses.length;
  const limit = snapshot.settings.guessLimit;
  const answer = round.answer
    ? `<div class="answer-chip">Answer: ${escapeHtml(round.answer.character)} • ${escapeHtml(round.answer.anime)}</div>`
    : "";

  const image = round.imageUrl
    ? `<img class="round-image" src="${escapeHtml(round.imageUrl)}" alt="${escapeHtml(round.title)}" />`
    : "";

  currentRound.className = "round-card";
  currentRound.innerHTML = `
    <p class="eyebrow">Round ${round.roundNumber}</p>
    <h3>${escapeHtml(round.title)}</h3>
    <div class="guess-meta">
      <span>Status: ${escapeHtml(round.status)}</span>
      <span>Your guesses: ${guessesUsed}/${limit}</span>
    </div>
    <div class="prompt-box">${escapeHtml(round.prompt)}</div>
    ${image}
    ${answer}
  `;

  const shouldShowGuessForm = round.status === "open" && guessesUsed < limit;
  guessForm.classList.toggle("hidden", !shouldShowGuessForm);
}

function renderGuessHistory(snapshot) {
  if (!snapshot.currentPlayerGuesses.length) {
    guessHistory.innerHTML = `<div class="guess-item empty-state">No guesses submitted yet.</div>`;
    return;
  }

  guessHistory.innerHTML = snapshot.currentPlayerGuesses
    .map(
      (guess, index) => `
        <div class="guess-item">
          <p><strong>Guess ${index + 1}:</strong> ${escapeHtml(guess.characterGuess)}${
            guess.animeGuess ? ` from ${escapeHtml(guess.animeGuess)}` : ""
          }</p>
          <small>Points: ${guess.pointsAwarded}</small>
        </div>
      `
    )
    .join("");
}

function renderLeaderboard(snapshot) {
  playerCount.textContent = `${snapshot.players.length} players`;

  if (!snapshot.players.length) {
    leaderboard.className = "leaderboard empty-state";
    leaderboard.textContent = "No players yet.";
    return;
  }

  leaderboard.className = "leaderboard";
  leaderboard.innerHTML = snapshot.players
    .map(
      (player) => `
        <div class="leaderboard-item">
          <div class="leaderboard-topline">
            <div>
              <p>#${player.rank} ${escapeHtml(player.name)}</p>
            </div>
            <div class="score">${player.score}</div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderRoundList(snapshot) {
  if (!snapshot.rounds.length) {
    roundList.className = "stack empty-state";
    roundList.textContent = "No rounds created yet.";
    return;
  }

  roundList.className = "stack";
  roundList.innerHTML = snapshot.rounds
    .slice()
    .reverse()
    .map((round) => {
      const answer = round.answer
        ? `<div class="answer-chip">${escapeHtml(round.answer.character)} • ${escapeHtml(round.answer.anime)}</div>`
        : "";

      return `
        <div class="round-item">
          <div class="leaderboard-topline">
            <h3>Round ${round.roundNumber}: ${escapeHtml(round.title)}</h3>
            <span class="pill">${escapeHtml(round.status)}</span>
          </div>
          <div class="round-meta">
            <span>${round.guessCount} guesses</span>
          </div>
          <div class="prompt-box">${escapeHtml(round.prompt)}</div>
          ${answer}
        </div>
      `;
    })
    .join("");
}

function render(snapshot) {
  state.snapshot = snapshot;
  if (snapshot.player) {
    playerSession.classList.remove("hidden");
    playerBadge.textContent = `${snapshot.player.name} • ${snapshot.player.score} pts`;
    joinForm.classList.add("hidden");
  }

  renderCurrentRound(snapshot);
  renderGuessHistory(snapshot);
  renderLeaderboard(snapshot);
  renderRoundList(snapshot);
}

async function refresh() {
  const query = state.playerId ? `?playerId=${encodeURIComponent(state.playerId)}` : "";
  const snapshot = await api(`/api/state${query}`, { method: "GET" });
  render(snapshot);
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await api("/api/join", {
      method: "POST",
      body: JSON.stringify({ name: playerNameInput.value })
    });
    state.playerId = response.player.id;
    state.playerName = response.player.name;
    localStorage.setItem("roulette-player-id", state.playerId);
    localStorage.setItem("roulette-player-name", state.playerName);
    render(response.state);
    showToast("Joined the game");
  } catch (error) {
    showToast(error.message);
  }
});

guessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const snapshot = await api("/api/guesses", {
      method: "POST",
      body: JSON.stringify({
        playerId: state.playerId,
        characterGuess: characterGuessInput.value,
        animeGuess: animeGuessInput.value
      })
    });
    characterGuessInput.value = "";
    animeGuessInput.value = "";
    render(snapshot);
    showToast("Guess submitted");
  } catch (error) {
    showToast(error.message);
  }
});

adminCodeInput.addEventListener("change", () => {
  state.adminCode = adminCodeInput.value.trim();
  localStorage.setItem("roulette-admin-code", state.adminCode);
  showToast("Admin code saved in this browser");
});

roundForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const snapshot = await api("/api/rounds", {
      method: "POST",
      body: JSON.stringify({
        title: roundTitleInput.value,
        prompt: roundPromptInput.value,
        imageUrl: roundImageInput.value,
        character: answerCharacterInput.value,
        anime: answerAnimeInput.value
      })
    });

    roundTitleInput.value = "";
    roundPromptInput.value = "";
    roundImageInput.value = "";
    answerCharacterInput.value = "";
    answerAnimeInput.value = "";
    render(snapshot);
    showToast("Round opened");
  } catch (error) {
    showToast(error.message);
  }
});

revealRoundButton.addEventListener("click", async () => {
  try {
    const snapshot = await api("/api/rounds/reveal", { method: "POST" });
    render(snapshot);
    showToast("Round revealed and scored");
  } catch (error) {
    showToast(error.message);
  }
});

resetGameButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Reset players, scores, and rounds?");
  if (!confirmed) {
    return;
  }

  try {
    const snapshot = await api("/api/reset", { method: "POST" });
    render(snapshot);
    showToast("Game reset");
  } catch (error) {
    showToast(error.message);
  }
});

window.setInterval(() => {
  refresh().catch(() => {});
}, 2500);

refresh().catch(() => {});
const generateRoundButton = document.getElementById("generate-round");

generateRoundButton.addEventListener("click", async () => {
  try {
    generateRoundButton.disabled = true;
    generateRoundButton.textContent = "Generating...";
    const generated = await api("/api/rounds/generate", { method: "POST" });
    roundTitleInput.value = generated.title || "";
    roundPromptInput.value = generated.prompt;
    answerCharacterInput.value = generated.character;
    answerAnimeInput.value = generated.anime;
    showToast("AI round generated — review, then Open Round");
  } catch (error) {
    showToast(error.message);
  } finally {
    generateRoundButton.disabled = false;
    generateRoundButton.textContent = "✨ Generate with AI";
  }
});
