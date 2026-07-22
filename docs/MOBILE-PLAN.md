# Mobile plan — the React Native era (locked 2026-07-22)

DECISION (owner): full RN rebuild, ONE codebase → iOS + Android + web (Expo + react-native-web).
Supersedes the earlier "keep web separate / Capacitor first" advice — rationale: mobile is
certain, the current web shell was scheduled for demolition anyway (Road-to-9 S2/S3), the new
screens are unbuilt (build once, in the final stack), and the real assets all transfer.

## What transfers vs dies
- TRANSFERS 100%: packages/engine (all 9 pure modules + 12 test suites + determinism contract —
  Metro imports them unchanged) · every design decision (specs/mocks/transition matrix/word-light
  rules) · content pipeline + GENERATION-PROMPT · Supabase plan · deploy/versioning discipline.
- DIES (was dying anyway): the 6.3k index.html shell · the dc-runtime black box · the CSS (the
  encoded KNOWLEDGE transfers; the syntax doesn't).

## Phase 0 — THE SPIKE (gate; ~2 days)
Prove the risky 10% before betting the codebase. Scope: the BOARD only —
- 5×6 candy tiles (Reanimated: spawn/clear/fall), swipe-path word tracing (Gesture Handler),
  one storm experiment (RN SVG gradient blobs OR Skia; measure web-export weight),
  expo-haptics on tile-lock (the whole native itch, demonstrated).
- Export the same spike via `expo export --platform web`; open in Safari/Chrome.
SUCCESS CRITERIA (measurable): 60fps tile cascade on owner's iPhone; swipe-trace feels ≤ web
(owner judgment); haptic moment feels GOOD; web export loads < 3s on residential wifi and the
board is playable in-browser; bundle weight understood (Skia WASM cost known if used).
FAIL → revisit (RN-shell-around-WebView remains the fallback; nothing lost but 2 days).

## Phase 1 — monorepo + engine extraction (~week)
packages/engine (sworble-core/seed/daily/status/flow/run/solver/store/net + tests, moved) ·
apps/web (current game, FROZEN — stays deployed as the public validator during the rebuild) ·
apps/sworbl (Expo, TypeScript, Expo Router). PORT NOTE: sworble-store gains an injectable
storage backing — localStorage (web) / MMKV (native, sync like-for-like). PUSH main first so
the frozen validator is the REAL game, not the pre-pivot one still live.

## Phase 2 — the RN build (~3 weeks, interleaved with Supabase)
Board port first (the spike grows up) → owner's incoming designs land as RN screens
(profile / leaderboard / settings / share+definition card) — built ONCE, in the final stack.
SUPABASE IN PARALLEL: project + schema + RLS + anon auth are dashboard/SQL work (no client
dependency) — set up during Phase 1-2; sworble-net (shared module) wires in as screens land:
shadow-writes first, leaderboard reads when that screen exists. Payload additions (solved,
guesses_used, clues_found, engine_ver) land with the wiring.

## Phase 3 — beta ladder → simultaneous launch
TestFlight + Play internal (haptics validation, friends' leaderboard = first real Supabase
data) → RNW web-at-parity replaces the frozen site when it passes the owner's eye →
PUBLIC LAUNCH: iOS + Android + web, same day, one build stamp.
LAUNCH GATES: content runway ≥30 days + CI runway monitor · anon-auth MAU math checked ·
store assets (icon exists: icon-180) · privacy labels (device-local + anon auth = easy).

## Native dividends (owner is a native iOS engineer)
expo-haptics day one; then via config plugins/native targets: Live Activity (countdown to next
puzzle), lock-screen widget (today solved-state), rich push later. The Swift itch gets scratched
where it counts — in the extras no cross-platform tool does well.
