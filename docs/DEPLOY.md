# Deploying sworble

sworble ships as a static site on GitHub Pages — `index.html` plus the `sworble-*.js`
modules, `support.js` (the dc-runtime), `vendor/` (self-hosted React), `dailies.json`,
`dictionary.txt`, and assets. There is no build step; what's committed is what's served.

**Runtime stays zero-dependency.** `eslint` (see `eslint.config.js`) is the repo's first
`package.json` dependency, ever — it's `devDependencies`-only, a local lint/test-time tool.
Nothing served to a player is built, bundled, or transpiled from it; `node_modules/` never
ships. If a future change adds a real runtime dependency, it needs its own build step and
this doc needs a rewrite — that's a deliberate, not accidental, architecture change.

## GitHub Pages caching

Pages serves static files with `Cache-Control: max-age=600` (10 minutes) by default —
browsers and any CDN in front of Pages can hold a stale copy of a module or `dailies.json`
for up to 10 minutes after a deploy. For most files that's a fine tradeoff. It is **not**
fine for `dailies.json` (today's puzzle/clue data) or a `sworble-*.js` module that changed
shape in a way an old cached HTML shell wouldn't expect — a half-stale mix (new index.html,
old cached module) is how you get a broken boot.

## The `?v=` cache-bust

`index.html` defines a single deploy stamp:

```js
const BUILD = '2026.07.22-1';
```

Every module `<script src="./sworble-*.js?v=...">` tag and the `dailies.json` fetch
(`fetch('./dailies.json?v=' + BUILD)`) append this value as a query string. A query-string
change is a new URL as far as the browser cache is concerned, so bumping `BUILD` forces a
fresh fetch of every module and of `dailies.json` on the next load — no waiting out the
10-minute `max-age`, no cache-control tuning on the Pages side needed.

`index.html` itself is never cache-busted (it can't cache-bust itself), so it may still be
served stale for up to 10 minutes after a deploy — that's expected and harmless: a stale
`index.html` still references the *previous* `BUILD`'s modules by their old `?v=`, which are
still being served correctly (nothing was deleted), so a mid-window visitor gets a fully
consistent old build, not a mismatched one. They get the new build on their next real
(cache-expired) load.

## Deploy checklist

1. Make your change.
2. Bump `BUILD` in `index.html`'s main script (`const BUILD = '...'`) to a new value —
   date + sequence works well, e.g. `2026.07.22-1`, `2026.07.22-2` for a same-day respin.
3. Update the **same** value in:
   - every `<script src="./sworble-*.js?v=...">` tag in the `<helmet>` block
   - the `dailies.json` fetch already reads `BUILD` live, no separate edit needed there
5. `npm test` — must be green (runs `npm run lint` first, then the pure-module + dailies-content
   test suite).
6. Commit and push to `main` (or your deploy branch) — Pages redeploys automatically.
7. Sanity check in a private/incognito tab (bypasses your own browser cache) that the
   Settings sheet's ghost-text footer shows the new build stamp.

## Why not a service worker / real bundler yet

Out of scope for this pass — see the prod-shell hardening audit. `?v=` cache-busting solves
the "stale module after deploy" failure mode with zero infrastructure; a service worker adds
its own cache-invalidation surface area that isn't worth it yet for a single-page static app
this size.
