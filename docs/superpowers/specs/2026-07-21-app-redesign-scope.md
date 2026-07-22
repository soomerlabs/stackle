# sworbl app redesign — scope capture (living doc)

Date: 2026-07-21. Captures the design-owner's direction as the "redesign the new game" work
expanded from *home + leaderboards* into a **full multi-screen app redesign**. This is the running
idea list + decisions; it feeds per-sub-project specs/plans, not a single plan.

> Context: play-loop foundation is done (cumulative scoring A, mode contract clean, dead surfaces
> cleared). See `2026-07-21-ui-redesign-readiness.md`. Locked earlier: A (cumulative score),
> B (stroll=theme-solve-quality board · timed=best-score board).

## ⚡ GAME PIVOT (LOCKED 2026-07-22) — ONE MODE. Supersedes the two-mode structure below.

**sworbl = one timed daily round.** ~5 minutes (configurable dev knob): the clock runs while you
spell words on the themed board and bank clue words; when time's up the board morphs into the
guess keyboard and you **must face the word of the day**. One-sentence pitch: *"You get 5 minutes
to crack the word of the day."*

- **KILLS:** stroll/sprint as separate modes · the two-page home pager (home collapses to ONE
  page) · the mode picker/selector question entirely · decision B's TWO leaderboards (one board
  now) · the stroll/sprint naming (just "sworbl" + practice).
