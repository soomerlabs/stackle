# Word of the Day — daily reframe (Phase 1)

Status: approved design, prototype scope (GitHub Pages, no backend).
Date: 2026-07-20.

> **Part of a 3-phase pivot** away from the "Sworble Seven" scoring run toward two audiences:
> a casual themed **Word of the Day** and a timed **Stackle** arcade mode. This spec covers
> **Phase 1 only** (the daily reframe). Phase 2 (Stackle timed mode) and Phase 3 (two-section
> home + two leaderboards) are separate specs and are **out of scope** here.

## Summary

Reframe the daily from a capped, "seven"-scored run into an **endless, theme-first word hunt**.
Each day has a hidden **sworb** (theme word) and a **pool of curated theme words** seeded onto the
board (densely interwoven via the letter-sharing engine). You find words freely, all day, with no
cap. Theme words **glow, pay a +50% bonus, and tick a counter**; the glowing words reveal the theme,
which you guess Wordle-style with the board-morph keyboard. Ranking is about **cracking the theme**
(solving the sworb early + theme words found), not raw volume. Ordinary word-finding stays fun (all
words score) but is a personal stat, not the competitive metric.

This builds directly on already-shipped work: the sworb guess UI (board-morph keyboard, tap-to-flip
stepper, Wordle-persistence), the `SworbleDaily` module (`parseEntry`/`isClue`/`checkGuess`/
`guessReward`/`scoreGuess`), the clue glow/counter/fan, the daily-status selector, and the
crossword letter-sharing seeder (`sworble-seed.js`).

## Confirmed design decisions (from brainstorm 2026-07-20)

- **Theme scope:** "whole board themed" in its achievable form — a **theme-dense** board. Incidental
  short words are always findable and can't be prevented; instead we pack *many* interlocked theme
  words so the glowing theme words dominate what you notice.
- **Daily leaderboard:** **theme-first** — rank by sworb solved + how early (the guess-reward tier),
  then theme words found as the tiebreak. Not by total points.
- **Density:** the theme-word count is a **dev-configurable target N** over a per-day content pool;
  ships with a fixed default (~10) after playtesting.
- **Lifecycle:** **endless** — no cap, no timer, no auto-end; persistent all-day session, resets at
  the next daily.
- **Points:** still exist (all words score, with multipliers) but demoted to a **personal stat**,
  not the rank.

## Core loop

- Open today's themed board (deterministic, seeded).
- Spell any real words for points, all day, no budget. Multipliers/streaks as today.
- Spelling one of the day's **theme words** lights it (glow), pays **+50%**, and ticks `X / N`.
- At any time, spend one of **3 sworb guesses** to name the theme (board-morph keyboard). The
  correct-guess bonus scales **inversely with theme words found** (cold read = jackpot). A wrong
  guess burns one; running out locks the sworb unsolved; a correct guess locks it solved.
- Nothing ends the run. You leave and resume; the day resets at the next daily.

## Components (grounded in the current code)

### 1. Content: `dailies.json` (shape change)

```json
{
  "2026-07-20": {
    "sworb": "ocean",
    "themeWords": ["tide","coral","wave","reef","salt","shore","kelp","surf","foam","brine","lagoon","pearl","shell","abyss","current","depth","swell","spray"]
  }
}
```

- `themeWords` is a **pool** (~15–20 curated candidates), not exactly 5. All lowercase, in
  `dictionary.txt`, seedable. Length mix is still the difficulty lever.
- The seeder packs **up to N** of them (see §3); the rest of the pool goes unused that day (still
  fine as future decoy-fill candidates).
- `SworbleDaily.parseEntry` relaxes: accept `themeWords` (array of ≥1 lowercase words, no hard cap
  of 5) and keep back-compat with the old `clues` key (treat as the pool). Malformed → null
  (fall back to a plain, un-themed daily).

### 2. Theme-word density knob (dev menu)

- A new dev setting `themeTarget` (integer, default 10) in the existing dev-flags pattern
  (`opts`, alongside `debugBest`/`tilePoints`/…). Rendered as a small stepper in the dev panel.
- `newGame()`'s seeding passes `themeWords.slice(0, themeTarget)` to `seedClueLetters`; the seeder
  packs as many as fit via letter-sharing (deterministic; reseeds across attempts on failure, as
  today). The realized set (what actually placed + verified findable) becomes the day's theme set.
- **Determinism:** identical `(day seed, themeTarget)` → identical board for everyone. The knob is
  dev-only; production uses a fixed `themeTarget`, so the daily stays identical across devices.

