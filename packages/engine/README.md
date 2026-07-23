# @sworbl/engine

The LIVING engine — consumed by `apps/sworbl` (React Native) and any future client.
Seeded from the repo-root modules on 2026-07-22 (Phase 1 of docs/MOBILE-PLAN.md).

⚠️ The repo-root copies (`/sworbl-*.js`) belong to the FROZEN web validator that
GitHub Pages serves — they do not evolve. Engine changes happen HERE. If a critical
fix must reach the frozen site, mirror it manually and say so in the commit.

Rules of this package (inherited, non-negotiable):
- Pure modules only: no DOM, no storage, no `this`, dual IIFE/CommonJS export.
- DETERMINISM CONTRACT: same dailyKey → byte-identical board on every client.
  mulberry32/hashSeed output is frozen; tests pin known values.
- Every module keeps its test in tests/; `npm test` runs them all.
