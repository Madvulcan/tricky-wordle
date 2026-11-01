const test = require("node:test");
const assert = require("node:assert");
const L = require("../game-logic.js");

// ---------- scoreGuess: the duplicate-letter gauntlet ----------
test("all exact", () => {
  assert.deepStrictEqual(L.scoreGuess("CRANE", "CRANE"), [
    "correct", "correct", "correct", "correct", "correct",
  ]);
});

test("all absent", () => {
  assert.deepStrictEqual(L.scoreGuess("CRANE", "MOIST"), [
    "absent", "absent", "absent", "absent", "absent",
  ]);
});

test("duplicate answer letters, guess repeats one (SPEED vs EERIE)", () => {
  // SPEED = S,P,E,E,D. guess EERIE = E,E,R,I,E. No positional matches.
  // pass1 leaves remaining S,P,E(2),D. pass2: guess has 3 E's but only 2 remain
  // in answer -> first two E's yellow, third E absent. Classic Wordle behavior.
  assert.deepStrictEqual(L.scoreGuess("SPEED", "EERIE"), [
    "present", "present", "absent", "absent", "absent",
  ]);
});

test("duplicate guess letters, single occurrence in answer (EERIE vs TENSE)", () => {
  // EERIE vs TENSE: pos1 E==E green, pos4 E==E green. T,N,S absent (E's consumed by greens).
  assert.deepStrictEqual(L.scoreGuess("EERIE", "TENSE"), [
    "absent", "correct", "absent", "absent", "correct",
  ]);
});

test("yellow consumed left-to-right (EERIE vs RIPER)", () => {
  // answer SONIC, guess CONSO? use standard: answer "GEESE" guess "SEISE"? keep documented case:
  // answer EERIE, guess RIPER: R(0) I(1) P(2) E(3) R(4)
  // pass1: none exact. remaining: E(0)E(1)R(2)I(3)E(4)
  // pass2: R present (consumes R), I present, P absent, E present, R absent (R consumed)
  assert.deepStrictEqual(L.scoreGuess("EERIE", "RIPER"), [
    "present", "present", "absent", "present", "absent",
  ]);
});

test("answer with 3 same letters, guess repeats two (EERIE vs ERASE)", () => {
  // answer EERIE, guess ERASE: E(0)R(1)A(2)S(3)E(4)
  // pass1: E(0)==E correct; E(4) vs E? answer[4]=E, guess[4]=E correct.
  // remaining: E(1),R,I
  // pass2: R present, A absent, S absent
  assert.deepStrictEqual(L.scoreGuess("EERIE", "ERASE"), [
    "correct", "present", "absent", "absent", "correct",
  ]);
});

// ---------- dayNumber / pickDailyWord ----------
test("dayNumber: epoch day is 0", () => {
  assert.strictEqual(L.dayNumber(new Date(2026, 10, 1)), 0);
  assert.strictEqual(L.dayNumber(new Date(2026, 10, 2)), 1);
  assert.strictEqual(L.dayNumber(new Date(2026, 9, 31)), -1);
});

test("pickDailyWord: same day same word, consecutive days consecutive entries", () => {
  const rot = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO"];
  assert.strictEqual(L.pickDailyWord(0, rot), "ALPHA");
  assert.strictEqual(L.pickDailyWord(1, rot), "BRAVO");
  assert.strictEqual(L.pickDailyWord(7, rot), "CHARLIE"); // 7 mod 5 = 2
  assert.strictEqual(L.pickDailyWord(-1, rot), "ECHO"); // negative day safe
});

test("rotation is a deterministic shuffle, not alphabetical", () => {
  const fs = require("fs");
  const vm = require("vm");
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("words-answers.js", "utf8"), ctx);
  const rot = vm.runInContext("ROTATION", ctx);
  const pool = vm.runInContext("WORDS_ANSWERS", ctx);
  assert.strictEqual(rot.length, pool.length);
  assert.notDeepStrictEqual(rot, [...rot].sort(), "rotation must not be alphabetical");
  assert.deepStrictEqual([...rot].sort(), [...pool].sort(), "rotation must be a permutation of the pool");
});

test("rotation order-stable when pool grows (content-addressed)", () => {
  // simulate: order by hash prefix; add a word; verify existing relative order kept
  const crypto = require("crypto");
  const SALT = "tricky-wordle-v1-rotation-salt";
  const order = (pool) =>
    [...pool].sort((a, b) =>
      crypto.createHash("sha256").update(SALT + a).digest("hex")
        .localeCompare(crypto.createHash("sha256").update(SALT + b).digest("hex"))
    );
  const before = order(["ALPHA", "BRAVO", "CHARLIE", "DELTA"]);
  const after = order(["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHIDNA"]);
  const filtered = after.filter((w) => before.includes(w));
  assert.deepStrictEqual(filtered, before, "relative order of existing words must be preserved");
});

