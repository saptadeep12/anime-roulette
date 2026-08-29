const state = {
  playerId: localStorage.getItem("roulette-player-id") || "",
  playerName: localStorage.getItem("roulette-player-name") || "",
  adminCode: localStorage.getItem("roulette-admin-code") || "",
  snapshot: null
};
const homeScreen = document.getElementById("home-screen");
const mainLayout = document.getElementById("main-layout");
const playerView = document.getElementById("player-view");
const hostView = document.getElementById("host-view");
const choosePlayerButton = document.getElementById("choose-player");
const chooseHostButton = document.getElementById("choose-host");
const backHomeButton = document.getElementById("back-home");
const hostLeaderboard = document.getElementById("host-leaderboard");
const hostPlayerCount = document.getElementById("host-player-count");
const joinForm = document.getElementById("join-form");
const playerNameInput = document.getElementById("player-name");
const playerSession = document.getElementById("player-session");
const playerBadge = document.getElementById("player-badge");
const currentRound = document.getElementById("current-round");
const guessForm = document.getElementById("guess-form");
const characterOptionsContainer = document.getElementById("character-options");
const animeOptionsContainer = document.getElementById("anime-options");
const guessHistory = document.getElementById("guess-history");
const adminCodeInput = document.getElementById("admin-code");
const roundForm = document.getElementById("round-form");
const roundTitleInput = document.getElementById("round-title");
const roundPromptInput = document.getElementById("round-prompt");
const roundImageInput = document.getElementById("round-image");
const answerCharacterInput = document.getElementById("answer-character");
const wrongCharacter1Input = document.getElementById("wrong-character-1");
const wrongCharacter2Input = document.getElementById("wrong-character-2");
const answerAnimeInput = document.getElementById("answer-anime");
const wrongAnime1Input = document.getElementById("wrong-anime-1");
const wrongAnime2Input = document.getElementById("wrong-anime-2");
const revealRoundButton = document.getElementById("reveal-round");
const resetGameButton = document.getElementById("reset-game");
const leaderboard = document.getElementById("leaderboard");
const roundList = document.getElementById("round-list");
const playerCount = document.getElementById("player-count");
const toast = document.getElementById("toast");
const difficultySelect = document.getElementById("difficulty-select");

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

function showView(view) {
  homeScreen.classList.toggle("hidden", view !== "home");
  mainLayout.classList.toggle("hidden", view === "home");
  playerView.classList.toggle("hidden", view !== "player");
  hostView.classList.toggle("hidden", view !== "host");

  if (view === "home") {
    history.replaceState(null, "", window.location.pathname);
  } else {
    window.location.hash = view;
  }
}

function resolveInitialView() {
  const hash = window.location.hash.replace("#", "");
  return hash === "player" || hash === "host" ? hash : "home";
}

choosePlayerButton.addEventListener("click", () => showView("player"));
chooseHostButton.addEventListener("click", () => showView("host"));
backHomeButton.addEventListener("click", () => showView("home"));
window.addEventListener("hashchange", () => showView(resolveInitialView()));


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

let lastRenderedRoundId = null;

function renderOptionGroup(container, name, options) {
  container.innerHTML = options
    .map(
      (option, index) => `
        <label class="option-item">
          <input type="radio" name="${name}" value="${escapeHtml(option)}" ${index === 0 ? "" : ""} />
          <span>${escapeHtml(option)}</span>
        </label>
      `
    )
    .join("");
}

function renderCurrentRound(snapshot) {
  const round = snapshot.currentRound;
  if (!round) {
    currentRound.className = "round-card empty-state";
    currentRound.innerHTML = "Waiting for the host to open the next round.";
    guessForm.classList.add("hidden");
    lastRenderedRoundId = null;
    return;
  }

  const guessesUsed = (snapshot.currentPlayerGuesses || []).length;
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

  if (round.id !== lastRenderedRoundId) {
    renderOptionGroup(characterOptionsContainer, "character-choice", round.characterOptions || []);
    renderOptionGroup(animeOptionsContainer, "anime-choice", round.animeOptions || []);
    lastRenderedRoundId = round.id;
  }

  const shouldShowGuessForm = round.status === "open" && guessesUsed < limit;
  guessForm.classList.toggle("hidden", !shouldShowGuessForm);
}

