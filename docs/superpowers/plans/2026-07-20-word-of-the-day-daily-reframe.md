# Word of the Day — Daily Reframe (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the daily from a capped, "seven"-scored run into an endless, theme-first word hunt — a themed board packed with many interwoven theme words (configurable density), theme-first ranking, no word cap.

**Architecture:** Pure modules do the testable logic: `sworble-daily.js` parses a per-day **theme-word pool** (relaxing the 5-clue cap) and `sworble-status.js` reports the **realized** theme total + a theme-first rank basis. The game (`index.html`) seeds up to a dev-configurable `themeTarget` words via the existing letter-sharing seeder, stores the **realized** theme set, removes the word budget/endless-run gate, drops the "seven" computation, and surfaces theme progress + the sworb (the board-morph guess UI already exists). Determinism stays `(day seed, moves, themeTarget)`.

**Tech Stack:** Vanilla ES5-ish browser modules loaded via `<helmet>` `<script src>` + `module.exports` for Node tests. Plain `node:assert` test files run by `npm test`. No framework, no build step. UI is a Claude "dc" template (`support.js`): `{{ bindings }}` filled by a render-vals object, `<sc-if>` conditionals.

## Global Constraints

- TDD: write the failing Node test first, watch it fail, implement minimally, watch it pass, commit. Every pure-module change gets a `tests/<name>.test.js` addition.
- Pure modules follow the house pattern EXACTLY: `(function(root){ 'use strict'; … root.X = API; if (typeof module !== 'undefined' && module.exports) module.exports = API; })(typeof window !== 'undefined' ? window : globalThis);` — NO DOM, NO storage, NO `this`.
- Determinism is sacred: all randomness comes from `SworbleCore.mulberry32(seed)` streams seeded off the day. Never `Math.random()` in daily code. New determinism surfaces get pinned known-value tests. The `themeTarget` knob is **dev-only**; production ships a fixed default so every device gets the identical daily.
- After editing `index.html`, mirror it: `cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html` (the `tests/mirror-check.js` in `npm test` enforces this).
- EVERY `{{ x }}` in the template must be defined in the render-vals in ALL states, or you get literal `{{ }}` text / "never resolved" warnings. Mirror existing render-vals patterns.
- BROWSER-VERIFY every UI change with claude-in-chrome: serve `python3 -m http.server 8737`, load `http://localhost:8737/`. The browser aggressively caches JS modules — after changing a `.js` module, hard-navigate to a fresh `?cachebust=N` URL and confirm the new code loaded (test a known new symbol in the console).
- Today's `dailies.json` test day is `2026-07-20` (sworb `ocean`). The system date in this environment is 2026-07-20.
- Board geometry: `cols()`=5, `rows()`=6 (30 cells), 8-directional adjacency, `SworbleCore.expandLetter` maps `'q'`→`'qu'`.

---

## Task 1: `sworble-daily.js` — parse a theme-word POOL (relax the 5-clue cap)

**Files:**
- Modify: `sworble-daily.js` (`parseEntry`)
- Test: `tests/sworble-daily.test.js` (extend)

**Interfaces:**
- Produces: `SworbleDaily.parseEntry(dailies, day) -> { sworb, themeWords } | null`. Accepts EITHER a new `themeWords` array (a pool, length ≥ 1, no upper cap) OR the legacy `clues` array (back-compat). Each word trimmed/lowercased; any non-string/empty → null; missing/empty sworb or pool → null. `themeWords` is the returned canonical field.
- Consumed by: Task 4 (`dailyStatus`) reads `entry`; the game builds its active themed entry from `themeWords` (Task 3).

- [ ] **Step 1: Write the failing test** (append to `tests/sworble-daily.test.js`, before the final `console.log`)

```js
{
  // NEW shape: a pool of theme words, no 5-cap
  const pool = { '2026-08-01': { sworb: 'ocean', themeWords: ['tide','coral','wave','reef','salt','shore','kelp','surf','foam','brine','pearl','shell'] } };
  const e = D.parseEntry(pool, '2026-08-01');
  assert.strictEqual(e.sworb, 'ocean');
  assert.strictEqual(e.themeWords.length, 12, 'pool larger than 5 is accepted (cap relaxed)');
  assert.strictEqual(e.themeWords[0], 'tide');
  // BACK-COMPAT: legacy `clues` still parses, surfaced as themeWords
  const legacy = { '2026-08-02': { sworb: 'kitchen', clues: ['oven','fork','pan','dish','spoon'] } };
  const l = D.parseEntry(legacy, '2026-08-02');
  assert.deepStrictEqual(l, { sworb: 'kitchen', themeWords: ['oven','fork','pan','dish','spoon'] });
  // normalization + validation
  assert.deepStrictEqual(D.parseEntry({ x: { sworb: ' Ocean ', themeWords: [' Tide ', 'CORAL'] } }, 'x'), { sworb: 'ocean', themeWords: ['tide','coral'] });
  assert.strictEqual(D.parseEntry({ x: { sworb: 'ocean', themeWords: [] } }, 'x'), null, 'empty pool -> null');
  assert.strictEqual(D.parseEntry({ x: { sworb: 'ocean', themeWords: 'nope' } }, 'x'), null, 'non-array -> null');
  assert.strictEqual(D.parseEntry({ x: { sworb: '', themeWords: ['a'] } }, 'x'), null, 'empty sworb -> null');
  assert.strictEqual(D.parseEntry({ x: { sworb: 'ocean', themeWords: ['tide', 7] } }, 'x'), null, 'non-string entry -> null');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-daily.test.js`
