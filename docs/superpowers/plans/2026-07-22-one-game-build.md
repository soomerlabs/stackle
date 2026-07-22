# sworbl One-Game Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the two-mode build into THE one game — one 5:00 daily round (dev-knob) that ends in
a forced board-morph finale (6 Wordle-colored guesses) — and rebuild the home to the approved v18
design with the aurora-of-blocks storm.

**Architecture:** All UI/logic in the `index.html` monolith (mirrored to `Sworble.dc.html`); pure
modules (`sworble-status.js`, `sworble-seed.js`, `sworble-daily.js`) with Node tests carry the
testable logic. The build is RECOMPOSITION: the timed clock, board-morph keyboard, clue banking,
`scoreGuess`, and cumulative scoring all exist — tasks rewire when they happen and rebuild the
home surface.

**Tech Stack:** vanilla ES5-ish JS, dc-template runtime, `node:assert` tests, `npm test`.

**Authoritative design:** `docs/superpowers/specs/2026-07-22-sworbl-one-game-design.md`.
**Authoritative visuals:** `docs/superpowers/mocks/2026-07-22-home-final-v18.html` (home, both
states — its CSS values ARE the spec) · `2026-07-22-storm-aurora-blocks-v11.html` (storm).

## Global Constraints

- **Mirror after every index.html edit:** `cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html`
  (`tests/mirror-check.js` enforces). Never hand-edit the mirror.
- **Template rule:** every `{{ binding }}` referenced must be defined in ALL states; deleting a
  surface removes template + render-val keys together.
- **Determinism:** board/theme/sworb derive only from `hashSeed(dailyKey)` seeds. No `Math.random`
  in daily paths.
- **Immutability, small functions, no silent errors** (repo rules).
- **Word-light UI:** no counts, no captions beyond what v18 shows. The mock is authoritative.
- **Animate everything; zero-jank:** entrance staggers on home sections; state changes transition;
  skeleton = the shared before/after skeleton (nothing may shift on refresh/state change).
- **Internal identifiers stay** `sworble*/stackl*` (visible text only says sworbl).
- Line anchors below were verified 2026-07-22 post-cleanup; re-grep before editing.

---

### Task 1: Round clock — the daily IS timed, length from the dev menu

**Files:** Modify `index.html` (`roundSecs()` 1327; frame-clock gate ~2560 (grep `9999`);
`_startDaily` 5654-5668; `newGame` timeLeft init (grep `timeLeft: this.optVal('gameSeconds'`,
~4950 + game-start path); dev menu stepper — clone the `themeTarget` stepper block 732-734 +
`themeTargetDec/Inc/Label` render-vals ~6333). Mirror. Test: browser (no pure module touched).

**Interfaces:** Produces `roundSecs() -> int` (dev knob `roundSecs`, default **300**, clamp
30–900, step ±30) used by every daily-round path. The daily round now COUNTS DOWN (no more pinned
9999); reaching 0 still calls the existing `endRound()` (Task 3 re-targets it to the finale).

- [ ] Step 1: `roundSecs()` → `{ const n = Math.round(this.optVal('roundSecs', 300)); return Math.max(30, Math.min(900, isFinite(n) ? n : 300)); }`
  (delete the `stacklOn() ? 120 : 180` form). Grep `roundSecs` for all callers; they inherit it.
- [ ] Step 2: un-pin the daily clock. Grep `9999`: the frame-clock ternary that pins casual's
  `timeLeft` must count down for the daily too (the `stacklOn()` special-case becomes the ONLY
  path — daily and practice both count down). Set `timeLeft: this.roundSecs()` at round start
  (grep the `timeLeft:` inits in `newGame`/`_startDaily`/`_exitGame` ~4950).
- [ ] Step 3: dev menu "ROUND TIME" stepper: copy the themeTarget stepper markup (732-734) with
  `roundSecsDec/roundSecsInc/roundSecsLabel`; render-vals call
  `this.bumpOpt('roundSecs', ±30, 30, 900, 300)`; label formats `M:SS`.
