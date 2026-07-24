# sworbl — THE MODES SPEC (owner rulings 2026-07-23, locked;
# HARD MODE REMOVED by owner ruling 2026-07-23 — see ROUND DECAY)

ONE daily mode + seed boards (duels), sharing one engine, one board
system, one validated submission path.

## REGULAR (the default daily)
- **Replayable rounds**: play the day's 3-minute board as many times as
  you want until midnight (local day roll, same as today).
- **Clues accumulate across rounds** (the day's clue bank is persistent —
  progress toward the word survives every round).
- **Score = your single BEST round + solve bonus.** Replays give more
  clue progress and more shots at a great round; grinding cannot sum
  points (owner ruling #1 — the leaderboard must never be a
  time-spent contest).
- **6 sworb guesses for the WHOLE day** (owner ruling #2), spendable
  whenever: after a round or straight from home. Found every clue and
  still can't get it? womp — no extra guesses.
- **Solving does NOT end the day** (owner ruling #3): keep playing
  rounds to raise the best-round score. The solve bonus locks in.
- **Fresh board per round** (build decision, flagged to owner): each
  round deals from seed `dayKey|r<N>` — same day, same word, same
  remaining-clue set, fresh letter layout. A static board would let
  round 2 be a memorized speedrun and would exhaust the layout's
  findable clues in one round.

## ROUND DECAY (owner ruling 2026-07-23 — REPLACES hard mode)
- Hard mode is DELETED. Instead, the guess prompt appears after EVERY
  round (the round-end cover), and the solve bonus DECAYS with rounds
  played at guess time: bravery is priced, not forked.
- **Decay is by ROUNDS PLAYED, never wall-clock** (time decay would
  punish the lunch-then-dinner player and fight the replay-all-day law).
- **The math lives in the ENGINE** (sworbl-daily.js, shipped to the edge
  function too — client and server compute the identical bonus):
  `bonus = round5(guessReward(cluesFound) × max(0.3, 0.8^(rounds−1)))`.
  Round 1 cold read = the full 500; round 3 = 320; the floor is ×0.3.
- Submissions carry `rounds`; submit-score validates the delta against
  `SworblDaily.legalBonuses(rounds)` — the engine's own set.
- No mode fork, no per-day mode lock, no hard leaderboard. The daily
  board is ONE board again (daily + all-time pages).

## GHOST DUELS (owner-approved 2026-07-23 — replaces "practice" as the
## third mode; same seeds, framed as "beat someone")
- **Pseudo head-to-head**: the server picks an OPPONENT'S RECORDED RUN on
  a featured seed (skill-adjacent: within ~±30% of your average). You play
  the same 3-minute board; their score climbs beside yours as a GHOST on
  a race bar, word by word. Buzzer → W/L + their best words vs yours.
  Feels live, needs no lobbies, works at any player count and any hour —
  deliberately better than real-time PvP for a small base (empty lobbies
  kill features). Real-time rooms stay a POSSIBLE future layer.
- **Global leaderboard PER SEED** stays ("who owns board s-0042") — solo
  climbing the seed board remains a valid way to play.
- Seeded deterministic boards, no archetype, no sworb/finale; score =
  word points (submit-score practice policy: keep-best per seed, delta 0).
- Server additions beyond schema v4: practice_scores gains words jsonb
  (+ optional per-word timestamps later — ghosts then replay EXACTLY);
  a pick-opponent edge function; a duel W/L record per player.
- Client: ghost race bar during the round (shared-value pair, cheap),
  duel result screen, duels entry on home. Even without timestamps,
  pacing recorded words across the 3:00 reads convincingly live.
- **DIRECT CHALLENGES (owner 2026-07-23)**: duel a SPECIFIC user — both
  consent, the server assigns a VIRGIN seed neither has seen; each plays
  on their own schedule; first finisher becomes the second's ghost;
  resolves to W/L for both. Identity via USERNAME — UNIQUE as of schema
  v5 (owner: "username is what games do"; friend codes are OUT). Rematch button =
  a de-facto series across fresh boards; formal best-of-N later.
  Server: challenges table (challenger, opponent, seed, per-side
  score/words, status, 48h expiry) + accept/decline; in-app inbox chip
  v1, push notifications later. Same submit-score validation path.

## SERVER MODEL (schema v4; hard removed 2026-07-23)
- `submissions.mode` remains as a column ('regular' rows only now);
  PK stays `(player_id, day)`.
- Write policy in submit-score:
  regular → keep-best upsert (update only when new score > stored);
  practice → separate `practice_scores (player_id, seed)` keep-best,
  words jsonb rides along (ghost fuel, schema v6).
- `alltime_totals` trigger gains an UPDATE arm: `total += new - old`.
- `daily_standings` view filtered/labeled by mode.

## GROUPS / LEAGUES (owner 2026-07-23: "3 or 4, 10, 20 people... own
## leaderboard, public or private") — generalizes duels (1v1 = group of 2)
- groups table (name unique-ish, PUBLIC browsable / PRIVATE by invite —
  join via group name or member username) + group_members join table.
- A group leaderboard is a FILTER over existing validated data — no new
  scoring paths: the group daily board (today, members only) and group
  per-seed boards. Same submit-score gate everywhere.
- Group seed events: the group plays one virgin seed; ghost race vs the
  group's current leader instead of a random stranger.
- Build after duels core (~2-3 extra sessions — tables, RLS, join/browse
  UI, filtered views).

## GUESS UX TARGET (owner 2026-07-23): THE HERO IS THE INPUT
- Tap the dashed word-of-the-day on home → the hero tiles become LIVE
  guess slots in place; the content below BLUR-REPLACES into the
  keyboard (progressive blur + crossfade, the parked-frost idiom).
- Wordle feedback colors land ON THE HERO and PERSIST as the day's
  intel (needs guess rows/colors persisted day-level, not run-level).
- Shipped now: the hero is tappable (opens the sheet guess) + a
  "tap the word to guess · N left" caption replaces the pill.

## CLIENT MODEL (day state v2)
- Day: `{ mode, roundsPlayed, bestRound, found[], sworb{guessesUsed,
  solved}, bestWords }`; day score derives: bestRound + solveBonus.
- Round end (regular): summary → home; finale is DECOUPLED — a "guess"
  action on home (and offered post-round) while guesses remain.
- Home in-progress face: rounds played, clue bank progress, best round,
  GUESS button, next-round entry through the same PLAY door.
- Streak/share/stats read the derived day score; share card gains mode.

## LIVE TUTORIAL (owner 2026-07-23, queued post-tester-wave)
A GUIDED FIRST ROUND, not a slide deck: scripted mini-board walking the
finger through the verbs — trace a word, watch the flight to the stepper,
catch a planted clue, feel the clock, one gimme guess — each step gated
on DOING it (the trace-to-play door proved teach-by-doing). Tester
confusion points become the curriculum.

## BUILD ORDER
1. schema-v4.sql + submit-score v2 (server first — old clients keep
   working through the transition).
2. Client regular-replay loop (persist v2, play-sheet round loop,
   decoupled guess, home in-progress face). The big one.
3. ~~Hard mode~~ REMOVED (2026-07-23): round decay replaced the fork.
4. Ghost duels (seed boards + ghost race bar + pick-opponent function +
   per-seed boards/featured list). ~3-4 sessions.

## THE UNIVERSAL PLAY DOOR (owner 2026-07-23 — "use the play button for
## everything"): SELECT A BLOCK, TRACE, SWIPE UP
- HOME becomes a shelf of PLAYABLE BLOCKS: the sworb-of-the-day block
  (hero card: dashed word + day status), the three daily STORM boards,
  and open SHOWDOWN posts.
- Tap a block → SELECTED (lift + glow in its candy color). The P·L·A·Y
  dock arms LINKED to that context; swipe up opens the ONE sheet hosting
  the selection. Default selection = the daily (no-tap behavior today).
- Sheet content switches by context: daily → the existing full arc;
  storm/showdown → a lighter runner inside the same shell (2:00 clock,
  race bar, run-banked cover). The /storm route survives only for deep
  links (redirects home with the selection pre-armed).
- One launch grammar everywhere: trace P·L·A·Y ticks → silent swipe →
  GO wake, regardless of what's being played.

## STORMS + SHOWDOWNS (owner rulings 2026-07-23, superseding "open duels")
- STORMS = the arcade shelf: THREE FRESH boards mint per local day
  (s-YYYYMMDD-a/b/c, pure day-key derivation — no rotation, owner:
  "won't people get bored?"; no authoring; leaderboards persist as
  history). Codenames dealt by hash off a curated storm list.
- SHOWDOWN (owner rename of 1v1 duels): posting a validated run opens a
  showdown; TAKING IT CLAIMS IT (atomic, 1v1); the taker's validated
  keep-best resolves it server-side; decided = OFF THE RAIL (history
  later). Points for now: +10 win, +2 played (players.showdown_points).

## INLINE HOME GUESS (owner 2026-07-23, supersedes the /guess screen as
## the end state — "keyboard swaps everything below the hints on home,
## type right into the blocks"; the screen stays as the deep-link path)
- Tap the hero → the dashed hero blocks become LIVE guess slots in
  place (Wordle colors persist on them all day).
- Everything from the standings strip DOWN swap-flips to the keyboard
  in a gameboard-style card ("nail the transitions from the leaderboard
  down flipping to the keyboard").
- A CLOSE button appears top-right of the sworb-of-the-day section —
  the exit is visible, never modal.
- Build gate: the transition must pass the owner's eye — this rides the
  universal-play-door session, same surfaces, same care.

## PRIVATE STORMS + INVITED SHOWDOWNS (owner 2026-07-24)
- PRIVATE STORMS: a storm board with a member list — invite users by
  username; the board + its leaderboard visible to members only.
  Infrastructure exists: v6 groups/group_members (deployed, unused).
  A private storm = a group + a seed; leaderboard = practice_standings
  filtered by membership.
- SHOWDOWNS become 1v1 with a NAMED opponent: post targets a specific
  username (invite), only they can claim. Open-to-anyone posts remain
  as the public variant. The v9 lifecycle (claim/resolve/points) is
  unchanged — invites add a `target` player on the post.
- INTENSITY LADDER shipped 2026-07-24: drizzle/squall/hurricane derive
  from the seed slot (a/b/c); rewards weighting by intensity = later.

## THE ECONOMY LAW (owner approved 2026-07-24)
ONE currency: POINTS. Earned by playing, topped up with money. The
leaderboards stay sacred — money can never buy score.

NEVER PURCHASABLE (the pay-to-win line):
- raw score, mid-round time, or any ranked advantage
- crowns, standings positions, showdown outcomes

POINTS ARE EARNED BY:
- showdown wins (+10) / played (+2) — shipped (players.showdown_points
  becomes the wallet)
- storm crowns held at day's end, daily solves, streak milestones (tune)

POINTS ARE SPENT ON:
1. STREAK REPAIR — miss a day, save the flame (highest-converting spend
   in daily games; zero competitive impact)
2. THE ARCHIVE — replay past days (unranked or separate archive board)
3. PRIVATE STORM creation (joining stays free — the payer recruits)
4. SHOWDOWN STAKES — wager points on a 1v1 (the gamble feel, legally
   clean; buy ENTRIES, never cash out)
5. COSMETICS — tile palettes, trail colors, crown flair (the candy
   engine is built for this)
6. HONEST HINTS — a bought hint on the daily guess CHARGES THE BONUS
   (reveal a clue → the reward tier drops a notch, engine-priced). You
   buy completion, never net score.

FREE TIER + ADS:
- daily sworb ritual: free forever (the growth engine — never gated)
- round volume metered LATER, priced from DATA: ship an invisible
  per-day round meter first, set the free cap above tester P95
- rewarded ads ONLY, at the out-of-rounds moment ("watch one, +3
  rounds"); banners never (the butter aesthetic is the product)
- SWORBLE+ sub (~$3-5/mo): unlimited rounds, zero ads, private storm
  creation, a cosmetics drop
- real-money wagering: NO (licensing/5.3 minefield) — points stakes
  capture the feeling

BUILD ORDER: wallet (rename showdown_points → points, earn hooks) →
streak repair → archive → stakes → cosmetics → metering/ads last (needs
usage data + App Store setup).

## THE HOCKEY-STICK TRACE (owner 2026-07-24 — "PL across, AY going up,
## the gameboard already coming up... fluid")
ONE gesture: tracing P·L·A·Y IS the swipe.
- GEOMETRY: P, L sit horizontal at the dock; A stacks above L, Y above
  A — the path runs right, then UP (the backwards-L / hockey stick).
- THE CORNER HANDOFF: the moment the trace turns up past L, the finger's
  Y starts driving sheetY directly — the sheet rises WITH the vertical
  leg, tiles A and Y light as the finger passes their zones on the way
  up. Trace ticks keep the 4-beat ascending haptic grammar.
- COMMIT: reaching Y (or passing the existing commit threshold mid-leg)
  = open; release before = spring back + disarm (the existing abort
  behavior, one system).
- FALLBACKS: the plain swipe-up must still work for muscle memory; the
  armed chevron state dies (there IS no separate armed state — the arm
  is the corner).
- THE CORNER FAB (owner addendum): the whole trace lives in a corner,
  out of the way — and the corner is the L's NATURAL home: P·L run
  along the bottom edge, A·Y climb the side edge. Home's full-width
  dock band retires; the sections get the space. Open questions for
  the build: where the next-sworbl countdown lives on a done day, and
  how the corner coexists with the parked sheet's peek/frost.
- GEOMETRY RULING: P alone at the corner, L·A·Y climbing (1+3, not
  2+2) — three vertical tiles give ~170px of finger travel to scrub the
  sheet's rise (smooth mapping), the corner turn comes after ONE tile
  (ignition feel), and the footprint hugs the corner like a true FAB.
  The word reads bottom-up: it RISES.
- SHEET RULING: the board stays on the HAND-BUILT layer — a native
  sheet cannot be finger-scrubbed mid-gesture and its pull-down fights
  board traces. Steal the native LOOK instead: top corner radius +
  home's scale-back on the custom presentation. Native sheets remain
  for tap-launched tasks (guess, lobby, book).
- THE RADIANCE (owner addendum 2): the parked frost/blur band retires
  WITH the dock — affordance comes from the aurora colors RADIATING off
  the play blocks themselves (soft candy glow bleeding from the FAB:
  "easy to see they do something"). The storm crest choreography gets
  rethought against the corner in the same session.
- BUILD HOME: this is the OPENING move of the universal-play-door
  session — the dock gesture is being rebuilt context-aware there
  anyway; the hockey stick is its input layer. It must not be bolted
  onto the current dock (the zombie-arm/slow-drag fixes live in the
  current geometry's assumptions).
