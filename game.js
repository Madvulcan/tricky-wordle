// game.js — DOM wiring for Tricky Wordle. Pure logic lives in game-logic.js.
(function () {
  "use strict";

  const G = window.GameLogic;
  const MAX_ROWS = 6;
  const STORE_KEY = "tricky-wordle-v1";

  // ---------- state ----------
  const state = {
    mode: "daily", // 'daily' | 'free'
    answer: "",
    gameNumber: 0,
    guesses: [], // strings
    verdicts: [], // per-guess verdict arrays
    current: "", // current typed row
    gameOver: false,
    hardMode: false,
    freePlayed: [], // this session's free-play answers
    lastFreeAnswer: null,
    animating: false,
  };

  const KEYS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
  ];

  const VALID_GUESSES = new Set(WORDS_GUESSES);
  WORDS_ANSWERS.forEach((w) => VALID_GUESSES.add(w)); // slang overrides are guessable

  // ---------- persistence ----------
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function save() {
    const d = load();
    d[state.mode] = {
      answer: state.answer,
      gameNumber: state.gameNumber,
      guesses: state.guesses,
      verdicts: state.verdicts,
      gameOver: state.gameOver,
    };
    if (state.mode === "free") {
      d.freePlayed = state.freePlayed;
      d.lastFreeAnswer = state.lastFreeAnswer;
    }
    d.day = G.dayNumber(new Date());
    d.hardMode = state.hardMode;
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  }
  function loadStats(mode) {
    const d = load();
    return (
      d.stats?.[mode] || { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] }
    );
  }
  function saveStats(mode, s) {
    const d = load();
    d.stats = d.stats || {};
    d.stats[mode] = s;
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  }

  // ---------- word selection ----------
  function todayAnswer() {
    const n = G.dayNumber(new Date());
    return { word: G.pickDailyWord(n, ROTATION), num: n + 1 };
  }
  function startDaily() {
    const { word, num } = todayAnswer();
    state.mode = "daily";
    state.answer = word;
    state.gameNumber = num;
    beginRound();
  }
  function startFree() {
    state.mode = "free";
    state.answer = G.pickRandomWord(WORDS_ANSWERS, [
      ...(state.freePlayed || []),
      state.lastFreeAnswer || "",
    ]);
    state.gameNumber = 0;
    beginRound();
  }
  function beginRound() {
    state.guesses = [];
    state.verdicts = [];
    state.current = "";
    state.gameOver = false;
    state.animating = false;
    buildBoard();
    paintKeyboard();
    save();
  }

  // ---------- board ----------
  const boardEl = document.getElementById("board");
  function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < MAX_ROWS; r++) {
      const row = document.createElement("div");
      row.className = "row";
      for (let c = 0; c < 5; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        row.appendChild(tile);
      }
      boardEl.appendChild(row);
    }
    paintCurrent();
    // restore prior guesses
    state.verdicts.forEach((v, i) => paintRow(i, state.guesses[i], v, false));
  }
  function rowTiles(r) {
    return boardEl.children[r] ? Array.from(boardEl.children[r].children) : [];
  }
  function paintCurrent() {
    if (state.gameOver) return;
    const r = state.guesses.length;
    if (r >= MAX_ROWS) return;
    const tiles = rowTiles(r);
    for (let c = 0; c < 5; c++) {
      tiles[c].textContent = state.current[c] || "";
      tiles[c].classList.toggle("filled", c < state.current.length);
    }
  }
  function paintRow(r, guess, verdicts, animate) {
    const tiles = rowTiles(r);
    for (let c = 0; c < 5; c++) {
      const tile = tiles[c];
      tile.textContent = guess[c];
      const cls = { correct: "correct", present: "present", absent: "absent" }[verdicts[c]];
      const apply = () => {
        tile.classList.remove("filled");
        tile.classList.add(cls);
        updateKeyColor(guess[c], cls);
      };
      if (animate) setTimeout(apply, c * 300);
      else apply();
    }
    if (animate) {
      tiles.forEach((t) => t.classList.add("reveal-correct"));
      const last = tiles[4];
      setTimeout(() => {
        last.classList.add("bounce");
        last.classList.remove("reveal-correct", "bounce");
        tileClasses(tiles, verdicts);
      }, 5 * 300 + 250);
    } else {
      tileClasses(tiles, verdicts);
    }
  }
  function tileClasses(tiles, verdicts) {
    tiles.forEach((t, i) => {
      t.classList.remove("reveal-correct", "bounce");
      t.classList.add({ correct: "correct", present: "present", absent: "absent" }[verdicts[i]]);
    });
  }

  // ---------- keyboard ----------
  const keyColors = {}; // letter -> class
  function updateKeyColor(letter, cls) {
    const order = ["correct", "present", "absent"];
    if (!keyColors[letter] || order.indexOf(cls) < order.indexOf(keyColors[letter])) {
      keyColors[letter] = cls;
    }
    paintKeyboard();
  }
  function paintKeyboard() {
    const kb = document.getElementById("keyboard");
    if (!kb.childElementCount) {
      KEYS.forEach((rowKeys) => {
        const row = document.createElement("div");
        row.className = "kb-row";
        rowKeys.forEach((k) => {
          const b = document.createElement("button");
          b.className = "key" + (k.length > 1 ? " wide" : "");
          b.textContent = k === "BACK" ? "⌫" : k;
          b.dataset.key = k;
          b.addEventListener("click", () => handleKey(k));
          row.appendChild(b);
        });
        kb.appendChild(row);
      });
    }
    kb.querySelectorAll(".key").forEach((b) => {
      b.classList.remove("correct", "present", "absent");
      const col = keyColors[b.dataset.key];
      if (col) b.classList.add(col);
    });
  }

  // ---------- input ----------
  function handleKey(k) {
    if (state.animating) return;
    if (state.gameOver) return;
    if (k === "ENTER") return submit();
    if (k === "BACK") {
      state.current = state.current.slice(0, -1);
      paintCurrent();
      return;
    }
    if (/^[A-Z]$/.test(k) && state.current.length < 5) {
      state.current += k;
      paintCurrent();
    }
  }
  document.addEventListener("keydown", (e) => {
    if (document.querySelector(".overlay:not(.hidden)")) {
      if (e.key === "Escape") closeAllPanels();
      return;
    }
    if (e.key === "Enter") handleKey("ENTER");
    else if (e.key === "Backspace") handleKey("BACK");
    else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
  });

  function shakeRow() {
    const r = state.guesses.length;
    if (r >= MAX_ROWS) return;
    const row = boardEl.children[r];
    row.classList.add("shake");
    setTimeout(() => row.classList.remove("shake"), 520);
  }

  function toast(msg, ms) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add("hidden"), ms || 1600);
  }

  // ---------- submit ----------
  function submit() {
    if (state.current.length !== 5) {
      toast("Not enough letters");
      shakeRow();
      return;
    }
    const guess = state.current;
    const reject = (msg) => {
      toast(msg);
      shakeRow();
      // Wordle behavior: rejected word clears after the shake
      setTimeout(() => {
        state.current = "";
        paintCurrent();
      }, 550);
    };
    if (!VALID_GUESSES.has(guess)) {
      reject("Not in word list");
      return;
    }
    if (state.hardMode) {
      const hm = G.checkHardMode(state.verdicts, state.guesses, guess);
      if (!hm.ok) {
        reject(`Hard mode: ${hm.reason}`);
        return;
      }
    }
    const verdicts = G.scoreGuess(state.answer, guess);
    state.guesses.push(guess);
    state.verdicts.push(verdicts);
    state.current = "";
    state.animating = true;
    paintRow(state.guesses.length - 1, guess, verdicts, true);
    save();

    const won = verdicts.every((v) => v === "correct");
    const done = won || state.guesses.length >= MAX_ROWS;
    setTimeout(() => {
      state.animating = false;
      if (done) finishRound(won, state.guesses.length);
      else paintCurrent();
    }, 5 * 300 + 350);
  }

  function finishRound(won, tries) {
    state.gameOver = true;
    const stats = G.updateStats(loadStats(state.mode), won, won ? tries : 6);
    saveStats(state.mode, stats);
    if (state.mode === "free") {
      state.lastFreeAnswer = state.answer;
      state.freePlayed.push(state.answer);
    }
    save();
    setTimeout(() => showEnd(won, tries, stats), 400);
  }

  // ---------- panels ----------
  function showEnd(won, tries, stats) {
    document.getElementById("end-title").textContent = won
      ? ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Phew"][tries - 1]
      : "Tough luck";
    document.getElementById("end-word").textContent = state.answer;
    const grid = state.verdicts
      .map((v) => v.map((x) => ({ correct: "🟩", present: "🟨", absent: "⬛" }[x])).join(""))
      .join("\n");
    document.getElementById("end-grid").textContent = grid;
    const cd = document.getElementById("end-countdown");
    if (state.mode === "daily") {
      cd.textContent = "Next word at midnight";
      startCountdown(cd);
    } else {
      cd.textContent = "";
      clearInterval(cd._h);
    }
    renderStatsInto(document.getElementById("end-stats"), stats, tries);
    const share = document.getElementById("btn-share");
    const again = document.getElementById("btn-free-again");
    share.classList.toggle("hidden", state.mode === "free" && !won && tries >= MAX_ROWS ? false : false);
    share.classList.toggle("hidden", false);
    again.classList.toggle("hidden", state.mode !== "free");
    share.onclick = () => {
      const text = G.shareText(
        state.mode === "daily" ? state.gameNumber : 0,
        won,
        tries,
        state.verdicts
      );
      navigator.clipboard
        .writeText(state.mode === "daily" ? text : text.replace("Tricky Wordle 0", "Tricky Wordle (Free)"))
        .then(() => toast("Copied to clipboard"));
    };
    again.onclick = () => {
      closeAllPanels();
      startFree();
    };
    document.getElementById("end-panel").classList.remove("hidden");
  }
  function startCountdown(el) {
    clearInterval(el._h);
    const tick = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const s = Math.floor((next - now) / 1000);
      const h = String(Math.floor(s / 3600)).padStart(2, "0");
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const sec = String(s % 60).padStart(2, "0");
      el.textContent = `Next word in ${h}:${m}:${sec}`;
      // roll over at midnight
      if (s <= 1) startDaily();
    };
    tick();
    el._h = setInterval(tick, 1000);
  }
  function renderStatsInto(el, stats, tries) {
    const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    const maxDist = Math.max(...stats.dist, 1);
    el.innerHTML = `
      <div class="stat-row">
        <div class="stat"><div class="num">${stats.played}</div><div class="label">Played</div></div>
        <div class="stat"><div class="num">${winPct}</div><div class="label">Win %</div></div>
        <div class="stat"><div class="num">${stats.streak}</div><div class="label">Streak</div></div>
        <div class="stat"><div class="num">${stats.maxStreak}</div><div class="label">Max</div></div>
      </div>
      <div style="text-align:center;font-size:0.7rem;letter-spacing:0.1em;margin-bottom:6px">GUESS DISTRIBUTION</div>
      ${stats.dist
        .map((n, i) => {
          const pct = Math.max((n / maxDist) * 100, 8);
          const hl = state.gameOver && tries === i + 1;
          return `<div class="dist-row"><div class="dist-label">${i + 1}</div><div class="dist-bar${hl ? " highlight" : ""}" style="width:${pct}%">${n}</div></div>`;
        })
        .join("")}
    `;
  }

  function openPanel(id) {
    closeAllPanels();
    if (id === "stats-panel") renderStatsPanel();
    document.getElementById(id).classList.remove("hidden");
  }
  function renderStatsPanel() {
    const daily = loadStats("daily");
    const free = loadStats("free");
    const el = document.getElementById("stats-body");
    el.innerHTML = `
      <h3 style="margin-bottom:4px">Daily</h3>
      <div id="sd"></div>
      <h3 style="margin:12px 0 4px">Free play</h3>
      <div id="sf"></div>
    `;
    renderStatsInto(el.querySelector("#sd"), daily);
    renderStatsInto(el.querySelector("#sf"), free);
  }
  function closeAllPanels() {
    document.querySelectorAll(".overlay").forEach((o) => o.classList.add("hidden"));
  }

  // ---------- wire up ----------
  document.getElementById("btn-help").addEventListener("click", () => openPanel("help-panel"));
  document.getElementById("btn-stats").addEventListener("click", () => openPanel("stats-panel"));
  document.getElementById("btn-settings").addEventListener("click", () => openPanel("settings-panel"));
  ["end", "stats", "help", "settings"].forEach((p) =>
    document.getElementById(`${p}-close`).addEventListener("click", closeAllPanels)
  );

  document.getElementById("tab-daily").addEventListener("click", () => {
    document.getElementById("tab-daily").classList.add("active");
    document.getElementById("tab-free").classList.remove("active");
    startDaily();
  });
  document.getElementById("tab-free").addEventListener("click", () => {
    document.getElementById("tab-free").classList.add("active");
    document.getElementById("tab-daily").classList.remove("active");
    startFree();
  });

  const hardToggle = document.getElementById("toggle-hard");
  const darkToggle = document.getElementById("toggle-dark");
  hardToggle.addEventListener("change", () => {
    state.hardMode = hardToggle.checked;
    save();
  });
  darkToggle.addEventListener("change", () => {
    document.documentElement.setAttribute("data-theme", darkToggle.checked ? "dark" : "light");
    localStorage.setItem(STORE_KEY + "-theme", darkToggle.checked ? "dark" : "light");
  });
  document.getElementById("btn-reset").addEventListener("click", () => {
    const d = load();
    delete d.stats;
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    toast("Statistics reset");
    closeAllPanels();
  });

  // theme: stored preference, else system
  const storedTheme = localStorage.getItem(STORE_KEY + "-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = storedTheme ? storedTheme === "dark" : prefersDark;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  darkToggle.checked = dark;

  // ---------- boot: restore or start ----------
  (function boot() {
    const d = load();
    state.hardMode = !!d.hardMode;
    hardToggle.checked = state.hardMode;
    state.freePlayed = d.freePlayed || [];
    state.lastFreeAnswer = d.lastFreeAnswer || null;

    const today = G.dayNumber(new Date());
    if (d.daily && d.day === today && d.daily.answer) {
      // resume today's daily
      state.mode = "daily";
      state.answer = d.daily.answer;
      state.gameNumber = d.daily.gameNumber;
      state.guesses = d.daily.guesses || [];
      state.verdicts = d.daily.verdicts || [];
      state.gameOver = d.daily.gameOver || state.guesses.length >= MAX_ROWS;
      buildBoard();
      paintKeyboard();
      if (state.gameOver) setTimeout(() => showEnd(state.verdicts.every((v) => v.every((x) => x === "correct")), state.guesses.length, loadStats("daily")), 300);
      return;
    }
    startDaily();
  })();
})();