Expected: FAIL — legacy result has `.clues` not `.themeWords`, and the 12-word pool returns null (current cap `> 5`).

- [ ] **Step 3: Implement — replace `parseEntry` in `sworble-daily.js`**

```js
  function parseEntry(dailies, day) {
    if (!dailies || typeof dailies !== 'object') return null;
    var e = dailies[day];
    if (!e || typeof e !== 'object') return null;
    var sworb = typeof e.sworb === 'string' ? e.sworb.trim().toLowerCase() : '';
    if (!sworb) return null;
    // accept a theme-word POOL (new) or the legacy `clues` array (back-compat); no upper cap
    var raw = Array.isArray(e.themeWords) ? e.themeWords : (Array.isArray(e.clues) ? e.clues : null);
    if (!raw || !raw.length) return null;
    var themeWords = [];
    for (var i = 0; i < raw.length; i++) {
      var w = typeof raw[i] === 'string' ? raw[i].trim().toLowerCase() : '';
      if (!w) return null;
      themeWords.push(w);
    }
    return { sworb: sworb, themeWords: themeWords };
  }
```

Also update `isClue` to read `themeWords` (it may still be called with an active themed entry that uses this shape):

```js
  function isClue(word, entry) {
    if (!entry || !word) return false;
    var list = entry.themeWords || entry.clues || [];
    var w = String(word).toLowerCase();
    return list.indexOf(w) >= 0;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-daily.test.js`
Expected: `sworble-daily: all passed`.

- [ ] **Step 5: Commit**

```bash
git add sworble-daily.js tests/sworble-daily.test.js
git commit -m "feat: parseEntry accepts a theme-word pool (relax 5-clue cap, back-compat clues)"
```

---

## Task 9: `sworble-seed.js` — best-effort packing (engine prerequisite; execute BEFORE Task 2's guardrail and Task 3)

**Why:** 30 cells reliably hold only ~7 *pure* theme words (measured: 5–7 pack 20/20 seeds, 8 packs 7/20, 10 packs 0/20). The current `seedClueLetters` is all-or-nothing (null if ANY word fails), so requesting 10 would fail and force junk padding. Best-effort packing places **as many as fit** and reports the **realized** set — matching the spec ("a day may pack fewer than N"). This is the packing sweet spot for a *deduction* daily (fewer, well-woven theme words = better puzzle).

**Files:**
- Modify: `sworble-seed.js` (add `seedClueLettersBestEffort` + to the `API`)
- Test: `tests/sworble-seed.test.js` (extend — the file already imports `Solver` + has `tilesFromLetters` / `expand` helpers)

**Interfaces:**
- Produces: `SworbleSeed.seedClueLettersBestEffort(opts) -> { letters, cluePaths }` where `opts = { clues: string[], cols, rows, rng }`. Greedily places each word (crossing earlier ones via the existing `stampWord` `letters` option), **skipping** any that don't fit instead of returning null. `cluePaths` keys are the **realized** set (words that actually placed). Never returns null (may place zero). Deterministic given `rng` + word order. Dedupes repeated words.
- Consumed by: Task 2 (guardrail) and Task 3 (game seeding).

- [ ] **Step 1: Write the failing test** (append to `tests/sworble-seed.test.js`, before the final `reseedBroken` `console.log` or after it — anywhere in the `seedClueLetters` area)

```js
// best-effort: packs as many as FIT, skips the rest, never null; realized = what placed
{
  const ocean = ['tide','coral','wave','reef','salt','shore','kelp','surf','foam','brine','pearl','shell'];
  const out = Seed.seedClueLettersBestEffort({ clues: ocean, cols: 5, rows: 6, rng: Core.mulberry32(Core.hashSeed('ocean|be')) });
  assert.ok(out, 'best-effort never returns null');
  const realized = Object.keys(out.cluePaths);
  assert.ok(realized.length >= 5, 'packs a healthy number (>=5) of the pool, got ' + realized.length);
  assert.ok(realized.length <= ocean.length, 'never more than the pool');
  const tiles = tilesFromLetters(out.letters, 5, 6);
  for (const w of realized) {
    assert.strictEqual(out.cluePaths[w].map(p => out.letters[p.r + ',' + p.c]).join(''), w, w + ' spelled on its path');
    assert.ok(Solver.findWord(tiles, { word: w, expand, diag: true }), w + ' findable');
  }
  // deterministic
  const out2 = Seed.seedClueLettersBestEffort({ clues: ocean, cols: 5, rows: 6, rng: Core.mulberry32(Core.hashSeed('ocean|be')) });
  assert.deepStrictEqual(out.cluePaths, out2.cluePaths, 'same seed -> same realized packing');
  // over-target: a pool of 12 packs FEWER than 12 (proves it skips, does not choke)
  assert.ok(realized.length < ocean.length, 'a 12-word pool packs fewer than 12 on 30 cells (skips the overflow)');
}
console.log('sworble-seed: seedClueLettersBestEffort passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-seed.test.js`
Expected: FAIL — `Seed.seedClueLettersBestEffort is not a function`.

