# Tricky Wordle

A Wordle-style daily word game where every answer comes from a curated pool of
**tricky-but-familiar** five-letter words: words you definitely know but that are
hard to conjure (EMAIL, EMOJI, WOMAN), plus vocabulary that gives you pause
without being esoteric (HAIKU, FUNGI, SATYR, KAPUT).

## Play

Open `index.html` — that's it. No backend, no build step, no dependencies.

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

## Development

```bash
# run the logic test suite
bash tests/run_tests.sh

# serve locally
python3 -m http.server 8000
# then open http://localhost:8000
```

## License

MIT