- [ ] Step 4: the ≤60s low-time warning + TIME HUD cell (built for stackl) must fire for the daily
  round — grep `stacklOn()` in `frame()`/`timeHudLabel`/`timeText` and widen those gates to the
  daily round (see Task 4's mode collapse; here just make TIME show while a daily round runs).
- [ ] Step 5: mirror + `npm test` green + browser: dev knob at 0:30 → round ends in 30s; default
  300 shows 5:00; TIME HUD counts down. Commit `feat: daily round is timed — roundSecs dev knob (default 5:00)`.

### Task 2: Exactly 6 clues per day

**Files:** Modify `index.html` (theme seed block 2112-2128; `themeTarget()` 1754 default 8→leave
knob but clamp realized; `dailyEntry` themeWords 1746). Modify `tests/dailies-check.js` (assert
exactly 6). Mirror.

**Interfaces:** Produces: realized theme set is EXACTLY 6 words/day, persisted to
`TARGETS_PREFIX` (unchanged shape). `dailyStatus().sworb.total === 6`.

- [ ] Step 1 (test first): `tests/dailies-check.js` — for each day, simulate the seed (it already
  drives SworbleSeed deterministically) and assert `realized.length === 6` (was ≥6 guardrail).
  Run → FAIL (currently packs up to themeTarget=8).
- [ ] Step 2: two-pass seed in the theme block (~2117): pass 1 best-effort with the candidate list
  (unchanged); take `first6 = realized.slice(0, 6)`; pass 2 re-run `seedClueLettersBestEffort`
  with `clues: first6` on a FRESH rng of the same seed — the final board stamps ONLY those 6.
  Persist those 6 as targets. (Two-pass keeps determinism: same seed → same candidates → same 6.)
- [ ] Step 3: run dailies-check → PASS for both content days. mirror + `npm test` green +
  browser: exactly 6 ghost slots' worth of theme words findable, fan shows 6. Commit
  `feat: exactly 6 clues per day (6 to find, 6 to crack)`.

### Task 3: The finale — 0:00 morphs the board; 6 guesses; finale-only guessing

**Files:** Modify `index.html` (`endRound()` 2434; `guessSworb` 1764 (cap 5→6 — grep the `5`
literals tied to sworb guesses); `flipStepper` 1816 (block during round); `sworbSubmit` 1881;
home-guess removal: `openSworbHome`/`homeKbShow`/home keyboard template ~407-413 — delete
template + vals together). Modify `sworble-status.js` (guessesLeft 6). Test:
`tests/sworble-status.test.js`. Mirror.

**Interfaces:** Produces state `finale: true` while the finale is live. `dailyStatus().sworb`
reports `guessesLeft = 6 - used`. Consumes Task 1's countdown reaching 0.

- [ ] Step 1 (test first): sworble-status test — `guessesLeft` computes from 6 (e.g. used 2 → 4);
  run → FAIL. Fix `sworble-status.js` (grep `5 -`). PASS.
- [ ] Step 2: bump `guessSworb`'s cap to 6 (grep `>= 5` / `5 - used` in index.html).
- [ ] Step 3: finale entry — in `endRound()`, when a DAILY round hits 0:00 and the sworb is
  unsolved: do NOT show the over sheet; `setState({ finale: true, stepperMode: 'sworb',
  sworbTyping: true, ... })` → the existing board-morph renders the A–Z keyboard with the guess
  blocks. Keep endRound's banking (best/persist) intact before the morph.
- [ ] Step 4: finale exit — in `sworbSubmit`'s resolve paths (1893 solve / 1899 spent): when
  `finale`, on solve → candy celebrate → `screen:'home'`; on 6th miss → gray-reveal beat →
  `screen:'home'`. Clear `finale`.
- [ ] Step 5: finale-only guessing — `flipStepper` (1816) and any sworb-face entry: while a daily
  round is LIVE (not finale), the sworb flip is disabled (stepper stays on play face; keep the
  flip for practice/dev via `debugMine`-style gate if trivial, else fully disabled). DELETE the
  home guess entry: `openSworbHome`, `homeKbShow`, `sworbKb.homeGridStyle` home usage + template
  block (~407-413) — grep each key to zero.
- [ ] Step 6: mirror + `npm test` + browser (knob 0:30): round → 0:00 → board morphs (no over
  sheet) → wrong guesses color blocks, 6 pips → solve lands bonus → home. Fail-path: 6 misses →
  gray reveal → home. Commit `feat: the finale — 0:00 board-morph, 6 Wordle-colored guesses, finale-only guessing`.

### Task 4: One-shot day + single leaderboard + mode collapse

**Files:** Modify `index.html` (retire mode picker/armed: template 380-393, `armCasual/armStackl/
launchArmed/modePicker` vals, `startStackl` 5687, gesture 5812 → always `_startDaily`;
`stacklOn()` 1319 callers — grep all ~20: the "timed round" behaviors fold into the daily (keep
the internal `stacklMode` state unused-false or excise where trivial); DONE gating: `_startDaily`
blocks when the day is consumed (finale resolved) → home after-state; `lbBoardId/lbMode` drop the
`|stackl` branch; `lbStub`/`homeLeadersVals` sort **solved-first, score-second** and expose a
`solved` flag per entry (stub: seed-derived bool; you: `dailyStatus().sworb.solved`)). Modify
`sworble-status.js` `rankFor` → solved-first comparator. Test: status test pins the comparator.
Mirror.

**Interfaces:** Produces: `rankFor(entries, me)` ranks `{score, solved}` solved-first;
`homeLeadersVals` entries carry `solved`. Day states: `fresh` (playable) / `live` (resume run or
finale) / `done` (after-state). No `armedMode`, no picker, one leaderboard partition.

- [ ] Step 1 (test first): status test — field `[{s:1480,solved:1},{s:1360,solved:0},{s:1240,solved:1}]`
  → ranks 1,3,2. FAIL → implement comparator in `rankFor`. PASS.
- [ ] Step 2: delete picker/armed/startStackl (template + vals + gesture branch → `_startDaily`).
- [ ] Step 3: day-consumed gating — persist a `FINALE_DONE` marker (reuse `DONE_PREFIX`) when the
  finale resolves; `_startDaily` on a done day stays home (after-state). Reload mid-round resumes
  the run (existing RUN_PREFIX snapshot — now saved for the timed daily too: grep the
  `clearRunState`/save gates from the foundation work and keep the daily saving).
- [ ] Step 4: single board — `lbBoardId()`/`lbMode()` lose the stackl branch; retire
  `STACKL_BEST_PREFIX` reads/writes (grep) + the stackl LB stub (`lbStubStackl`, `loadStacklLb`).
- [ ] Step 5: mirror + `npm test` + browser: no picker; swipe-up always starts THE round; played
  day can't restart; standings order puts solvers first. Commit
  `feat: one-shot day, single solved-first leaderboard, mode collapse`.

### Task 5: Home v18 rebuild

**Files:** Modify `index.html` home template (360-480 region: keep nav; header becomes ONE subtitle
line `TUESDAY JULY 21 · Nº 214` (big date + "daily puzzle" copy REMOVED) + divider; REBUILD the
body to v18: word blocks + fan(4/2) → link-bar → best-words strip → standings graph (no title) → dock) + its render-vals
(`homeSworb` → word-light blocks/pills; NEW `progBar` vals {scoreBig, topScore, topName, pct,
chaseLine, hit, dormant}; standings vals gain per-node `check` + YOU ring (exists); dock vals
{chevron+"swipe up to play"} vs {countdown to next dailyKey}); floaters table (grep `FLOATERS`
1043) add 2-3 sparse dim middle entries. **The mock's CSS values are the spec** — port
`docs/superpowers/mocks/2026-07-22-home-final-v18.html` styles into dc inline-style syntax
(Fredoka sizes, PALETTE tiles + ledges, dashed ghosts, track/fill/knob styles, ✓ mini-tile).
Mirror. Test: browser (both states) + `npm test`.

**Interfaces:** Consumes `dailyStatus()` (score/bestToday cumulative, sworb.solved, guesses),
`homeLeadersVals` (Task 4 solved flags), day-state (Task 4). Produces the two home states on ONE
skeleton (no layout shift between them).

- [ ] Step 1: word-of-the-day area — dashed blocks (or candy reveal when solved / GRAY when
  failed: reuse `sworbGuess.blocks` skins; per-letter PALETTE colors on solve) + fan rows 4/2
  (found = candy pill w/ ledge, unfound = dashed ghost) — replaces the old sworb card + tag/hint
  lines. Delete `modePicker` remnants (Task 4) and the old "sworb safe"/"standings" list rows the
  v18 layout drops.
- [ ] Step 2: progress-to-top link-bar under the fan (per mock: bigScore+pts / crown+topScore+
  leaderName (no "TOP·" prefix) / dashed track / glowing fill at `min(100, round(you/top*100))%` /
  dashed-block knob → candy `hit` when you ≥ top). NO chase line, NO percentage. Under the bar:
  **best-words strip** — top 5 distinct words by pts as candy word-blocks (word + small pts,
  PALETTE colors + ledge), ONE horizontal-scroll row (`overflow-x`, hidden scrollbar); pre-play =
  5 dashed ghost blocks. Data: `dailyStatus().seven.words.slice(0,5)` (the words-list machinery —
  this is its NEW home surface). Dormant styling pre-play.
- [ ] Step 3: standings graph — add the mint ✓ mini-tile on solver nodes; order from Task 4.
- [ ] Step 4: dock — before: chevron + Fredoka "swipe up to play"; after: countdown ONLY
  (`H:MM:SS` to next dailyKey, ticking). Entrance stagger (`rise` pattern) on all sections.
- [ ] Step 5: floaters — middle additions, dimmer (mock values).
- [ ] Step 6: mirror + `npm test` + browser both states pixel-sane vs the mock, no `{{ }}` holes,
  nothing shifts between states. Commit `feat: home v18 — word-light sworb, link-bar, ✓ standings, countdown dock`.

### Task 6: Storm — aurora-of-blocks

**Files:** Modify `index.html` (replace the dock storm FX at 463-471 (`storm.colorBg/animA/...`
vals ~5720+, grep `storm:`) with the v11 mock's system: SVG goo filter def + 6 PALETTE tileblobs
on the bell layout + blur-12 wrap + radial mask; keyframes into the style block 82+). States:
brewing (pre-play) / resting (`opacity:.4; saturate(.55)` post-play). Mirror.

**Interfaces:** Consumes day-state. The mock (`2026-07-22-storm-aurora-blocks-v11.html`) is the
spec: blob sizes/positions/orbits/durations, mask, 12px blur, NO lightning.

- [ ] Step 1: port the goo filter + blob field + mask (keep the storm behind the dock, bleeding
  off-screen bottom as today). Delete the old smoke/lightning layers + their vals.
- [ ] Step 2: brewing/resting driven by day-state; transition via opacity/filter (never snap).
- [ ] Step 3: mirror + `npm test` + browser: bell reads full-width, cubes bridge, resting after
  play. Perf sanity on-device (blur+goo): if jank, halve blob count — note result. Commit
  `feat: aurora-of-blocks storm (brewing/resting)`.

### Task 7: Final verification (whole loop)

- [ ] `npm test` all green. Browser, knob 0:30, fresh day (dev clear-day tool): home before-state
  (dashed everything, bar dormant, storm brewing) → swipe up → round: TIME counts, words score
  cumulatively, clue pills fan in, low-time warning ≤60s → 0:00 MORPH → finale: 6 guesses, colors
  persist, solve → home after-state (candy word, pills, bar %, ✓ on graph, resting storm,
  countdown) → `_startDaily` blocked. Fail-path day: gray reveal, no ✓. Reload mid-round resumes;
  reload after finale lands on after-state. Determinism: two hard-reload deals identical.
- [ ] Ledger notes + commit `test: one-game loop verified end-to-end`.

## Self-Review

- **Spec coverage:** game mechanics T1-T4, home T5, storm T6, E2E T7; finale reuse (morph,
  scoreGuess) T3; word-light/enter-anim/zero-shift in T5 steps; dev knob = owner's explicit ask
  T1. Out-of-scope items stay in the scope doc. ✓
- **Placeholders:** tasks reference exact anchors, grep targets, and the two authoritative mock
  files whose CSS is the concrete spec; logic-level snippets given where behavior changes
  (roundSecs, comparator, two-pass seed, finale enter/exit). ✓
- **Type consistency:** `roundSecs():int` (T1) consumed T3/T7; `rankFor({score,solved})` (T4)
  consumed T5; realized-6 (T2) consumed by fan (T5); `finale` flag (T3) consumed by day-state
  (T4/T5). ✓