- [ ] **Step 3: Implement `seedClueLettersBestEffort`** (add to `sworble-seed.js`, near `seedClueLetters`, and to `API`)

```js
  // Best-effort variant of seedClueLetters: greedily place as many clue words as FIT (crossing
  // earlier ones via stampWord's `letters` option), SKIPPING any that don't, instead of the
  // all-or-nothing null. Returns { letters, cluePaths }; cluePaths keys are the REALIZED set.
  // Never null (may place zero). Deterministic given rng + word order.
  function seedClueLettersBestEffort(opts) {
    var clues = opts.clues || [], cols = opts.cols, rows = opts.rows, rng = opts.rng;
    var cells = [];
    for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) cells.push({ r: r, c: c });
    var letters = {}, cluePaths = {};
    for (var i = 0; i < clues.length; i++) {
      var w = String(clues[i]).toLowerCase();
      if (cluePaths[w]) continue; // dedupe
      var path = stampWord(cells, { word: w, rng: rng, letters: letters });
      if (!path) continue; // doesn't fit alongside what's placed — skip it, keep going
      cluePaths[w] = path.map(function (p) { return { r: p.r, c: p.c }; });
      for (var j = 0; j < path.length; j++) { var k = path[j].r + ',' + path[j].c; letters[k] = path[j].letter; }
    }
    return { letters: letters, cluePaths: cluePaths };
  }
```

