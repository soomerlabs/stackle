# sworbl — Claude Code handoff: Home, Leaderboard, Profile

## How to use
`Sworbl.dc.html` is a design prototype on the **same `<x-dc>` / `DCLogic` / `{{ }}` engine as your `index.html`** (same `support.js`, same `renderVals()` + inline-style-string pattern). Open it with `support.js` beside it. Because it's the same engine, **lift the markup and the `renderVals` keys** rather than reinterpreting pictures. Ignore the exploration turns; implement only the screens below (open the file, search the turn id).

## HOME — two states, one screen
- **Pre-play** — `20a`: app bar (person / sworbl / settings), date header (`DAILY PUZZLE · Nº 203` → "wednesday july 22" + hairline), **empty word-of-day tiles** (5 dashed, blank — the answer is hidden), **empty hint slots** (6 dashed, blank — no spoilers), **standings** (floating podium + you-block), and **swipe-to-play with the storm glow** pinned at the bottom.
  - Fresh / never played today: no personal score → standings shows the field only + "play to join" (no you-block).
  - Resume / in progress: you-block with your partial score + "swipe up to keep going."
- **Completed recap** — `6a` (light) / `6b` (dark): date header, solved BLOOM tiles, **superlatives** (below), **standings** (floating podium + you-block), countdown. **No par bar.**

## LEADERBOARD — `5a`
App bar (back / sworbl / share), big **daily / all-time** title, a **blur-crossfade pager** (swipe or tap the dots) over the **floating stepped podium**, then the ranked list with the player's **pinned you-row**, and a "NEXT SWORBL IN" countdown.

## PROFILE — `4a`
Open `4a` and lift it as-is (branded profile).

## Shared components
- **Floating stepped podium** (home standings + leaderboard top-3): three candy blocks at stepped heights — center #1 highest, right #2 mid, left #3 low (via `margin-top` 0 / 18 / 34), each floats (`podFloatA/B/C`), #1 gets a crown + gold aura + confetti; name + score under each; **no riser blocks** (rank reads from height).
- **You-block**: a floating indigo (`#8971FF`) candy block with a `#rank` badge and "YOU" + score beneath (replaces the old solid you-row). On the leaderboard *list*, the player stays an inline pinned row.
- **Superlatives** (completed only): a blur-crossfade pager between **WHAT YOU GOT** and **WHAT GOT AWAY** (no "superlatives" title — the page labels carry it). *Got* = your best free-hunt word as an indigo candy block + found **clue words in green** + other found words as flat pills; capped ~2 rows on home with a plain **"+N more" text link → the word explorer (`13a`)**. *Got away* = missed big words (dashed) + missed **clue words (green dashed)**. Clue words = the day's hint words (found/missed); the "got away" high-value words come from the **par bot** (deterministic), never a reconstructed board. Pager wiring: state `supPage`; keys `supPanel0Style` / `supPanel1Style`, `onSupDown` / `onSupUp`, `goSup0` / `goSup1`, dots `supDot0` / `supDot1`.

## Tokens
Candy (bg / edge): violet `#A78BFA`/`#7C5CE0` · blue `#5BC8F5`/`#2E9FD0` · green `#5FD6A8`/`#38AD7F` · pink `#F58FB8`/`#D06090` · gold `#F5B84A`/`#CE9022` · coral `#F58A66`/`#CC5F3D`. Indigo (you / action) `#8971FF`/`#6B4EE6`. Clue green `#5FD6A8`.
Light: bg `#EDEFF7`, ink `#1F1442`, sub `#8A8FA3`. Dark: bg `#101014`, ink `#EDEFF7`, sub `#9DA2B3`.
Wordmark **sworbl** (no trailing e). Fonts: Fredoka (display + numbers), Manrope (labels), Material Symbols Rounded.

## Where it maps in index.html
- Home **standings**: template ~651–679; builder (`podCol` / `homePodium` / `homeYouNode` / `homeTrailSegs`) ~5553–5633 → replace the scatter/trail-graph with the floating podium + you-block (drop axes/trail/risers).
- Home **superlatives**: the block between the word chips and standings; the standalone chips row is absorbed into it.
- **Leaderboard**: the `openLb` screen (`loadHomeLb` / `lbStub`).

## Paste-ready prompts (run one at a time in Claude Code)

**Home**
> Open `design/Sworbl.dc.html` (+ `design/support.js`) and `design/HANDOFF.md`. It's the same x-dc engine as index.html. Implement the HOME per turns `6a` (light) and `6b` (dark) for the completed recap and `20a` for pre-play. Replace the home standings scatter/trail-graph (template ~651–679, builder ~5553–5633) with the floating stepped podium + you-block; fold the hint chips into the superlatives pager (found clues green, missed clues green-dashed) with a "+N more" link to the word explorer; lead with the date header (no par bar). Lift the markup and renderVals keys directly.

**Leaderboard**
> Same file/engine. Implement the LEADERBOARD per turn `5a`: daily/all-time blur-crossfade pager (state `supPage`-style pattern) over the floating stepped podium, ranked list with the pinned you-row, dots, and countdown. This is the `openLb` screen.

**Profile**
> Same file/engine. Implement the PROFILE per turn `4a`, lifting its markup and renderVals as-is; wire to the existing profile data.

## Files
- `Sworbl.dc.html` — prototype (open in a browser to interact)
- `support.js` — runtime
