// game-logic.js — pure game logic, no DOM. Loads in browser (script tag) and Node (tests).
// UMD-ish: attach to window if present, else module.exports for node --test.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.GameLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EPOCH = "2026-11-01"; // game #1; share text numbering starts here

  /**
   * Score a guess against the answer using Wordle's two-pass algorithm.
   * Pass 1: consume exact (green) matches. Pass 2: consume present (yellow)
   * matches left-to-right against remaining letters. Everything else absent.
   * @param {string} answer 5 uppercase letters
   * @param {string} guess  5 uppercase letters
   * @returns {("correct"|"present"|"absent")[]} per-tile verdicts
   */
  function scoreGuess(answer, guess) {
    const result = new Array(5).fill("absent");
    const remaining = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) result[i] = "correct";
      else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (result[i] === "correct") continue;
      const c = guess[i];
      if (remaining[c] > 0) {
        result[i] = "present";
        remaining[c]--;
      }
    }
    return result;
  }

  /**
   * Days since EPOCH for a JS Date (or now). Local calendar days.
   */
  function dayNumber(date) {
    const d = date || new Date();
    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const epoch = new Date(2026, 10, 1); // 2026-11-01 local
    const ms = local.getTime() - epoch.getTime();
    return Math.round(ms / 86400000);
  }

  /** Daily word: rotation[dayNumber mod length]. Deterministic, serverless. */
  function pickDailyWord(dayNum, rotation) {
    if (!rotation || rotation.length === 0) throw new Error("empty rotation");
    const i = ((dayNum % rotation.length) + rotation.length) % rotation.length;
    return rotation[i];
  }

  /**
   * Free-play draw: uniform over pool, excluding recent answers.
   * @param {string[]} pool
   * @param {string[]} exclude
   * @param {function(number):number} rng function(max)->int in [0,max) (stub in tests)
   */
  function pickRandomWord(pool, exclude, rng) {
    if (!pool || pool.length === 0) throw new Error("empty pool");
    const candidates = pool.filter((w) => !exclude.includes(w));
    const usable = candidates.length > 0 ? candidates : pool;
    const r = rng ? rng(usable.length) : secureRandomInt(usable.length);
    return usable[r];
  }

  function secureRandomInt(max) {
    if (max <= 0) throw new Error("max must be positive");
    const cryptoObj = typeof self !== "undefined" && self.crypto ? self.crypto : typeof require !== "undefined" ? require("crypto").webcrypto : globalThis.crypto;
    const range = 4294967296; // 2^32
    const limit = range - (range % max);
    let x;
    do {
      const arr = new Uint32Array(1);
      cryptoObj.getRandomValues(arr);
      x = arr[0];
    } while (x >= limit);
    return x % max;
  }

  /**
   * Hard-mode legality: every revealed constraint must be reused.
   * @param {("correct"|"present"|"absent")[][]} priorVerdicts per-guess verdict arrays
   * @param {string[]} priorGuesses
   * @param {string} guess
   * @returns {{ok: boolean, reason?: string}}
   */
  function checkHardMode(priorVerdicts, priorGuesses, guess) {
    for (let g = 0; g < priorGuesses.length; g++) {
      const v = priorVerdicts[g];
      const guessStr = priorGuesses[g];
      for (let i = 0; i < 5; i++) {
        if (v[i] === "correct" && guess[i] !== guessStr[i]) {
          return { ok: false, reason: `${i + 1}${ordinal(i + 1)} letter must be ${guessStr[i]}` };
        }
      }
      const required = {};
      for (let i = 0; i < 5; i++) if (v[i] === "present") required[guessStr[i]] = true;
      for (const c of Object.keys(required)) {
        if (!guess.includes(c)) {
          return { ok: false, reason: `guess must contain ${c}` };
        }
      }
    }
    return { ok: true };
  }

  function ordinal(n) {
    return n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  }

  /** Stats record update. stats: {played,wins,streak,maxStreak,dist:[6 zeros]} */
  function updateStats(stats, won, tries) {
    const s = {
      played: stats.played + 1,
      wins: stats.wins + (won ? 1 : 0),
      streak: won ? stats.streak + 1 : 0,
      maxStreak: stats.maxStreak,
      dist: stats.dist.slice(),
    };
    if (won) {
      s.dist[tries - 1]++;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
    }
    return s;
  }

  /** Share text for clipboard. grid: array of verdict arrays for the player's guesses. */
  function shareText(gameNumber, won, tries, grid) {
    const emoji = { correct: "\u{1F7E9}", present: "\u{1F7E8}", absent: "\u2B1B" };
    const head = `Tricky Wordle ${gameNumber} ${won ? tries : "X"}/6`;
    const body = grid
      .map((row) => row.map((v) => emoji[v]).join(""))
      .join("\n");
    return `${head}\n${body}`;
  }

  return {
    EPOCH,
    scoreGuess,
    dayNumber,
    pickDailyWord,
    pickRandomWord,
    secureRandomInt,
    checkHardMode,
    updateStats,
    shareText,
  };
});