### 3. Seeding (reuse, scaled)

- `SworbleSeed.seedClueLetters` already places N interwoven words and returns `{ letters, cluePaths }`.
  No engine change — just called with more words. Findability is verified per word
  (`SworbleSolver.findWord`) with deterministic reseeds, exactly as today.
- The realized theme set (the words that placed + verified) is stored so status/scoring use the
  **actual** count, not the requested target (a day may pack fewer than N).

### 4. Scoring, state, and the daily-status selector

- **Word commit:** unchanged for points; on a theme-word match, apply +50% and record the find
  (extends the existing `FOUND_PREFIX` tracking). No budget decrement (the budget is gone).
- **Remove the word budget:** delete the puzzle-mode `guessesLeft`/`parGuesses` word-cap gate and
  the `dailyDone`-on-budget-spent path. The daily is "done for now" only in the sense that you can
  stop; it never locks until the next day.
- **`sworble-status.js`** gains/updates a theme-first daily result: `sworb` block already reports
  `foundCount`/`total`/`solved`/`guessesLeft`; add the **theme total = realized theme set size**
  (not a hardcoded 5) and a **rank basis** = `{ solved, solveTier (guessReward tier at solve time),
  themeFound }`. One selector, every surface reads it (the rule that fixed earlier display bugs).
- **Leaderboard/standings** ranking swaps from the seven-total to the theme-first basis. (The
  standings *screen* itself is largely Phase 3; Phase 1 changes what the daily contributes + how
  it's ranked, and stops computing/showing the seven.)

### 5. Surfaces (Phase-1 slice)

- **In-game:** theme-word glow + `X / N` counter + the clue-fan (already built) scale to N; the
  removed WORDS stat cell stays removed. The board-morph sworb guess UI is unchanged.
- **Home:** the daily card shows **theme progress + sworb** (mostly built). The **"seven" hero,
  its 56px total, hero-word, and the listA/listB pills are removed.** Full two-section home is
  Phase 3; Phase 1 only removes the seven and surfaces theme+sworb.
- **Result/recap:** replace the seven recap with a theme recap (theme words found / total, the
  sworb reveal + bonus). Keep it minimal in Phase 1.

## Determinism & persistence

- Everything stays a function of `(day seed, move sequence, themeTarget)`. Theme-find tracking
  extends `FOUND_PREFIX`; the sworb state blob (`SWORB_PREFIX`) is unchanged. The endless session
  persists the run per day via the existing run-save path; resuming re-hydrates it.
- Server replay-verification still holds (bonuses/scaling are deterministic from board + content).

## Out of scope (this phase)

- **Stackle** timed mode, its board, timer, replay, and leaderboard (Phase 2).
- **Two-section home** + navigation + the two distinct leaderboard screens (Phase 3).
- Authoring the full ~30-day `themeWords` content (a content task; Phase 1 ships a few sample days
  + relaxes the schema + a guardrail test).
- Answer obfuscation; any backend endpoint (static JSON only).

## Build order (highest-risk first)

1. **Content schema + `parseEntry`** (pool of theme words, back-compat, guardrail test) — cheap,
   unblocks everything.
2. **Density knob + seeding** (dev `themeTarget`, seed `themeWords.slice(0,N)`, store the realized
   set) — verify N words pack + all findable + deterministic.
3. **Remove the budget + endless lifecycle** — delete the word-cap/`dailyDone`-on-budget gates;
   confirm play never auto-ends and resumes cleanly.
4. **Theme-first status + scoring** (selector theme total + rank basis; +50% on theme words; drop
   the seven computation).
5. **Surfaces** (in-game counter/glow/fan to N; home shows theme+sworb, seven hero removed; minimal
   theme recap).
6. **Browser-verify** the full loop across a couple of days; commit.

## Notes for the implementer

- The **"seven" removal** touches home (`homeSeven`), the result recap, and the standings ranking.
  Remove the seven *computation* and *display* in Phase 1; the standings screen's fuller rework is
  Phase 3 — keep Phase-1 changes surgical (stop showing/ranking by the seven; show theme+sworb).
- The **word budget** in puzzle mode currently doubles as the run's end condition. Removing it means
  the daily needs a new "is there a live run" notion — reuse the existing run-save/resume; "done"
  becomes "not currently playing," never a hard lock, until the next daily.
- Keep the **dev knob dev-only**; never let it leak into the production daily seed (fixed default).
- All new/changed pure logic (parse, status theme total, rank basis) gets Node tests in the house
  style; determinism surfaces get pinned known-value tests.