Add `seedClueLettersBestEffort: seedClueLettersBestEffort,` to the `API` object.

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-seed.test.js`
Expected: all `sworble-seed:` lines print, including `seedClueLettersBestEffort passed`.

- [ ] **Step 5: Commit**

```bash
npm test
git add sworble-seed.js tests/sworble-seed.test.js
git commit -m "feat: seedClueLettersBestEffort — pack as many theme words as fit (realized set)"
```

---

## Task 2: `dailies.json` — pool shape + content guardrail test

**Files:**
- Modify: `dailies.json` (convert entries to `themeWords` pools)
- Create: `tests/dailies-check.js` (validates every day: parses, words in dictionary, pool packs a reasonable count)
- Modify: `package.json` (add the check to the `test` script)

**Interfaces:**
- Consumes: `SworbleDaily.parseEntry`, `SworbleSeed.seedClueLettersBestEffort` (Task 9), `SworbleCore`, `dictionary.txt`.
- Produces: a green guardrail that bad content can never ship.

**CRITICAL — theme words must be ON-THEME.** Every word in a pool is a real theme word that will GLOW and hint the sworb. NEVER pad a pool with filler/utility words ("and", "are", "the", "all") to make packing hit a number — that wrecks the deduction. If fewer pack, that's fine (best-effort). The guardrail below only requires ≥6 pack, which pure short theme words comfortably meet.

- [ ] **Step 1: Convert `dailies.json` to pools (keep today playable) — PURE theme words only**

```json
{
  "2026-07-20": { "sworb": "ocean", "themeWords": ["tide","coral","wave","reef","salt","shore","kelp","surf","foam","brine","pearl","shell","swell","spray","abyss"] },
  "2026-07-21": { "sworb": "kitchen", "themeWords": ["oven","fork","pan","dish","spoon","plate","knife","bowl","whisk","ladle","pot","cup","stove","grill","sink"] }
}
```

(Every word must be lowercase, ON-THEME, and in `dictionary.txt`. If a chosen word is absent from `dictionary.txt`, swap it for a different ON-THEME word that IS present — verify with `grep -x "word" dictionary.txt`. Never substitute a non-theme word.)

- [ ] **Step 2: Write the guardrail test**

```js
// tests/dailies-check.js — content guardrail: every day parses, every theme word is a real
// dictionary word, and a healthy number pack onto the board. Runs in npm test.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Core = require('../sworble-core.js');
const Seed = require('../sworble-seed.js');
const Daily = require('../sworble-daily.js');
const root = path.join(__dirname, '..');
const dailies = JSON.parse(fs.readFileSync(path.join(root, 'dailies.json'), 'utf8'));
const dict = new Set(fs.readFileSync(path.join(root, 'dictionary.txt'), 'utf8').split(/\r?\n/).map(w => w.trim()).filter(Boolean));
let days = 0;
for (const day of Object.keys(dailies)) {
  const e = Daily.parseEntry(dailies, day);
  assert.ok(e, day + ': parses');
  for (const w of e.themeWords) {
    assert.ok(dict.has(w), day + ': theme word "' + w + '" is in dictionary.txt');
    assert.ok(w.length >= 3 && w.length <= 7, day + ': theme word "' + w + '" is 3-7 letters');
  }
  // best-effort packing must land a healthy number of PURE theme words (>=6), or the day is thin.
  // 30 cells hold ~7 pure short words; requiring 6 is comfortably met without any filler padding.
  const rng = Core.mulberry32(Core.hashSeed(day + '|sworb'));
  const out = Seed.seedClueLettersBestEffort({ clues: e.themeWords, cols: 5, rows: 6, rng });
  const realized = Object.keys(out.cluePaths);
  assert.ok(realized.length >= 6, day + ': best-effort packs at least 6 theme words (got ' + realized.length + ')');
  days++;
}
console.log('dailies-check: ' + days + ' days valid');
```

Note: `seedClueLettersBestEffort` takes the option key `clues` (its internal param name); pass the full `themeWords` pool as that value — it packs as many as fit.

- [ ] **Step 3: Run it, fix any failing day**

Run: `node tests/dailies-check.js`
Expected: `dailies-check: 2 days valid`. If a word isn't in the dictionary or the pack fails, edit `dailies.json` and rerun.

- [ ] **Step 4: Add to `package.json` and commit**

Insert `node tests/dailies-check.js && ` immediately before `node tests/mirror-check.js` in the `test` script.

```bash
npm test
git add dailies.json tests/dailies-check.js package.json
git commit -m "content: theme-word pools in dailies.json + placement/dictionary guardrail"
```

---

## Task 3: Density knob + seed up to N + store the realized theme set

**Files:**
- Modify: `index.html` — the dev-flags section (add a `themeTarget` stepper), `newGame()` seeding (`~index.html` search `SworbleSeed.seedClueLetters`), `dailyEntry()` and a new store key.
- Modify: `sworble-store.js` — add `THEME_PREFIX`.
- Test: manual (browser). Determinism already covered by seed tests.

**Interfaces:**
- Consumes: `SworbleDaily.parseEntry` (Task 1), `SworbleSeed.seedClueLettersBestEffort` (Task 9), `SworbleSolver.findWord`.
- Produces: `this._activeTheme` (realized set = the theme words that packed + verified findable), `K.THEME_PREFIX + day` persisting the realized set, and `dailyEntry()` returning the **active themed entry** `{ sworb, themeWords: realizedSet }` used by isClue/status/guess. `this.themeTarget()` returns the dev target (default 8).

- [ ] **Step 1: Add the store key**

In `sworble-store.js`, in the `K` object near `SWORB_PREFIX`:

```js
    THEME_PREFIX: 'sworble_theme_', // per-day realized theme set (words actually seeded on the board): string[]
```

- [ ] **Step 2: Add the dev `themeTarget` knob**

In `index.html`, add an accessor near `dailyEntry()`:

```js
  themeTarget() { const n = parseInt(this.optVal('themeTarget', 8), 10); return (n >= 1 && n <= 20) ? n : 8; } // ~7 pure words is the realistic ceiling on 30 cells; 8 is a good default (best-effort packs what fits)
```

In the render-vals dev-flags area (mirror the existing `tilePoints`/`debugBest` toggles), add a small stepper:

```js
      themeTargetLabel: String(this.themeTarget()),
      themeTargetDec: () => { this.sfxClick(); const opts = { ...(this.state.opts || {}), themeTarget: Math.max(1, this.themeTarget() - 1) }; this.saveOpts(opts); this.setState({ opts }, () => this.newGame(true)); },
      themeTargetInc: () => { this.sfxClick(); const opts = { ...(this.state.opts || {}), themeTarget: Math.min(20, this.themeTarget() + 1) }; this.saveOpts(opts); this.setState({ opts }, () => this.newGame(true)); },
```

And in the dev panel template (inside the `devBoxStyle`/flags block, alongside the existing toggles), add (mirror an existing toggle row's markup):

```html
  <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 0;">
    <div style="font-size:13px; font-weight:700; color:var(--sheet-sub);">THEME WORDS</div>
    <div style="display:flex; align-items:center; gap:12px;">
      <button onClick="{{ themeTargetDec }}" style="background:transparent; border:none; color:var(--sheet-ink); font-size:18px; font-weight:800; cursor:pointer;">&minus;</button>
      <div style="font-size:14px; font-weight:800; color:var(--sheet-ink); min-width:20px; text-align:center;">{{ themeTargetLabel }}</div>
      <button onClick="{{ themeTargetInc }}" style="background:transparent; border:none; color:var(--sheet-ink); font-size:18px; font-weight:800; cursor:pointer;">+</button>
    </div>
  </div>
