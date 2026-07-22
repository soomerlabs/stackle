# Sworble daily content — AI generation prompt

Reusable prompt for generating `dailies.json` entries. Paste the block below (between the
`BEGIN PROMPT` / `END PROMPT` markers) into any capable AI, filling in the three bracketed
parameters at the top. The output is designed to pass the guardrail (`node tests/dailies-check.js`)
on the first try when the hard rules are followed exactly.

This doc also covers the validation loop and the timezone/runway rule for scheduling when content
must be authored by. Keep this file in sync with `tests/dailies-check.js` and
`.git/sdd/content-engine-report.md` — if the guardrail rules change, update the prompt below to match.

---

## BEGIN PROMPT

You are generating daily content for **Sworble**, a word game. Players spend 7 minutes hunting
theme words hidden on a letter board, then must guess the day's secret word — the "sworb" — using
those theme words as clues.

Generate **[N] days** of content starting **[START_DATE]** (format `YYYY-MM-DD`, one entry per
consecutive calendar day). Avoid reusing any word (sworb or theme word) from this recent-days list:
**[RECENT_WORDS — paste the sworb + themeWords from the last ~10-14 shipped days here]**.

### Output format

Return **only** a single JSON object, lowercase, no trailing commas, no comments, no markdown
fences — just the raw JSON, shaped exactly like this:

```json
{
  "YYYY-MM-DD": {
    "sworb": "ocean",
    "themeWords": ["tide", "coral", "wave", "reef", "salt", "shore", "kelp", "surf", "foam", "brine", "pearl", "shell", "swell", "spray", "abyss"],
    "definition": "the vast body of salt water that covers most of the earth"
  },
  "YYYY-MM-DD": {
    "sworb": "...",
    "themeWords": ["...", "..."]
  }
}
```

One top-level key per day, keys in ascending date order. **Every day includes a `definition`** —
one clean, dictionary-style sentence for the sworb (lowercase, no leading article fuss, ≤14 words,
elegant not clinical: it's shown to the player as the day's payoff — "word of the day" style).

### HARD RULES (guardrail-enforced — `node tests/dailies-check.js` fails the whole day if any is violated)

1. **Sworb length: 5-7 letters.** The sworb must be a real dictionary word, 5-7 letters.
   7-letter sworbs are ENCOURAGED — the answer is where a big word earns its drama (`kitchen` is
   the canonical example). 4-letter answers are banned: too slight for the daily climax.
2. **The sworb is NOT one of the theme words.** It must not appear anywhere in `themeWords`.
3. **Theme word length: 4-7 letters each** (no 3-letter words). **At most TWO 7-letter theme
   words per day** (guardrail-enforced): sevens are the rare "stretcher" clues — a trophy find,
   not the norm. Engine-measured: pools with 1-3 sevens still pack the board's exactly-6 at
   ~100%, so a stretcher never risks the day.
4. **Pool size: 10-15 theme words** per day.
5. **Every word — sworb and all theme words — must be a real, common English dictionary word.**
   No proper nouns (no names/brands/places), no abbreviations, no hyphenated words, no
   plural-spam (don't pad the pool with `cat`/`cats`/`cattle`-style near-duplicates or a string of
   trivial plurals of words already in the pool).
6. **No prefix-pairs, anywhere in the day's pool — INCLUDING the sworb.** No word (theme word or
   sworb) may be a strict prefix of another word in the same day's pool. Example violations:
   `seed` + `seeds`, `trim` + `trims`, `plate` + `plated`, or a sworb like `barn` if `barns` (or
   `barnyard`) is also a theme word that day. Check every pair, not just adjacent ones.
7. **No duplicate words within a day's pool** (sworb + theme words all distinct).
8. **Thematic coherence:** all theme words belong to one clear category, and the sworb is the
   category's centerpiece/answer — not just another member of the category. The theme words should
   let a player *deduce* the sworb; they are clues TO it, not a random bag of same-topic words.

### SOFT GUIDANCE (quality bar, not guardrail-enforced — but strongly preferred)