- **SURVIVES / REUSED:** the timed-clock machinery (sprint's 2-min engine, retimed) · the
  board-morph-to-keyboard (BECOMES the finale moment) · theme-word banking (checkTargetCatch,
  hint safe) · cumulative scoring (A) · the storm (one identity; can intensify as the clock runs
  down) · the home mock's shared sworb-blocks + found-hints-pills area · the whole visual language.
- **LOCKED (2026-07-22): ONE round per day.** Wordle-style stakes — one 5:00 round is the whole
  day. Solved → share card ("day 214 · solved"); failed → see you tomorrow. Practice mode (random
  board, untimed/timed sandbox) is the outlet for more play.
- **LOCKED (2026-07-22): finale-only guessing.** No guessing during the round — you hunt until
  0:00, then the board morphs and THE GUESS happens. One pure climax. (The old "5 guesses/day
  anytime" model is dead; guesses live only inside the finale.)
- **Score shape (proposed):** word points (cumulative) + solve bonus. Everyone uses the same fixed
  clock, so rank = solved-at-finale (primary) + word score (secondary). ONE leaderboard.
- **LOCKED (2026-07-22): finale = 6 guesses with Wordle coloring** (owner bumped 3→6). After each
  miss the blocks color green/yellow/gray (reuses SworbleDaily.scoreGuess + the built colored
  persistence blocks). The finale is a deduction mini-game: banked clues + letter feedback.

- **LOCKED (2026-07-22): clues fixed at exactly 6 per day** ("6 to find, 6 to crack it"); seeder
  places exactly 6 from the pool (guardrail already proves ≥6 fit).
- **LOCKED (2026-07-22): the HOME is mock v18** (`../mocks/2026-07-22-home-final-v18.html`) —
  one page, before/after states on one skeleton, progress-to-top link-bar (dashed-block head,
  fills candy on hit), ✓-tiles on the standings graph, storm brewing→resting, countdown-only dock.
  Full spec: `2026-07-22-sworbl-one-game-design.md`.

### The complete game (all mechanics locked 2026-07-22)
> **sworbl:** one daily round. 5:00 on the themed board — spell words for points, theme words bank
> as clue pills. At 0:00 the board morphs into the keyboard: 6 guesses, Wordle-colored, to crack
> the word of the day. Solved or not — that was your shot; share card; see you tomorrow.
> Rank: solved first, word score second. One leaderboard. Practice = untimed sandbox.

> Sections below predate this pivot; re-read them through the one-mode lens. Cross-cutting UX
> requirements (animate-everything, skeletons, keyboard-swap, nav bar, full-screen settings/
> results, tutorial, profile, invites, achievements, definition-reveal) ALL still apply.

## Naming (LOCKED 2026-07-22)
- Casual mode → **stroll** (leisurely, unrushed pace). LOCKED.
- Timed mode → **sprint** (timed rush). LOCKED — chosen over keeping "stacks" (owner accepted
  dropping the Stackl-app brand tie for the cleaner stroll/sprint pace pairing).
- Internal code identifiers stay `stackl*`/`sworble*` for now (logged rename TODO — visible text only).
- Brand = **sworbl**; gameplay term for a solve = **sworb**.

## BUILD ORDER (LOCKED 2026-07-22): finish HOME first
Keep iterating the home pager until fully locked BEFORE starting any other sub-project. Remaining
home work: keyboard-swap interaction · skeleton loading · nav bar · page/entrance transitions
polish. Next sub-project chosen only after home is locked.

## THE STORM (LOCKED — 2026-07-21)
Ambient bottom FX = **aurora-of-blocks**: candy game-tiles (metaball "goo") drift, stick, bridge &
split (= the linking gesture), heavily blurred into flowing northern-lights light. **Bell curve
across the FULL width** (small/low at both edges, big/high center), rises from below, pooling under
the swipe-up, mask-faded to the sides. **No lightning** (tried, removed). Home blur ≈ 12px.
**Recolors + speeds up per mode** (stroll = slow/cool teal-violet-mint; sprint = fast/hot
amber-red-pink), and the color must **glide smooth-as-butter** on page switch (animate `--t`).

## HOME = a PAGER of per-mode home pages (LOCKED direction)
- Swipe between per-mode pages; each page IS that game's home.
- **Shared across pages:** the word-of-the-day area (dashed empty-state sworb blocks) **+ the
  found-hints fan back under it** (like the gameplay clue pills, under the current sworb-solution
  state). Show the **hints you've actually found as pills** — do NOT show a "3/7"-style count
  (realized clue total varies per day; the LLM generates once, count isn't a fixed constant).
- **Per page:** a **section header naming the game**, and that mode's **leaderboard**. On page
  switch the board **morphs to the new people/values** via a **blur transition** (or similarly
  clean) — never a hard cut.
- **Swipe-up launches the CURRENT page's mode.** Keep a **Fredoka "swipe up to play"** label,
  spelled out in a fun/obvious way (swipe-up isn't a common game gesture — make it legible).
- **stroll leaderboard columns:** drop "words" → **score / best / top** for now.
- Add the **floating-block background** to home: currently only on the sides — add a *little* in the
  middle too (lighter density than the sides).

## CROSS-CUTTING UX REQUIREMENTS (apply everywhere)
- **EVERYTHING ANIMATES FROM THE START.** All sections have entrance animations; all transitions
  (leaderboard morph, storm recolor, page changes) are animated, never instant.
- **Loading = buttery, zero jank.** On refresh, nothing should jump. Proper **skeleton loaders** at
  the correct sizes so content loads in place cleanly.
- **Keyboard open (tap top blocks):** swap the BOTTOM content (leaderboard / sworb-safe) INTO the
  A–Z keyboard via an **opacity/content swap** — **no screen-height change** (current behavior is
  bad/janky). The keyboard occupies the space the list vacated.
- **Nav bar** should look **normal / iOS-standard**. (double-check the current one against that bar.)
- **Stepper swap icon:** use the **refresh icon WITHOUT the circle**; **animate it spinning** on
  state swap (looks like it spins around).

## MODALS → FULL SCREENS (the odd-men-out)
- **Settings** → a real full screen (not a modal).
- **Results** → full-screen **post-game summary** with easy **share-to-socials** (this is important
  enough to be a first-class screen).
- Audit other modals for the same treatment.

## HINT AIDS + MONETIZATION SEAM (owner-locked 2026-07-22)
Chosen aids (all free): ghost pills show FIRST LETTER always; EARNED HINT — spell ~7 words while
clues remain unfound → earn a hint token; tapping a ghost pill spends a token → that clue's path
flashes on the board; MERCY PULSE — at 2:00 left with ≤2 clues found, one unfound clue pulses once
(automatic, token-free). Declined: spend-score-for-hints.
MONETIZATION DIRECTION: never sell advantage in the daily (leaderboard trust is the product).
Future paid surfaces: archive days, streak insurance, cosmetics (tile skins/storm palettes),
practice packs. The hint-TOKEN seam is deliberately future-proof: today tokens are earned-only;
a purchasable top-up would be a business toggle, and even then aimed at practice/archive boards.

## AWAITING OWNER DESIGNS (2026-07-22 — do NOT build ahead)
Owner has updated designs coming for: PROFILE, LEADERBOARD, SETTINGS (new full screen), and
DAILY-SCORE SHARING. Hold these surfaces until the mocks arrive; current versions are placeholders.

## NEW SCREENS / SYSTEMS (backlog — decompose into sub-projects)
- **First-time interactive tutorial** (full screen, minimal words, not annoying/confusing):
  1) the block, 2) **link words with an interactive gesture** — user must swipe correctly to unlock
  "next", 3) the two modes (stroll = strolling/unrushed feel; sprint = time-based), 4) how clues
  reveal the word of the day. End by **asking preferred mode** → becomes the default page (also
  controllable in settings).
- **Profile rework** — graphs/stats **on-brand with standings** (the handwritten/pencil feel).
  Link profile info across the whole game.
- **Account (v1):** device-local only, leaderboard entry = chosen **username**, **no auth yet**
  (auth optional later). Keep simple.
- **Invite-to-the-game** feature (grow the leaderboard).
- **On-device stats + gamification:** extract interesting data from the engine (hints, word-of-the-
  day, play patterns), track on device, run **cool player-stat reports** → **badges/achievements**.
- **Word-of-the-day definition reveal:** after you solve the sworb, show a "word of the day"-app-
  style card with its real definition (you had to *find* it first). (maybe — could be neat)

## Suggested decomposition (build order TBD with owner)
1. **Home pager** (storm + pages + shared sworb/hints + per-mode board morph + swipe-to-play). ← active
2. **Leaderboards/results system** (decision B visuals; results as full-screen summary + share).
3. **Settings full screen** (+ default-mode control).
4. **Onboarding tutorial** (interactive, gated gesture).
5. **Profile + stats/achievements** (on-brand graphs; on-device data).
6. **Invite** + **word-definition reveal** (smaller add-ons).
Each gets its own spec → plan → implementation. Cross-cutting UX requirements apply to all.