```

- [ ] **Step 3: Load the pool + seed up to N + store the realized set**

Change the loader `dailyEntry()` split so parseEntry gives the POOL and `dailyEntry()` gives the ACTIVE themed entry. Replace the current `dailyEntry()` with:

```js
  // the day's theme POOL (all curated candidates), parsed once
  themePool() {
    if (typeof SworbleDaily === 'undefined' || !this._dailies) return null;
    return SworbleDaily.parseEntry(this._dailies, this.dailyKey || this.dayKey(new Date()));
  }
  // the ACTIVE themed entry for today: sworb + the REALIZED theme set (words actually on the
  // board). Falls back to the first-N of the pool before a board is seeded (e.g. on home).
  dailyEntry() {
    const pool = this.themePool();
    if (!pool) return null;
    const day = this.dailyKey || this.dayKey(new Date());
    let realized = null;
    try { realized = JSON.parse(LS.getItem(K.THEME_PREFIX + day) || 'null'); } catch (e) {}
    const themeWords = (Array.isArray(realized) && realized.length) ? realized : pool.themeWords.slice(0, this.themeTarget());
    return { sworb: pool.sworb, themeWords };
  }
```

In `newGame()`, at the clue-seeding block (search `SworbleSeed.seedClueLetters` — currently uses `_entry.clues`), switch to **best-effort** packing (packs as many of the target slice as fit; never null), stamp its letters, and STORE the **realized** set (only the words that both packed AND verify findable on the stamped board):

```js
    const _pool = this.themePool();
    if (_pool && this.optVal('dailyMode', true)) {
      const wanted = _pool.themeWords.slice(0, this.themeTarget());
      const byCell = {}; tiles.forEach(t => { byCell[t.row + ',' + t.col] = t; });
      const rng = mulberry32(SworbleCore.hashSeed(this.dailyKey + '|sworb') >>> 0);
      const cand = SworbleSeed.seedClueLettersBestEffort({ clues: wanted, cols: this.cols(), rows: this.rows(), rng });
      Object.keys(cand.letters).forEach(k => { const [r, c] = k.split(',').map(Number); const t = byCell[r + ',' + c]; if (t) t.letter = cand.letters[k]; });
      // realized = the packed words that verify findable on the real board (all should, by construction)
      const realized = Object.keys(cand.cluePaths).filter(w => SworbleSolver.findWord(tiles, { word: w, expand: SworbleCore.expandLetter, diag: this.diag() }));
      if (realized.length) {
        this._activeTheme = realized;
        this._cluePaths = cand.cluePaths;
        try { LS.setItem(K.THEME_PREFIX + this.dailyKey, JSON.stringify(realized)); } catch (e) {}
        try { LS.setItem(K.TARGETS_PREFIX + this.dailyKey, JSON.stringify(realized)); } catch (e) {} // reuse existing found/targets UI
      }
    }
```

Note: best-effort packing is deterministic and never fails, so the old 8-attempt all-or-nothing retry loop is gone. `realized` is the source of truth for the day's theme set (X / N, glow, reward scaling).

Update `ensureDailyTargets()`'s early-return guard to use `this.themePool()` instead of the old `this.dailyEntry()` (so it still defers on a theme day):

```js
    if (this.themePool()) return; // theme day: targets ARE the realized theme words, written at seed time
```

- [ ] **Step 4: Verify in the browser**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
python3 -m http.server 8737 &
```
Open `http://localhost:8737/?cachebust=1`, then in the console:
```js
const c = window.__sworbleSoomerLive; c.newGame(true);
setTimeout(() => {
  const t = c.liveTiles().filter(x => !x.clearing && !x.dead);
  const e = c.dailyEntry();
  console.log('target', c.themeTarget(), 'realized', e.themeWords.length,
    'findable', e.themeWords.map(w => !!SworbleSolver.findWord(t, { word: w, expand: SworbleCore.expandLetter, diag: c.diag() })));
}, 700);
```
Expected: `realized` ≈ the target (or slightly fewer), all `findable` true. Bump the dev stepper (or set `opts.themeTarget`) and re-deal — the count changes and stays findable. Reload → identical board (determinism). Kill the server.

- [ ] **Step 5: Commit**

```bash
git add index.html Sworble.dc.html sworble-store.js
git commit -m "feat: dev themeTarget knob + seed up to N theme words + store the realized set"
```

---

## Task 4: `sworble-status.js` — theme total (realized) + theme-first rank basis

**Files:**
- Modify: `sworble-status.js` (the `sworb` block in `dailyStatus`)
- Test: `tests/sworble-status.test.js` (extend)

