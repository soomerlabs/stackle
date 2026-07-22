# Road to 9 — codebase excellence plan (2026-07-22)

> ⚠️ PARTIALLY SUPERSEDED (same day, owner decision): Sprints 2-3 are replaced by the FULL RN
> REBUILD — see `docs/MOBILE-PLAN.md`. Don't decompose a shell that's being retired. Sprint 1
> (honest numbers) still applies — it hardens the engine that transfers. The next cold review
> scores the RN codebase.

Two independent cold reviews: 7.0 → 7.5 (judgment rated 8.5; artifact maturity 6.5). Every
remaining ceiling-limiter is named. This plan clears them in three sprints — and every step
doubles as **React Native prep**: the shell shrinks, the portable pure core grows. (RN decision
is locked: RN + the shared JS engine; Capacitor wrap first for stores + haptics; owner is a
native iOS engineer, so custom native modules are in-house.)

## Sprint 1 — honest numbers + hygiene (all S/M, ~1 session)
1. **Coverage instrumentation**: `c8` wired into `npm test`; publish the real number in CI
   output; never claim an unmeasured percentage again.
2. **jsdom boot smoke test**: mount the component headless; assert home/game/finale render
   without throwing. Closes the one integration gap every review named.
3. **localStorage age-GC**: prune per-day keys older than ~60 days at boot.
4. **1-Hz home render throttle**: the countdown tick re-renders the full vals object every
   second on home — scope it.
5. **Singleton QUEUE_KEY**: net.js reads the store constant for real (kill the test-enforced
   duplication).
6. **Hygiene sweep**: migration-debt wipe (stackle_* shims), naive profanity list improvement,
   stale mirror mentions in historical docs get a superseded-note, verify no SDD scratch is
   tracked.

## Sprint 2 — finish the shell decomposition (the 8+ move, M/L, sliced)
The 6.3k-line component becomes a thin conductor. Slices, each independently green:
  a. render-vals builders → `sworble-views.js` (pure state→vals; the biggest mass)
  b. input handlers (board pointer path, gestures) → own module behind a narrow surface
  c. the frame/engine loop → isolated `engine` section with an explicit tick API
  d. target: index.html < ~2k lines = markup + wiring + the section map
Each slice extends the headless tests. **This is also the RN work**: (a) and the engine loop
are exactly what the RN app consumes.

## Sprint 3 — own the runtime (decide, don't drift)
`support.js` is a generated black box (provenance documented in README). Options, decided
AFTER Sprint 2 shrinks what it hosts: (a) replace with a ~200-line hand-written host (we own
everything; RN parity trivial), (b) keep + freeze with a golden-render test. Bias: (a) — but
only once the shell is thin enough that the host is genuinely small.

## Explicitly NOT doing for the score
- Rewriting the engine in anything (determinism contract is sacred; JS runs everywhere we ship).
- DOM-testing every animation (the reducer layer + boot smoke + eyes are the right mix).
- Chasing 10 (reviewers' own rubric: 10 = exemplar; 9 = extraordinary. Sprint 1+2 lands 8.5+;
  Sprint 3 is the 9 argument).

## Sequence with product work
Sprint 1 now (cheap, no conflicts). Sprint 2 interleaves with the owner's incoming designs —
each new screen (profile/leaderboard/settings/share) is BUILT on the decomposed pattern rather
than added to the monolith, so product work advances the refactor instead of fighting it.
