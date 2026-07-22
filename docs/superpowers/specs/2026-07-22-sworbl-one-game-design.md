# sworbl — the one-game redesign (design spec)

Status: designed with owner 2026-07-22, awaiting owner review of this written spec.
Supersedes the two-mode (stroll/sprint, casual/stacks) structure everywhere it conflicts.
Companion docs: `2026-07-21-app-redesign-scope.md` (living scope + backlog),
`../2026-07-21-ui-redesign-readiness.md` (code-readiness audit).
**Visual mocks (approved, in-repo):** `../mocks/2026-07-22-home-final-v18.html` (the home, both
states) · `../mocks/2026-07-22-storm-aurora-blocks-v11.html` (storm feel, blur slider) ·
`../mocks/2026-07-22-keyboard-swap-v15.html` (keyboard swap interaction).

## The game (all mechanics LOCKED)

> **sworbl:** one daily round. **5:00** on the themed board — spell words for points; the day's
> **6 theme words** bank as clue pills as you find them. At **0:00 the board morphs into the A–Z
> keyboard**: **6 guesses**, Wordle-colored, to crack the word of the day. Solve it or don't —
> that was your shot. See you tomorrow.

- **One round per day.** Wordle-style stakes. No replays of the daily (practice mode is the outlet).
- **Round length: 5:00**, a config knob (dev menu), not hardcoded.
- **Clues: exactly 6 per day.** The generator pool stays ~10–15 words; the seeder places exactly 6
  (it already proves ≥6 fit — take the first 6 that pack). "6 to find, 6 to crack it."
- **Finale:** at 0:00 the gameplay board morphs into the built A–Z tile keyboard (reuse the
  stepper/board-morph machinery). 6 guess attempts; after each miss the guess blocks color
  green/yellow/gray via `SworbleDaily.scoreGuess` (built + tested). Solving ends the finale with the
  candy reveal + bonus; missing all 6 reveals the word in GRAY.
- **No guessing during the round** — the hunt and the finale are separate acts.
- **Score: cumulative** (decision A, already implemented): best pts per distinct word, uncapped.
  Solve bonus added on top at the finale (tier by guesses used; exact bonus values tuned in build).
- **Rank: solved first, score second.** One leaderboard. A lower-scoring solver ranks above a
  higher-scoring non-solver.
- **Practice:** random board, no daily stakes; keeps the current practice flow (timed like the real
  round so it teaches the rhythm — final behavior tunable).
- Determinism unchanged: board, theme words, and sworb all derive from `dailyKey` seeds.

## The home (v18 — LOCKED, mock is authoritative)

ONE page (no pager, no mode picker), two states sharing an IDENTICAL skeleton so nothing shifts:

**Skeleton (top → bottom):** iOS-normal nav (profile · logo-tile+wordmark · settings) →
**word-of-the-day blocks straight at the top** (NO date line, NO "daily puzzle" copy, NO divider) → **clue fan** (4 pills top row / 2 bottom row) →
**progress-to-top link-bar** → **top-5 best-words strip** → **standings x/y graph** (NO section
title — it flows directly) → storm + dock.

- **Before play:** dashed empty word blocks; 6 dashed ghost pill slots (4/2); link-bar dormant
  (gray `0 pts`, fully dashed path, dashed block at the start, `▲ 1,480 to overtake maya · 0%`);
  standings graph live with today's field; storm brewing full-color; dock = animated chevron +
  Fredoka **"swipe up to play"**.
- **After play (solved):** word revealed as **candy gameplay tiles** (per-letter PALETTE color +
  ledge, ink `#1F1442`); found clues as candy pills + remaining ghosts; link-bar alive (big Fredoka
  `1,240 pts`, crown + `1,480` + leader name right — NO "TOP·" prefix, NO chase line, NO
  percentage; glowing violet **link-line** drawn proportionally over the dashed path, **dashed
  block riding the head** — fills candy violet with ledge only when you ACTUALLY beat the top
  (`hit` state)); **superlatives**: top-5 best words as candy word-blocks (word + small pts) in a CENTERED
  2-row wrap under a ghosted left label (pre-play: 5 dashed ghost blocks, same layout); YOU ringed violet on the
  graph with your mint ✓; storm **dim/desaturated** (it did its job); dock = countdown timer ONLY
  (`14:32:11`, Fredoka violet — no label).
- **After play (not solved):** identical, except the word reveals in **GRAY blocks** (candy colors
  are earned by solving) and no ✓ on your graph node.
- **Standings = the rank constellation (NO x/y axes — dropped; they confused players):**
  ember-trail segments in player colors connecting candy rank blocks (auras/bob) that ascend to
  #1 at top-right, rank badges, crown + confetti on #1, YOU ring `#8971FF`. NEW: a **mint ✓ mini-tile**
  (`#5FD6A8`/`#38AD7F`) on the block corner = cracked the word; rank order puts solvers first.