**Interfaces:**
- Consumes: `dailyStatus(src)` where `src.sworb = { entry, cluesFound, guessesUsed, solved }` — `entry.themeWords` is now the **realized** theme set.
- Produces: `result.sworb` gains `total = entry.themeWords.length` (was assumed 5) and `rank = { solved, solveTier, themeFound }` where `solveTier` is the `SworbleDaily.guessReward` value banked at solve time (higher = earlier/bolder), `themeFound = foundCount`. `canGuess`/`guessesLeft` unchanged.

- [ ] **Step 1: Write the failing test** (append to `tests/sworble-status.test.js`)

```js
{
  const entry = { sworb: 'ocean', themeWords: ['tide','coral','wave','reef','salt','shore','kelp','surf','foam','brine'] }; // 10 realized
  const base = { done:false, storedDailyBest:0, storedSeven:null, puzzleBest:0, lbMe:null, savedRun:null, live:{active:false,over:false,roundWords:[],tilesCount:0} };
  const on = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: ['tide','wave','kelp'], guessesUsed: 1, solved: false } })).sworb;
  assert.strictEqual(on.total, 10, 'total = realized theme set size (not hardcoded 5)');
  assert.strictEqual(on.foundCount, 3);
  assert.strictEqual(on.rank.solved, false);
  assert.strictEqual(on.rank.themeFound, 3);
  const solved = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: ['tide'], guessesUsed: 1, solved: true, solveTier: 500 } })).sworb;
  assert.strictEqual(solved.rank.solved, true);
  assert.strictEqual(solved.rank.solveTier, 500, 'earliness/boldness tier banked at solve time flows through');
}
console.log('sworble-status: sworb theme-rank passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-status.test.js`
Expected: FAIL — `on.total` is `undefined` (current code reads `sw.entry.clues.length`) and `on.rank` is undefined.

- [ ] **Step 3: Implement — update the `sworb` block in `dailyStatus`**

Find the existing sworb block (`var sw = s.sworb; … sworb = { active: true, total: … }`). Replace the `total` source and add `rank`:

```js
    var sw = s.sworb;
    var sworb;
    if (!sw || !sw.entry) { sworb = { active: false }; }
    else {
      var themeList = sw.entry.themeWords || sw.entry.clues || [];
      var total = themeList.length;
      var foundCount = Array.isArray(sw.cluesFound) ? sw.cluesFound.length : 0;
      var guessesLeft = Math.max(0, 3 - (num(sw.guessesUsed) || 0));
      var solved = !!sw.solved;
      sworb = {
        active: true, total: total, foundCount: foundCount, guessesLeft: guessesLeft, solved: solved,
        canGuess: !solved && guessesLeft > 0,
        rank: { solved: solved, solveTier: num(sw.solveTier) || 0, themeFound: foundCount },
      };
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-status.test.js`
Expected: `sworble-status: sworb theme-rank passed` (plus existing lines).

- [ ] **Step 5: Commit**

```bash
git add sworble-status.js tests/sworble-status.test.js
git commit -m "feat: daily-status reports realized theme total + theme-first rank basis"
```

---

## Task 5: Feed `solveTier` + realized theme into the selector; +50% on theme words

**Files:**
- Modify: `index.html` — the `dailyStatus()` gatherer (the `sworb:` IIFE passed to `SworbleStatus.dailyStatus`), `guessSworb()` (bank the tier), the word-commit path (+50% uses the active theme via `dailyEntry()`).

**Interfaces:**
- Consumes: `this.dailyEntry()` (active themed entry, Task 3), `SworbleDaily.isClue`, `SworbleDaily.guessReward`.
- Produces: the selector receives `sworb.solveTier`; a correct sworb guess banks its reward tier into `SWORB_PREFIX` state; theme-word finds still pay +50% and record into `FOUND_PREFIX`.

- [ ] **Step 1: Bank the solve tier in `guessSworb`**

In `guessSworb(input)`, where a correct guess computes `bonus` and sets `st.solved/correct/bonus`, also store the tier:

```js
      const bonus = SworbleDaily.guessReward(found.length, e.themeWords.length);
      st.solved = true; st.correct = true; st.bonus = bonus; st.solveTier = bonus; // tier == reward value (higher = earlier/bolder)
```

(`e` is `this.dailyEntry()`; it now exposes `themeWords`. If any `e.clues` reference remains in this function, change it to `e.themeWords`.)

- [ ] **Step 2: Feed the selector**

In the `dailyStatus()` gatherer's `sworb:` IIFE, include `solveTier`:

```js
      sworb: (() => {
        const e = this.dailyEntry(); if (!e) return null;
        let found = []; try { found = JSON.parse(LS.getItem(K.FOUND_PREFIX + day) || '[]'); } catch (x) {}
        const st = this.sworbState();
        return { entry: e, cluesFound: found, guessesUsed: st.guessesUsed, solved: st.solved, solveTier: st.solveTier || 0 };
      })(),
```

- [ ] **Step 3: Confirm the +50% commit path uses the active theme**

