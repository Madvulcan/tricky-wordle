# Tricky Wordle

A Wordle-style daily word game where every answer comes from a curated pool of
**tricky-but-familiar** five-letter words: words you definitely know but that are
hard to conjure (EMAIL, EMOJI, WOMAN), plus vocabulary that gives you pause
without being esoteric (HAIKU, FUNGI, SATYR, KAPUT).

## Play

**Live: https://trickywordle.madvulcan.net** (custom domain, HTTPS enforced).
Or open `index.html` directly — no backend, no build step, no dependencies.

- **Daily mode** — one word per calendar day (visitor-local midnight), same for
  everyone. Answers rotate through the full pool in a fixed hash-shuffled order,
  so the sequence looks random but never repeats within a cycle (~2.5 years for
  a 900-word pool).
- **Free play** — unlimited rounds, random answers, no immediate repeats.
- **Hard mode** — revealed hints must be reused.
- Stats, streaks, and the classic emoji-grid share button are included.

## Editing the word pool

`tools/pool.txt` is the source of truth: one uppercase 5-letter word per line.

After any edit, regenerate the data files:

```bash
python3 tools/gen_word_files.py
```

The script validates loudly (exits nonzero with a named error) if the pool
contains: wrong-length words, non-A–Z characters, duplicates, words that are
neither in the guess dictionary nor in `tools/guess-overrides.txt`, or plural
forms whose singular is also in the pool (warning only — humans decide).

Adding words is safe by construction: the daily rotation order is
content-addressed (`sha256(word + salt)`), so appending never re-orders
existing answers or breaks the schedule.

## Word sources

- Guess dictionary: [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list)
  (vendored as `tools/guess-dictionary.txt`).
- Curated answer pool: hand-built by Jesse + Vulcanis, calibrated against
  Google Books frequency data (Norvig's count_1w) for the "tricky but
  familiar" band.
- `PALEO`, `WISEN`, `FLOOF`, `YOINK` are deliberate modern-slang answers kept
  via `tools/guess-overrides.txt` despite not being in the guess dictionary.

## What makes this list different

Every word in this game lives in your vocabulary. That's the trap, and the
point.

Most "hard Wordle" clones reach for obscurity — words you'll meet once and
forget. This pool is built on a different discovery: the hardest words aren't
the rare ones. They're the *familiar* ones whose spelling fights your recall.
EMAIL. EMOJI. WOMAN. Words you type twenty times a day, but whose letters
refuse to assemble when a green square demands them. Psychologists call it the
curse of knowledge; Wordle players call it losing to a word a toddler knows.

So the curation works two seams at once. One: words that are genuinely
uncommon but instantly recognizable on reveal — HAIKU, FUNGI, SATYR, KAPUT —
the "oh yeah, *that* word" feeling, calibrated against frequency data so the
rarities never cross into esoterica. Two: everyday words with warped
architecture — W-opens (WOMAN, WEIRD), silent letters and Frankenstein
clusters (GNOME, PSALM, THIGH), vowels running wild (OZONE, EERIE, EMAIL),
loanwords wearing their native spelling (SAUNA, MATZO), and words you say
constantly but have never once seen written down (FLOOF, YOINK, WISEN).
Saying a word and spelling a word turn out to be different skills; this game
scores the gap.

Just as deliberate are the exclusions. No MAMMA-class trappery — difficulty by
doubled-letter ambush tests nothing but paranoia. And the pool quietly stages
vocabulary against itself: PITHY waits on one board, LITHE on another, so the
_ITH_ pattern you've learned betrays you the following week.

944 words. One a day. The full cycle takes two and a half years — by which
time, if the list has done its job, you'll have been humbled by every word you
already knew.

## Development

```bash
# run the logic test suite
bash tests/run_tests.sh

# serve locally
python3 -m http.server 8000
# then open http://localhost:8000
```

## Private stats dashboard

`dashboard.html` (noindex) shows aggregate play stats: solve rates, guess
distribution, hard-mode share, share usage, unique players per daily game, and
a per-word difficulty leaderboard. Backed by Supabase (free tier):

- The game fire-and-forget posts `visit` / `game_end` / `share*` events to the
  `tw_events` table. Failures are swallowed; analytics can never affect play.
- Visitor browsers hold only the publishable key — Row Level Security allows
  INSERT and blocks all reads.
- The dashboard page gates on a dashboard key (stored in localStorage after
  first entry) and reads aggregate-only data via the `tw_dashboard_stats` RPC.
  No row-level data ever leaves the database. No cookies, no fingerprinting.
- Connection details and operational gotchas live in the agent-side
  `tricky-wordle` skill; the dashboard key and Supabase project ref are in the
  Hermes skills store, not in this repo.

## License

MIT