- **Floating-block background:** PALETTE-colored ghost tiles, heavy at the edges, sparse+dimmer in
  the middle.
- **Word-light rule:** no counts ("3/7"), no "solved" caption, no stakes copy, no share button (for
  now), no "next sworbl in" label. The blocks, pills, ✓s, bar, and timer carry the meaning.
- **Home keyboard = the finale, continued (LOCKED 2026-07-22):** on a FINALE-PENDING day only
  (round played, sworb unsolved, guesses left), tapping the word-of-the-day blur-replaces
  everything below the hints with the A–Z guess keyboard (v15 swap, zero height change). Fresh
  day: tap does nothing (play first). Day done: nothing. Guessing never exists before the round.
- **Superlatives = the safe:** the sworb-safe row is gone; tapping the superlatives cluster opens
  the word bank ("superlatives safe").

## The storm (LOCKED)

**Aurora-of-blocks:** candy tile-blocks (PALETTE colors) drifting as metaball goo — they meet,
**bridge with a liquid neck, and split** (the linking gesture abstracted) — blurred ~12px into
flowing northern-lights light. **Bell curve across the full width**: small/low blocks hugging BOTH
edges, big/high-rising in the center under the chevron. Rises from below, mask-faded up and to the
sides — no seam. Long staggered ease durations (15–23s), never synchronized, no rotation-jank.
**No lightning.** States: **brewing** (full color, pre-play) → **resting** (opacity ~.4,
desaturated, post-play). Future (in-game): may intensify as the round clock runs down.

## In-game deltas (the round)

- Clock: 5:00 countdown (reuse the timed-mode engine; words no longer add time — pure countdown —
  UNLESS tuning shows time-adds are needed; default OFF for the daily round).
- The 4th HUD cell shows TIME (already built for the timed mode).
- Clue finds: same glow/pill/banking (shared safe), displayed as the fan; exactly 6 exist.
- Bombs: OFF for the daily round (they were the old arcade mode's spice; revisit post-launch).
- At 0:00: no "round over" sheet — the board MORPHS into the finale (the built board→keyboard
  crossfade), guess blocks above, 6 pips. Solve → candy celebration → home (after-state). Fail all
  6 → gray reveal → home.
- **Count-in + pause (LOCKED 2026-07-22, supersedes wall-anchored-no-pause):** every round starts
  with a 3·2·1 count-in (clock anchors only after it). Pause allowed: button + AUTO-pause on
  visibility/pagehide/blur; while paused the clock freezes AND the board blurs (no free scanning);
  resume replays the count-in. Reload mid-round resumes with remaining time, paused. The WARMUP
  (`tut`) flow is REMOVED (onboarding = the future tutorial). One shot: the DAY is consumed when
  the finale resolves (or time+guesses exhaust).

## Cross-cutting UX requirements (apply to every screen, this build and after)

1. **Everything animates from the start.** Entrance stagger on all sections; every transition
   (state swap, storm recolor, graph updates) is animated — never a hard cut.
2. **Zero-jank loading.** Skeletons at exact final sizes; refresh must not shift anything (the
   shared before/after skeleton is designed for this).
3. **In-place content swaps** (no height changes) for any panel that exchanges content — the
   keyboard-swap pattern (mock v15) is the reference.
4. **Nav bar: iOS-normal.**
5. **Stepper swap icon:** refresh-without-circle glyph; spins on state swap.
6. Storm colors/energy always TRANSITION smoothly (animate the drive variable, never snap).

## Explicitly OUT of this build (backlogged in the scope doc)

Settings/results as full screens · interactive tutorial (gated link gesture, sets default) ·
profile rework (pencil-graph stats) · invite feature · on-device stats/badges · word-definition
reveal after solve (owner likes it — later) · backend leaderboards (stub stays) · internal
`sworble*/stackl*` identifier rename (visible text only for now).

## Migration notes (from the two-mode build)

- Mode picker, `armedMode`, per-mode pages, stroll/sprint naming: REMOVED (never shipped).
- `stacklOn()` timed machinery: REUSED as the daily round's clock (retimed 120s→300s knob).
- Shared sworb safe/guesses plumbing: SIMPLIFIED — one round means clue banking + guesses live
  within the day's single run (persist per `dailyKey` so reload-resume works).
- STACKL_BEST/|stackl leaderboard partition: RETIRED (one board).
- Old "5 guesses/day anytime" model: dead; guesses live only in the finale (6).
- No player-data migration needed (pre-release).

## Self-review notes

- Ambiguities intentionally deferred to build with owner sign-off at review: solve-bonus values
  per guesses-used; practice timed-vs-untimed default; whether the round clock pauses on
  background/app-switch (recommend: no pause — wall-anchored, matches one-shot stakes).
- Consistency check: 6 clues (fan 4/2) ↔ seeder places exactly 6 ↔ "6 to find, 6 to crack";
  home has NO guess entry ↔ finale-only guessing; countdown dock ↔ one-shot/day. ✓