In the word-commit path, the clue check should read the active themed entry. Ensure it is:

```js
      const _e = this.dailyEntry();
      if (_e && SworbleDaily.isClue(word, _e)) {
        pts = Math.round(pts * 1.5); // +50% theme-word bonus
        // …record into FOUND_PREFIX (unchanged)…
      }
```

`isClue` reads `entry.themeWords` (Task 1), so only the realized theme words glow/bonus.

- [ ] **Step 4: Verify in the browser**

Serve, open `?cachebust=2`, play into the 2026-07-20 board. In the console:
```js
const c = window.__sworbleSoomerLive;
c.guessSworb('ocean');
console.log(c.sworbState(), c.dailyStatus().sworb.rank);
```
Expected: `solved:true`, `solveTier` = the reward (e.g. 500 for a cold read), and `dailyStatus().sworb.rank = { solved:true, solveTier:500, themeFound:<n> }`. Spelling a realized theme word still jumps the score ×1.5 and appears in `sworble_found_2026-07-20`.

- [ ] **Step 5: Commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html
git commit -m "feat: bank sworb solve-tier + feed theme-first rank; +50% keyed to realized theme"
```

---

## Task 6: Remove the word budget — endless daily session

**Files:**
- Modify: `index.html` — the puzzle-mode word-budget gate (`guessesLeft`/`parGuesses`), `dailyDone()`, `boardDown`'s budget guard, and the `timeHudLabel`/`timeText` "WORDS" cell.

**Interfaces:**
- Consumes: nothing new.
- Produces: a daily run with no word cap and no auto-end. `dailyDone()` returns true only when the player is *not currently in a live run for today* (resume-able), never as a hard lock mid-play.

- [ ] **Step 1: Neutralize the budget gate**

In `boardDown(e)`, remove the budget early-return:

```js
    // DELETE this line:
    // if (this.puzzleOn() && (this.state.guessesLeft ?? 1) <= 0) return;
```

Find the word-commit path where `guessesLeft` is decremented on a daily commit and where `over` is set when the budget hits 0; remove the decrement and the budget-driven `over`/round-end. (Search `guessesLeft` in the commit/settle path.) The run must never enter `over` from a spent budget.

- [ ] **Step 2: Repurpose the 4th stat cell**

`timeHudLabel`/`timeText`/`timeValStyle`/`timeKey` drive the 4th HUD cell. On a daily (`puzzleOn()`), it currently shows `WORDS` = remaining budget. Change it to a **words-found count** (a personal stat, counting up), so the cell stays meaningful without a cap:

```js
      timeHudLabel: this.puzzleOn() ? (st.tut ? 'WARMUP' : 'WORDS') : 'TIME',
      timeText: (() => {
        if (this.puzzleOn()) { if (st.tut) return '—'; return String((this.state.roundWords || []).length); } // words found so far (no cap)
        const shown = Math.max(0, Math.ceil(st.timeLeft - (this.timeRoll || 0)));
        return Math.floor(shown / 60) + ':' + String(shown % 60).padStart(2, '0');
      })(),
      timeKey: (this.puzzleOn() && !st.tut) ? ('w' + (this.state.roundWords || []).length) : 'clock',
```

(If `roundWords` is capped/rotated for display elsewhere, use a dedicated `this.wordsFoundToday` counter incremented at each daily commit and read here instead.)

- [ ] **Step 3: Make `dailyDone()` resume-safe (never a mid-play lock)**

`dailyDone()` currently returns true when the budget is spent. Change it to reflect only "the day's run has been explicitly ended/submitted," not a cap. For the prototype, the simplest correct behavior: the daily is never "done" from play — it's always resumable within the day. Set:

```js
  dailyDone() { return false; } // endless daily: never hard-locks; resumes within the day (resets at the next daily)