- **Length mix per ~12-13-word pool:** skew short — roughly **4-5 four-letter, 5-6 five-letter,
  2-4 six-letter** words. This packs the board with margin and reads well. Don't load a pool with
  mostly six-letter words.
- **The sworb should be the theme's centerpiece, not a random member.** E.g. for an "ocean" theme,
  `ocean` itself (or a strong synonym like `sea`... too short — use something like `ocean`/`tides`-
  adjacent) is the right answer; a random ocean-adjacent word like `kelp` would be a weak sworb
  because it's just one more clue, not the thing the clues are pointing at.
- **Difficulty mix:** include a few "gimme" theme words (obvious, high-frequency) and a few
  "stretcher" words (still common, but less obvious) so solving feels like a real hunt, not a
  cakewalk or a slog.
- **Avoid words already used in recent days** (see the recent-days list you were given above) —
  keep the word pool feeling fresh across the week.
- **Prefer letter overlap within a theme** — pools whose words share common letters pack onto the
  board faster and more reliably.

### QUALITY BAR — few-shot examples of shipped, guardrail-passing days

```json
"2026-07-20": {
  "sworb": "ocean",
  "themeWords": ["tide", "coral", "wave", "reef", "salt", "shore", "kelp", "surf", "foam", "brine", "pearl", "shell", "swell", "spray", "abyss"],
    "definition": "the vast body of salt water that covers most of the earth"
},
"2026-07-21": {
  "sworb": "galley",
  "themeWords": ["oven", "fork", "tray", "dish", "spoon", "plate", "knife", "bowl", "whisk", "ladle", "kettle", "mixer", "stove", "grill", "sink"]
},
"2026-07-22": {
  "sworb": "bloom",
  "themeWords": ["rose", "seed", "stem", "leaf", "soil", "vine", "petal", "root", "thorn", "fern", "moss", "weed", "sprout"]
}
```

Notice: every word is common, no proper nouns, no plurals stacked on singulars of the same root, no
word is a prefix of another in its day, lengths skew 4-5 with a handful of 6s, and each sworb is the
clear centerpiece of its theme (the ocean, the ship's kitchen, a flower blooming) rather than just
another item from the category.

Generate the [N] days now, following every hard rule exactly, and return only the JSON object.

## END PROMPT

---

## The validation loop (mandatory before shipping any generated content)

1. Paste the AI's JSON output into `dailies.json`, merging with the existing top-level object
   (do not delete existing days).
2. Run:
   ```
   node tests/dailies-check.js
   ```
3. **Any `FAIL` names the exact day and the exact rule it broke** (e.g. sworb not in dictionary,
   theme word wrong length, pool out of range, a specific prefix-pair, or a day that can't lock a
   clean 6 on the board). Fix that day's content and re-run.
4. Repeat until it prints `dailies-check: N days valid ...` with zero failures.
5. Run the full suite once before committing:
   ```
   npm test
   ```
6. **Never ship (commit/deploy) unvalidated content.** A day that hasn't passed
   `tests/dailies-check.js` in the same session as your edit is not done.

## Timezone rule: author at least 2 days ahead of UTC+14

The site must always have a valid day of content for every player, in every timezone, at every
moment. The furthest-ahead timezone on Earth is **UTC+14** (e.g. Kiritimati/Line Islands) — it
enters a new calendar day before anywhere else on the planet, and it's also the timezone where a
given calendar date's window *ends* soonest relative to UTC.

**Rule of thumb: `dailies.json` must always contain valid, guardrail-passed content for at least 2
calendar days beyond "today" in UTC+14.** In practice this means: whenever you're generating content,
generate several days further out than you think you need — don't top off the runway to exactly
tomorrow. Running low on runway (fewer than 2 days of validated content ahead of the UTC+14 date) is
the trigger to generate more, well before players in the earliest timezones could ever see a missing
or stale day.

If a runway monitor/alert is wired into deploy or CI, it should be checking exactly this: the latest
date key in `dailies.json`, compared against "today in UTC+14" + 2 days, failing/alerting if the
runway is shorter than that.
