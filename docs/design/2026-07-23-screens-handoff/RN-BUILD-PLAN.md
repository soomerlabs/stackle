# RN build plan for the 2026-07-23 screens handoff (owner-designed, Claude design)

Source: HANDOFF.md + Sworbl.dc.html (same dc-engine as the fossil — lift values, don't reinterpret).
Targets apps/sworbl (TypeScript). Build order (each increment = commit + on-device verdict):

1. SHARED: FloatingPodium (stepped candy blocks, crown+aura+confetti on #1, podFloat
   loops) + YouBlock (indigo #8971FF, #rank badge) — used by home standings + leaderboard.
2. HOME RESTRUCTURE per 20a/6a/6b: app bar (person / brand / gear+share slots), date header
   ("DAILY PUZZLE · Nº N" eyebrow + two-tone Fredoka date + hairline), pre-play = blank dashed
   hero + blank hint slots (NO first letters on home — design supersedes), completed = candy
   answer + superlatives PAGER (got / got-away, blur-crossfade, dots) + podium standings +
   countdown pill. Home score card RETIRED. Nº = days since epoch day 1 (2026-01-01? confirm).
3. SUPERLATIVES DATA: "what you got" = best free word (indigo) + found clues (green) + others
   (flat pills) + "+N more ›" → word explorer (13a, later). "Got away" = par-bot words
   (DETERMINISTIC via engine solver top words on the opening board — never reconstructed) +
   missed clues green-dashed. Needs: persist all round words (already in finishDay top-5 —
   extend to full list) + parBot module in engine or app.
4. LEADERBOARD screen per 5a: back/brand/share bar, big "daily"/"all-time" title,
   blur-crossfade pager + dots, podium, ranked list with pinned indigo you-row, NEXT SWORBL
   countdown. Stub bots until Supabase; this screen is where the client wiring lands.
5. PROFILE per 4a: avatar block + name + since, 2×2 stat cards (colored dot eyebrows),
   YOUR BEST (word in mini candy blocks + ×mult badge + runner-up chips), PLAY HISTORY
   heatmap (GitHub-scale, lavender ramp, from per-day store keys), pager dots, footer badge.
6. THEME: designs ship light+dark. App is currently dark-locked — dark ships first;
   light theming = separate pass (tokens already in HANDOFF).

Open design decisions for the owner:
- Home pre-play hint slots are BLANK in 20a (no first letters) — supersedes the current
  first-letter ghosts on home? (In-game fan keeps them.)
- Standings on home pre-play uses YESTERDAY's field? ("play to join" when fresh.)