// ---------- pickRandomWord ----------
test("free play: excludes recent, never empty", () => {
  const pool = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO"];
  const exclude = ["ALPHA", "BRAVO"];
  const stub = (max) => max - 1; // always last candidate
  const w = L.pickRandomWord(pool, exclude, stub);
  assert.ok(["CHARLIE", "DELTA", "ECHO"].includes(w));
});

test("free play: falls back to full pool if everything excluded", () => {
  const pool = ["ALPHA", "BRAVO"];
  const stub = (max) => 0;
  assert.strictEqual(L.pickRandomWord(pool, pool, stub), "ALPHA");
});

// ---------- hard mode ----------
test("hard mode: green letters pinned", () => {
  const v = [["correct", "absent", "correct", "absent", "absent"]];
  assert.ok(L.checkHardMode(v, ["CRANE"], "CRANK").ok);
  const r = L.checkHardMode(v, ["CRANE"], "AROMA");
  assert.ok(!r.ok, "first letter C must be pinned");
});

test("hard mode: present letters must be included", () => {
  const v = [["absent", "present", "absent", "absent", "absent"]];
  // SLATE has L at pos1 marked present; IRONS contains L? I-R-O-N-S: no L -> must fail.
  const r = L.checkHardMode(v, ["SLATE"], "IRONS");
  assert.ok(!r.ok, "must contain L");
  assert.ok(L.checkHardMode(v, ["SLATE"], "SOLAR").ok); // contains L
});

test("hard mode: missing present letter rejected", () => {
  const v = [["absent", "present", "absent", "absent", "absent"]];
  const r = L.checkHardMode(v, ["SLATE"], "CRONK");
  assert.ok(!r.ok, "must contain L");
});

// ---------- stats ----------
test("updateStats: win streak increments, loss resets", () => {
  const base = { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] };
  let s = L.updateStats(base, true, 4);
  s = L.updateStats(s, true, 3);
  assert.strictEqual(s.played, 2);
  assert.strictEqual(s.wins, 2);
  assert.strictEqual(s.streak, 2);
  assert.strictEqual(s.maxStreak, 2);
  assert.deepStrictEqual(s.dist, [0, 0, 1, 1, 0, 0]); // dist indexed by tries-1: 4th then 3rd
  s = L.updateStats(s, false, 6);
  assert.strictEqual(s.streak, 0);
  assert.strictEqual(s.maxStreak, 2);
  assert.strictEqual(s.played, 3);
  assert.strictEqual(s.wins, 2);
});

// ---------- share ----------
test("shareText format", () => {
  const grid = [
    ["absent", "present", "absent", "absent", "correct"],
    ["correct", "correct", "correct", "correct", "correct"],
  ];
  const t = L.shareText(42, true, 2, grid);
  assert.match(t, /^Tricky Wordle 42 2\/6\n/);
  assert.match(t, /\u{1F7E9}{5}/u);
});

test("shareText: loss shows X", () => {
  const grid = [Array(5).fill("absent")];
  const t = L.shareText(42, false, 6, grid);
  assert.match(t, /^Tricky Wordle 42 X\/6\n/);
});

// ---------- share variants ----------
test("shareTextWithGuesses: colored grid + words per row", () => {
  const grid = [
    ["absent", "present", "absent", "correct", "absent"],
    ["correct", "correct", "correct", "correct", "correct"],
  ];
  const t = L.shareTextWithGuesses(["STOIC", "EMAIL"], grid);
  const lines = t.split("\n");
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0], "\u2B1B\u{1F7E8}\u2B1B\u{1F7E9}\u2B1B STOIC");
  assert.strictEqual(lines[1], "\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E9} EMAIL");
});

test("shareTextReddit: colored grid + spoiler syntax per row", () => {
  const grid = [Array(5).fill("absent")];
  const t = L.shareTextReddit(["QUAIL"], grid);
  assert.strictEqual(t, "\u2B1B\u2B1B\u2B1B\u2B1B\u2B1B >!QUAIL!<");
  const grid2 = [
    ["absent", "present", "absent", "correct", "absent"],
    ["correct", "correct", "correct", "correct", "correct"],
  ];
  const t2 = L.shareTextReddit(["STOIC", "EMAIL"], grid2);
  const lines = t2.split("\n");
  assert.strictEqual(lines[0], "\u2B1B\u{1F7E8}\u2B1B\u{1F7E9}\u2B1B >!STOIC!<");
  assert.strictEqual(lines[1], "\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E9}\u{1F7E9} >!EMAIL!<");
});

test("classic shareText unchanged (emoji grid, no words)", () => {
  const grid = [["correct", "correct", "correct", "correct", "correct"]];
  const t = L.shareText(7, true, 1, grid);
  assert.match(t, /^Tricky Wordle 7 1\/6\n\u{1F7E9}{5}$/u);
});