function renderGuessHistory(snapshot) {
  const guesses = snapshot.currentPlayerGuesses || [];
  if (!guesses.length) {
    guessHistory.innerHTML = `<div class="guess-item empty-state">No guesses submitted yet.</div>`;
    return;
  }
  guessHistory.innerHTML = guesses
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
  const countText = `${snapshot.players.length} players`;
  playerCount.textContent = countText;
  hostPlayerCount.textContent = countText;

  const html = !snapshot.players.length
    ? null
    : snapshot.players
        .map(
          (player) => `
            <div class="leaderboard-item">
              <div class="leaderboard-topline">
                <div><p>#${player.rank} ${escapeHtml(player.name)}</p></div>
                <div class="score">${player.score}</div>
              </div>
            </div>
          `
        )
        .join("");

  for (const el of [leaderboard, hostLeaderboard]) {
    if (!html) {
      el.className = "leaderboard empty-state";
      el.textContent = "No players yet.";
    } else {
      el.className = "leaderboard";
      el.innerHTML = html;
    }
  }
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
            <span class="pill pill-${escapeHtml(round.status)}">${escapeHtml(round.status)}</span>
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
  const characterGuess = document.querySelector('input[name="character-choice"]:checked')?.value || "";
  const animeGuess = document.querySelector('input[name="anime-choice"]:checked')?.value || "";

  if (!characterGuess) {
    showToast("Pick a character option first");
    return;
  }

  try {
    const snapshot = await api("/api/guesses", {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, characterGuess, animeGuess })
    });
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
        anime: answerAnimeInput.value,
        characterOptions: [answerCharacterInput.value, wrongCharacter1Input.value, wrongCharacter2Input.value],
        animeOptions: [answerAnimeInput.value, wrongAnime1Input.value, wrongAnime2Input.value]
      })
    });

    roundTitleInput.value = "";
    roundPromptInput.value = "";
    roundImageInput.value = "";
    answerCharacterInput.value = "";
    wrongCharacter1Input.value = "";
    wrongCharacter2Input.value = "";
    answerAnimeInput.value = "";
    wrongAnime1Input.value = "";
    wrongAnime2Input.value = "";
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

showView(resolveInitialView());
refresh().catch(() => {});

window.setInterval(() => {
  refresh().catch(() => {});
}, 2500);


refresh().catch(() => {});
const generateRoundButton = document.getElementById("generate-round");

generateRoundButton.addEventListener("click", async () => {
  try {
    generateRoundButton.disabled = true;
    generateRoundButton.textContent = "Generating...";
    const generated = await api("/api/rounds/generate", {method: "POST", body: JSON.stringify({ difficulty: difficultySelect.value })});
    roundTitleInput.value = generated.title || "";
    roundPromptInput.value = generated.prompt;
    answerCharacterInput.value = generated.character;
    answerAnimeInput.value = generated.anime;

    const otherCharacterOptions = generated.characterOptions.filter((o) => o !== generated.character);
    const otherAnimeOptions = generated.animeOptions.filter((o) => o !== generated.anime);
    wrongCharacter1Input.value = otherCharacterOptions[0] || "";
    wrongCharacter2Input.value = otherCharacterOptions[1] || "";
    wrongAnime1Input.value = otherAnimeOptions[0] || "";
    wrongAnime2Input.value = otherAnimeOptions[1] || "";

    showToast("AI round generated — review, then Open Round");
  } catch (error) {
    showToast(error.message);
  } finally {
    generateRoundButton.disabled = false;
    generateRoundButton.textContent = "✨ Generate with AI";
  }
});