```

(If a "submit today / lock it in" affordance exists that other code depends on, keep that path but sever the budget-spent trigger. Grep `dailyDone(` to confirm consumers — home swipe/practice gating — behave: home should always offer "resume/play", never "already played".)

- [ ] **Step 4: Verify in the browser**

Serve, open `?cachebust=3`, play the daily. Spell many words (well past 21) — the run keeps going, no "over" screen, the 4th cell counts words up. Leave to home and back — the run resumes. No console errors.

- [ ] **Step 5: Commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html
git commit -m "feat: endless daily — remove the word budget/cap + auto-end; 4th cell counts words found"
```

---

## Task 7: Drop the "seven"; surface theme progress on home + result

**Files:**
- Modify: `index.html` — `homeSeven` render-val + its template (the `today's seven` hero, `homeSeven.has`/`.empty` blocks), the result recap (`prepareRecap`/`missedWords`/the over-screen seven), and the standings/leaderboard score basis that uses the seven total.

**Interfaces:**
- Consumes: `this.dailyStatus().sworb` (theme progress + rank), `this.homeSworb` (already built).
- Produces: home shows **theme progress + sworb** where the seven hero was; the result recap shows the theme recap (theme words found / total + sworb reveal + bonus); nothing computes or displays the "seven."

- [ ] **Step 1: Replace the home seven hero with theme progress**

In the home daily content, the `today's seven` section (`homeSeven.has` / `homeSeven.empty` blocks) shows the 56px total + hero letters + listA/listB. Replace that whole section's *content* with a theme-progress hero driven by `homeSworb` (already computed: `active/solved/word/progressText/bonusText` — extend it if needed with `foundCount`/`total`). Keep the existing `homeSworb` interactive blocks/keyboard (Home mini-keyboard) as the hero. Remove the `homeSeven` render-val computation and its template blocks.

Concretely: delete the `<sc-if value="{{ homeSeven.has }}">` and `<sc-if value="{{ homeSeven.empty }}">` blocks and the `homeSeven:` render-val. Promote the `homeSworb` card to the hero slot (move it above `standings`). Ensure every `{{ homeSeven.* }}` binding is gone from the template (grep `homeSeven`).

- [ ] **Step 2: Theme recap on the result screen**

In `prepareRecap`/the over-screen: the current recap builds "your seven" + "words you missed" (`missedWords`). Replace the seven recap with a theme recap: the realized theme words found vs total (from `dailyStatus().sworb`), plus the sworb reveal + bonus (the existing `sworbReveal*` vals). Remove the seven-specific recap render-vals/template. Keep "words you missed" only if desired as a minor stat (optional; it now solves the real themed board).

- [ ] **Step 3: Standings score basis**

Where the standings/leaderboard uses the seven total as your score (`lbStub`/`homeSeven.total`/the daily-best write), switch the daily's contributed metric to the theme-first basis: solved (bool) + `solveTier` + `themeFound` (from `dailyStatus().sworb.rank`). For the prototype's local leaderboard stub, rank the "you" row by `(solved ? 1 : 0, solveTier, themeFound)` descending. (The fuller standings-screen redesign is Phase 3 — here, just stop using the seven and rank by the theme basis so no `{{ }}` hole or stale seven number remains.)

- [ ] **Step 4: In-game counter/fan scale to N**

The clue-fan + any `X / total` display already read `dailyStatus().sworb.total` (now the realized count). Confirm the clue-fan wraps gracefully for N≈10 (it uses `flexWrap: 'wrap'`). No change expected; verify visually.

- [ ] **Step 5: Verify in the browser (full loop)**

Serve, open `?cachebust=4`. Home: the seven hero is gone; the sworb/theme hero is the headline (blocks + progress); tapping opens the home keyboard. Play the daily: find theme words (glow + counter to N), open the board-morph keyboard, solve the sworb (score + bonus). Result screen: theme recap + reveal, no seven. Reload: state persists. No `{{ }}` holes, no console errors. Grep the console for "never resolved".

- [ ] **Step 6: Commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html
git commit -m "feat: drop the seven — home + result surface theme progress; standings rank theme-first"
```

---

## Task 8: Full-loop verification + determinism

**Files:** none (verification only), plus any fix commits.

- [ ] **Step 1:** `npm test` green (all pure suites + dailies-check + mirror).
- [ ] **Step 2:** Browser: play 2026-07-20 and 2026-07-21 end to end — theme words findable + glow, no cap (spell 25+ words), sworb solve pays the scaled bonus, home shows theme+sworb (no seven), result recap themed. Bump the dev `themeTarget` and confirm density changes live + stays findable.
- [ ] **Step 3:** Determinism: same day → identical board across two fresh loads (same `themeTarget`); `dailyStatus().sworb` identical.
- [ ] **Step 4:** Non-theme day (a date absent from `dailies.json`) plays as a plain daily with no theme UI and no errors.
- [ ] **Step 5:** Commit any fixes.

---

## Notes for the implementer

- **Pool vs realized:** `themePool()` = all curated candidates (from `parseEntry`); `dailyEntry()` = the ACTIVE themed entry whose `themeWords` is the REALIZED set (what actually seeded, stored in `THEME_PREFIX`). Everything that glows/counts/guesses uses `dailyEntry()`, so a pool word that didn't place never counts.
- **`seedClueLetters` option key:** its param is still named `clues` internally — pass the sliced `themeWords` as that value; no engine change.
- **Dev knob is dev-only:** production ships a fixed `themeTarget` default (10). Never let it vary the seed on shipped builds.
- **The "seven" removal spans home, recap, and standings** — keep Phase-1 edits surgical (stop computing/showing/ranking by the seven; show theme+sworb). The standings *screen* redesign is Phase 3.
- **Determinism:** the board is a function of `(dailyKey, themeTarget, attempt)`; keep the attempt-seed derivation identical to today so pinned behavior holds.
- Tuning constants (`REWARD` tiers, ×1.5 theme bonus, default `themeTarget`) are not contracts — change freely.
