# Sworb of the Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily theme layer — 5 clue words seeded onto the board that glow + pay a bonus and teach a hidden "sworb" the player guesses — on top of the existing scoring run, with no backend.

**Architecture:** A new pure module (`sworble-seed.js`) deterministically stamps the day's clue words onto the board as self-avoiding paths and re-stamps any clue broken by play (persistence). A second pure module (`sworble-daily.js`) loads static content, detects clue words, and computes the guess reward. The game wires these into board build, refill, scoring, and the daily-status selector; surfaces render from the selector. Determinism stays intact: everything is a function of (day seed, move sequence), so the server can still replay-verify.

**Tech Stack:** Vanilla ES5-ish browser modules loaded via `<helmet>` `<script src>` + `module.exports` for Node tests. Plain `node:assert` test files run by `npm test`. No framework, no build step.

## Global Constraints

- TDD: write the failing Node test first, watch it fail, implement minimally, watch it pass, commit. Every pure module gets a `tests/<name>.test.js`.
- Pure modules follow the house pattern EXACTLY (see `sworble-core.js`/`sworble-status.js`): `(function(root){ 'use strict'; … root.X = API; if (typeof module !== 'undefined' && module.exports) module.exports = API; })(typeof window !== 'undefined' ? window : globalThis);` — NO DOM, NO storage, NO `this`.
- Determinism contract is sacred: all randomness comes from `SworbleCore.mulberry32(seed)` streams seeded off the day. Never `Math.random()` in daily code. New determinism surfaces get pinned known-value tests.
- Edit `index.html`, then mirror to `Sworble.dc.html`: `cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html`. The `tests/mirror-check.js` in `npm test` enforces this.
- Board geometry: `cols()` = 5, `rows()` = 6 (30 cells). Adjacency is 8-directional (`diag()` true). A tile is `{ id, row, col, letter, color, … }`. The "Qu" tile has `letter: 'q'` and spells `"qu"` via `SworbleCore.expandLetter`.
- Add new modules to the `<helmet>` script list in load order AND to the `npm test` script in `package.json`.
- Stateful helmet modules must guard first-eval-wins (see `sworble-net.js` top) — `sworble-seed.js`/`sworble-daily.js` are stateless, so they need no guard, but must tolerate double-eval (idempotent definition — the house pattern already is).

---

## Phase 1 — Deterministic clue-seeding engine (highest risk, build & prove first)

### Task 1: `SworbleSolver.findWord` — targeted findability check

**Files:**
- Modify: `sworble-solver.js` (add one exported function + to the `API` object)
- Test: `tests/sworble-solver.test.js` (new)

**Interfaces:**
- Produces: `SworbleSolver.findWord(tiles, opts) -> number[] | null` where `opts = { word: string, expand: fn, diag: bool }`. Returns the tile-id path spelling `word` (8-adjacent, no reuse), or `null`. `word` is lowercase, `expand` maps a letter to its spelled chars (`'q'->'qu'`).

- [ ] **Step 1: Write the failing test**

```js
// tests/sworble-solver.test.js
'use strict';
const assert = require('assert');
const S = require('../sworble-solver.js');
const expand = (l) => (l === 'q' ? 'qu' : l);
// 3x3 board:  c a t
//             o d o
//             g x e
const T = [
  { id: 1, row: 0, col: 0, letter: 'c' }, { id: 2, row: 0, col: 1, letter: 'a' }, { id: 3, row: 0, col: 2, letter: 't' },
  { id: 4, row: 1, col: 0, letter: 'o' }, { id: 5, row: 1, col: 1, letter: 'd' }, { id: 6, row: 1, col: 2, letter: 'o' },
  { id: 7, row: 2, col: 0, letter: 'g' }, { id: 8, row: 2, col: 1, letter: 'x' }, { id: 9, row: 2, col: 2, letter: 'e' },
];
const cat = S.findWord(T, { word: 'cat', expand, diag: true });
assert.deepStrictEqual(cat, [1, 2, 3], 'cat spells left-to-right across the top row');
const cod = S.findWord(T, { word: 'cod', expand, diag: true });
assert.deepStrictEqual(cod, [1, 4, 5], 'cod uses c(0,0)->o(1,0)->d(1,1) diagonally');
assert.strictEqual(S.findWord(T, { word: 'zzz', expand, diag: true }), null, 'absent word -> null');
assert.strictEqual(S.findWord(T, { word: 'coo', expand, diag: true }), null, 'only one o adjacent to c; no reuse -> null');
console.log('sworble-solver: findWord passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-solver.test.js`
Expected: FAIL — `TypeError: S.findWord is not a function`.

- [ ] **Step 3: Implement `findWord` in `sworble-solver.js`**

Add before the `var API = …` line:

```js
// Targeted: the tile-id path spelling exactly `word` (8-adjacent, no reuse), or null.
// Used by the clue seeder to VERIFY a placed/stamped word is actually findable.
function findWord(tiles, o) {
  var word = String(o.word || '').toLowerCase(), expand = o.expand, dirs = dirsFor(o.diag);
  if (!word) return null;
  var grid = makeGrid(tiles), found = null;
  function dfs(t, path, str) {
    if (found) return;
    var s2 = str + expand(t.letter);
    if (s2.length > word.length || word.slice(0, s2.length) !== s2) return;
    if (s2 === word) { found = path.concat(t.id); return; }
    var p2 = path.concat(t.id);
    for (var d = 0; d < dirs.length; d++) {
      var n = grid[(t.row + dirs[d][0]) + ',' + (t.col + dirs[d][1])];
      if (n && p2.indexOf(n.id) === -1) dfs(n, p2, s2);
    }
  }
  for (var i = 0; i < tiles.length && !found; i++) dfs(tiles[i], [], '');
  return found;
}
```

Add `findWord: findWord,` to the `API` object.

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-solver.test.js`
Expected: `sworble-solver: findWord passed`.

- [ ] **Step 5: Add to `package.json` test script and commit**

In `package.json` insert `node tests/sworble-solver.test.js && ` before `node tests/mirror-check.js`.

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html  # no-op if index unchanged; keeps mirror green
npm test
git add sworble-solver.js tests/sworble-solver.test.js package.json
git commit -m "feat: SworbleSolver.findWord — targeted board findability check"
```

---

### Task 2: `sworble-seed.js` — stampWord (the core path-walker)

**Files:**
- Create: `sworble-seed.js`
- Test: `tests/sworble-seed.test.js` (new)

**Interfaces:**
- Produces: `SworbleSeed.stampWord(cells, opts) -> {r,c,letter}[] | null` where `cells` is the list of grid cells `{ r, c }` currently available (not reserved), `opts = { word, rng, avoid }`. `rng` is a `() => [0,1)` (a `mulberry32` stream). `avoid` is a `Set` of `"r,c"` keys never to use. Returns the chosen self-avoiding 8-adjacent path as `{r,c,letter}` per position (letters spelling `word`), or `null` if no path fits. Deterministic given `rng`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sworble-seed.test.js
'use strict';
const assert = require('assert');
const Seed = require('../sworble-seed.js');
const Core = require('../sworble-core.js');

function allCells(cols, rows) { const a = []; for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) a.push({ r, c }); return a; }
function adjacent(a, b) { return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) === 1; }

// stampWord lays a connected self-avoiding path spelling the word
{
  const rng = Core.mulberry32(42);
  const path = Seed.stampWord(allCells(5, 6), { word: 'coral', rng });
  assert.ok(path, 'coral fits on a 5x6 grid');
  assert.strictEqual(path.map(p => p.letter).join(''), 'coral');
  assert.strictEqual(path.length, 5);
  for (let i = 1; i < path.length; i++) assert.ok(adjacent(path[i - 1], path[i]), 'each step is 8-adjacent');
  const seen = new Set(path.map(p => p.r + ',' + p.c));
  assert.strictEqual(seen.size, 5, 'no cell reused');
}
// deterministic: same rng seed -> identical path
{
  const p1 = Seed.stampWord(allCells(5, 6), { word: 'coral', rng: Core.mulberry32(42) });
  const p2 = Seed.stampWord(allCells(5, 6), { word: 'coral', rng: Core.mulberry32(42) });
  assert.deepStrictEqual(p1, p2, 'same seed -> same stamp');
}
// avoid: never touches reserved cells
{
  const avoid = new Set(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0']); // reserve column 0
  const path = Seed.stampWord(allCells(5, 6), { word: 'tide', rng: Core.mulberry32(7), avoid });
  assert.ok(path, 'tide still fits avoiding column 0');
  assert.ok(path.every(p => !avoid.has(p.r + ',' + p.c)), 'avoided cells untouched');
}
// impossible: word longer than free cells -> null
{
  const only3 = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
  assert.strictEqual(Seed.stampWord(only3, { word: 'coral', rng: Core.mulberry32(1) }), null);
}
console.log('sworble-seed: stampWord passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-seed.test.js`
Expected: FAIL — `Cannot find module '../sworble-seed.js'`.

- [ ] **Step 3: Create `sworble-seed.js` with `stampWord`**

```js
// sworble-seed.js — pure, deterministic clue-word board seeder. NO DOM, NO storage, NO `this`.
// Stamps a word onto the grid as a self-avoiding 8-adjacent path (used for BOTH the opening
// board and re-stamping a clue broken by play). All randomness is an injected mulberry32 rng
// so the daily is identical for every player. Loaded via <script src> (sets window.SworbleSeed);
// module.exports mirrors it for tests.
(function (root) {
  'use strict';

  var DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  function key(r, c) { return r + ',' + c; }

  // Deterministic Fisher-Yates on a copy, driven by rng.
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // Lay `word` as a self-avoiding 8-adjacent path over `cells` (a list of {r,c}), never using
  // any cell in `avoid` (Set of "r,c"). Returns [{r,c,letter}] or null. Backtracking DFS with
  // rng-shuffled start cells and neighbor order → deterministic given rng, varied across days.
  function stampWord(cells, opts) {
    var word = String(opts.word || '').toLowerCase();
    var rng = opts.rng, avoid = opts.avoid || new Set();
    if (!word) return null;
    var free = {}; // "r,c" -> {r,c} for O(1) neighbor lookup
    for (var i = 0; i < cells.length; i++) { var cc = cells[i]; var fk = key(cc.r, cc.c); if (!avoid.has(fk)) free[fk] = cc; }
    var used = new Set(); // reset per start below; walk() closes over it (function-scoped var)
    function walk(cell, idx) {
      var k = key(cell.r, cell.c);
      used.add(k);
      var here = { r: cell.r, c: cell.c, letter: word[idx] };
      if (idx === word.length - 1) return [here];
      var neigh = [];
      for (var d = 0; d < DIRS.length; d++) {
        var nr = cell.r + DIRS[d][0], nc = cell.c + DIRS[d][1], nk = key(nr, nc);
        if (free[nk] && !used.has(nk)) neigh.push(free[nk]);
      }
      neigh = shuffle(neigh, rng);
      for (var n = 0; n < neigh.length; n++) {
        var rest = walk(neigh[n], idx + 1);
        if (rest) return [here].concat(rest);
      }
      used.delete(k); // backtrack
      return null;
    }
    var starts = shuffle(Object.keys(free).map(function (k2) { return free[k2]; }), rng);
    for (var s = 0; s < starts.length; s++) {
      used = new Set();
      var path = walk(starts[s], 0);
      if (path) return path;
    }
    return null;
  }

  var API = { stampWord: stampWord, _shuffle: shuffle };
  root.SworbleSeed = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

Note: `used` is referenced across `stampWord`/`walk`; declare `var used` in `stampWord` scope and reset it (`used = new Set()`) at the top of each start iteration so backtracking is per-start. Adjust the code so `used` is in `stampWord` scope (the test will catch it if the closure is wrong).

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-seed.test.js`
Expected: `sworble-seed: stampWord passed`.

- [ ] **Step 5: Add to `package.json` and commit**

Insert `node tests/sworble-seed.test.js && ` before `node tests/mirror-check.js` in `package.json`.

```bash
npm test
git add sworble-seed.js tests/sworble-seed.test.js package.json
git commit -m "feat: sworble-seed.stampWord — deterministic self-avoiding word placement"
```

---

### Task 3: `sworble-seed.js` — seedClueLetters (place all clues + report grid)

**Files:**
- Modify: `sworble-seed.js`
- Test: `tests/sworble-seed.test.js` (extend)

**Interfaces:**
- Produces: `SworbleSeed.seedClueLetters(opts) -> { letters, cluePaths } | null` where `opts = { clues: string[], cols, rows, rng }`. `letters` is a `Map`/object `"r,c" -> letter` for cells a clue occupies (others absent → caller fills from the bag). `cluePaths` is `{ word: [{r,c}] }`. Places clues in order on DISJOINT cells (each clue's cells added to the running `avoid`). Returns `null` if any clue can't be placed (caller reseeds).

- [ ] **Step 1: Write the failing test** (append to `tests/sworble-seed.test.js`)

```js
{
  const out = Seed.seedClueLetters({ clues: ['tide', 'coral', 'wave', 'reef', 'salt'], cols: 5, rows: 6, rng: Core.mulberry32(Core.hashSeed('2026-07-21')) });
  assert.ok(out, '5 short clues fit on 5x6');
  const occupied = Object.keys(out.letters);
  const wordLen = 'tide'.length + 'coral'.length + 'wave'.length + 'reef'.length + 'salt'.length;
  assert.strictEqual(occupied.length, wordLen, 'clues occupy disjoint cells (no overlap)');
  assert.strictEqual(new Set(occupied).size, occupied.length, 'no cell shared between clues');
  for (const w of ['tide', 'coral', 'wave', 'reef', 'salt']) {
    assert.strictEqual(out.cluePaths[w].map(p => out.letters[p.r + ',' + p.c]).join(''), w, w + ' letters land on its path');
  }
  // deterministic
  const out2 = Seed.seedClueLetters({ clues: ['tide', 'coral', 'wave', 'reef', 'salt'], cols: 5, rows: 6, rng: Core.mulberry32(Core.hashSeed('2026-07-21')) });
  assert.deepStrictEqual(out.cluePaths, out2.cluePaths, 'same seed -> same placement');
  // over-packed -> null (six 5-letter words = 30 cells, no room for disjoint self-avoiding paths in practice)
  const tooMany = Seed.seedClueLetters({ clues: ['aaaaa','bbbbb','ccccc','ddddd','eeeee','fffff','ggggg'], cols: 5, rows: 6, rng: Core.mulberry32(1) });
  assert.strictEqual(tooMany, null, 'impossible pack -> null so caller reseeds/rejects');
}
console.log('sworble-seed: seedClueLetters passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-seed.test.js`
Expected: FAIL — `Seed.seedClueLetters is not a function`.

- [ ] **Step 3: Implement `seedClueLetters`** (add to `sworble-seed.js`, export it)

```js
function seedClueLetters(opts) {
  var clues = opts.clues || [], cols = opts.cols, rows = opts.rows, rng = opts.rng;
  var cells = [];
  for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) cells.push({ r: r, c: c });
  var avoid = new Set(), letters = {}, cluePaths = {};
  for (var i = 0; i < clues.length; i++) {
    var w = String(clues[i]).toLowerCase();
    var path = stampWord(cells, { word: w, rng: rng, avoid: avoid });
    if (!path) return null;
    cluePaths[w] = path.map(function (p) { return { r: p.r, c: p.c }; });
    for (var j = 0; j < path.length; j++) { var k = path[j].r + ',' + path[j].c; letters[k] = path[j].letter; avoid.add(k); }
  }
  return { letters: letters, cluePaths: cluePaths };
}
```

Add `seedClueLetters: seedClueLetters,` to `API`.

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-seed.test.js`
Expected: both `sworble-seed:` lines print.

- [ ] **Step 5: Commit**

```bash
npm test
git add sworble-seed.js tests/sworble-seed.test.js
git commit -m "feat: sworble-seed.seedClueLetters — place all clue words on disjoint paths"
```

---

### Task 4: `sworble-seed.js` — reseedBroken (persistence: re-stamp a clue broken by play)

**Files:**
- Modify: `sworble-seed.js`
- Test: `tests/sworble-seed.test.js` (extend)

**Interfaces:**
- Produces: `SworbleSeed.reseedBroken(opts) -> { r, c, letter }[]` where `opts = { tiles, unfound: string[], isFindable: (word)=>bool, rng, reserve: Set<"r,c"> }`. For each `unfound` clue where `isFindable(word)` is false, re-stamp it onto the CURRENT board's cells (overwriting existing letters, avoiding `reserve` + other unfound clues' chosen cells this pass) and collect `{r,c,letter}` changes. Returns the flat list of cell letter changes to apply (empty if nothing broken). Pure: `isFindable` is injected (game passes a `SworbleSolver.findWord`-backed predicate); `tiles` are `{row,col,letter}`.

- [ ] **Step 1: Write the failing test** (append)

```js
{
  // 5x6 grid, all 'x' except a broken clue. Every clue is "unfindable" per the stub predicate,
  // so reseedBroken must stamp each requested word somewhere and report the letter changes.
  const tiles = [];
  for (let c = 0; c < 5; c++) for (let r = 0; r < 6; r++) tiles.push({ row: r, col: c, letter: 'x' });
  const changes = Seed.reseedBroken({
    tiles, unfound: ['wave'], isFindable: () => false, rng: Core.mulberry32(3), reserve: new Set(),
  });
  assert.strictEqual(changes.length, 4, 'wave (4 letters) re-stamped');
  // applying the changes makes wave spell out on a connected path
  const by = {}; changes.forEach(ch => { by[ch.r + ',' + ch.c] = ch.letter; });
  assert.strictEqual(changes.map(c => c.letter).join(''), 'wave');
  for (let i = 1; i < changes.length; i++) assert.ok(Math.max(Math.abs(changes[i-1].r-changes[i].r), Math.abs(changes[i-1].c-changes[i].c)) === 1, 'connected');
  // nothing broken -> no changes
  assert.deepStrictEqual(Seed.reseedBroken({ tiles, unfound: ['wave'], isFindable: () => true, rng: Core.mulberry32(3), reserve: new Set() }), []);
}
console.log('sworble-seed: reseedBroken passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-seed.test.js`
Expected: FAIL — `Seed.reseedBroken is not a function`.

- [ ] **Step 3: Implement `reseedBroken`**

```js
function reseedBroken(opts) {
  var tiles = opts.tiles || [], unfound = opts.unfound || [], isFindable = opts.isFindable, rng = opts.rng;
  var reserve = opts.reserve || new Set();
  var cells = tiles.map(function (t) { return { r: t.row, c: t.col }; });
  var avoid = new Set(reserve), changes = [];
  for (var i = 0; i < unfound.length; i++) {
    var w = String(unfound[i]).toLowerCase();
    if (isFindable(w)) { // still on the board — keep its cells reserved so we don't clobber it
      continue;
    }
    var path = stampWord(cells, { word: w, rng: rng, avoid: avoid });
    if (!path) continue; // no room this pass; a later settle retries
    for (var j = 0; j < path.length; j++) {
      var k = path[j].r + ',' + path[j].c;
      changes.push({ r: path[j].r, c: path[j].c, letter: path[j].letter });
      avoid.add(k);
    }
  }
  return changes;
}
```

Add `reseedBroken: reseedBroken,` to `API`.

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-seed.test.js`
Expected: all three `sworble-seed:` lines print.

- [ ] **Step 5: Commit**

```bash
npm test
git add sworble-seed.js tests/sworble-seed.test.js
git commit -m "feat: sworble-seed.reseedBroken — persistence re-stamp for broken clue words"
```

---

## Phase 2 — `sworble-daily.js` content + guess module

### Task 5: `sworble-daily.js` — parseEntry, isClue, checkGuess, guessReward

**Files:**
- Create: `sworble-daily.js`
- Test: `tests/sworble-daily.test.js` (new)

**Interfaces:**
- Produces:
  - `SworbleDaily.parseEntry(dailies, day) -> { sworb, clues } | null` — validates one day's entry (sworb non-empty string; clues = array of 1–5 lowercase words); null on missing/malformed (game falls back to a plain daily).
  - `SworbleDaily.isClue(word, entry) -> bool` — case-insensitive membership in `entry.clues`.
  - `SworbleDaily.checkGuess(input, entry) -> bool` — normalized (trim/lowercase/strip non-alpha) equality to `entry.sworb`.
  - `SworbleDaily.guessReward(cluesFound, total) -> number` — inverse-scaling bonus tier. Tiers (tuning constants, documented in the file): `cluesFound===0 -> 500`, `1-2 -> 350`, `3-4 -> 200`, `>=total -> 75`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sworble-daily.test.js
'use strict';
const assert = require('assert');
const D = require('../sworble-daily.js');
const dailies = { '2026-07-21': { sworb: 'ocean', clues: ['tide', 'coral', 'wave', 'reef', 'salt'] } };

const e = D.parseEntry(dailies, '2026-07-21');
assert.deepStrictEqual(e, { sworb: 'ocean', clues: ['tide', 'coral', 'wave', 'reef', 'salt'] });
assert.strictEqual(D.parseEntry(dailies, '2026-07-22'), null, 'missing day -> null');
assert.strictEqual(D.parseEntry({ '2026-07-21': { sworb: '', clues: [] } }, '2026-07-21'), null, 'empty -> null');
assert.strictEqual(D.parseEntry({ '2026-07-21': { sworb: 'x', clues: 'nope' } }, '2026-07-21'), null, 'bad clues -> null');

assert.strictEqual(D.isClue('TIDE', e), true);
assert.strictEqual(D.isClue('shore', e), false);

assert.strictEqual(D.checkGuess('  Ocean! ', e), true, 'normalized match');
assert.strictEqual(D.checkGuess('sea', e), false);

assert.strictEqual(D.guessReward(0, 5), 500, 'cold read = jackpot');
assert.strictEqual(D.guessReward(2, 5), 350);
assert.strictEqual(D.guessReward(4, 5), 200);
assert.strictEqual(D.guessReward(5, 5), 75, 'all clues found = gimme');
console.log('sworble-daily: all passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-daily.test.js`
Expected: FAIL — `Cannot find module '../sworble-daily.js'`.

- [ ] **Step 3: Create `sworble-daily.js`**

```js
// sworble-daily.js — pure "sworb of the day" content + guess logic. NO DOM, NO storage, NO `this`.
// Loaded via <script src> (sets window.SworbleDaily); module.exports mirrors it for tests.
(function (root) {
  'use strict';

  // Reward tiers for a correct sworb guess, scaled INVERSELY by clues found at guess time
  // (bold cold-read pays most; guessing after finding everything pays least). Tuning constants.
  var REWARD = { none: 500, few: 350, most: 200, all: 75 };

  function parseEntry(dailies, day) {
    if (!dailies || typeof dailies !== 'object') return null;
    var e = dailies[day];
    if (!e || typeof e !== 'object') return null;
    var sworb = typeof e.sworb === 'string' ? e.sworb.trim().toLowerCase() : '';
    if (!sworb) return null;
    if (!Array.isArray(e.clues) || !e.clues.length || e.clues.length > 5) return null;
    var clues = [];
    for (var i = 0; i < e.clues.length; i++) {
      var w = typeof e.clues[i] === 'string' ? e.clues[i].trim().toLowerCase() : '';
      if (!w) return null;
      clues.push(w);
    }
    return { sworb: sworb, clues: clues };
  }

  function isClue(word, entry) {
    if (!entry || !word) return false;
    var w = String(word).toLowerCase();
    return entry.clues.indexOf(w) >= 0;
  }

  function normalize(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function checkGuess(input, entry) { return !!entry && normalize(input) === entry.sworb; }

  function guessReward(cluesFound, total) {
    if (cluesFound <= 0) return REWARD.none;
    if (cluesFound >= total) return REWARD.all;
    if (cluesFound <= 2) return REWARD.few;
    return REWARD.most;
  }

  var API = { parseEntry: parseEntry, isClue: isClue, checkGuess: checkGuess, guessReward: guessReward, REWARD: REWARD };
  root.SworbleDaily = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-daily.test.js`
Expected: `sworble-daily: all passed`.

- [ ] **Step 5: Add to `package.json` and commit**

Insert `node tests/sworble-daily.test.js && ` before `node tests/mirror-check.js`.

```bash
npm test
git add sworble-daily.js tests/sworble-daily.test.js package.json
git commit -m "feat: sworble-daily — content parse, clue detection, guess check + scaled reward"
```

---

### Task 6: Sworb status in the daily-status selector

**Files:**
- Modify: `sworble-status.js` (add a `sworb` block to `dailyStatus`)
- Test: `tests/sworble-status.test.js` (extend)

**Interfaces:**
- Consumes: `dailyStatus(src)` gains an optional `src.sworb = { entry, cluesFound (string[]), guessesUsed, solved }`.
- Produces: `dailyStatus(...)` result gains `.sworb = { active, total, foundCount, guessesLeft, solved, canGuess }` (or `{ active: false }` when no `src.sworb.entry`). `guessesLeft = max(0, 3 - guessesUsed)`; `canGuess = active && !solved && guessesLeft > 0`.

- [ ] **Step 1: Write the failing test** (append to `tests/sworble-status.test.js`)

```js
{
  const entry = { sworb: 'ocean', clues: ['tide','coral','wave','reef','salt'] };
  const base = { done:false, storedDailyBest:0, storedSeven:null, puzzleBest:0, lbMe:null, savedRun:null, live:{active:false,over:false,roundWords:[],tilesCount:0} };
  const off = S.dailyStatus(base).sworb;
  assert.deepStrictEqual(off, { active: false }, 'no sworb src -> inactive');
  const on = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: ['tide','wave'], guessesUsed: 1, solved: false } })).sworb;
  assert.strictEqual(on.active, true);
  assert.strictEqual(on.total, 5);
  assert.strictEqual(on.foundCount, 2);
  assert.strictEqual(on.guessesLeft, 2);
  assert.strictEqual(on.solved, false);
  assert.strictEqual(on.canGuess, true);
  const solved = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: ['tide'], guessesUsed: 1, solved: true } })).sworb;
  assert.strictEqual(solved.canGuess, false, 'solved -> cannot guess');
  const spent = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: [], guessesUsed: 3, solved: false } })).sworb;
  assert.strictEqual(spent.guessesLeft, 0);
  assert.strictEqual(spent.canGuess, false, 'no guesses left -> cannot guess');
}
console.log('sworble-status: sworb block passed');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/sworble-status.test.js`
Expected: FAIL — `on` is `undefined` (no `.sworb` on result).

- [ ] **Step 3: Implement the sworb block in `dailyStatus`**

In `sworble-status.js`, before `return { played … }`, add:

```js
    var sw = s.sworb;
    var sworb;
    if (!sw || !sw.entry) { sworb = { active: false }; }
    else {
      var total = sw.entry.clues.length;
      var foundCount = Array.isArray(sw.cluesFound) ? sw.cluesFound.length : 0;
      var guessesLeft = Math.max(0, 3 - (num(sw.guessesUsed) || 0));
      var solved = !!sw.solved;
      sworb = { active: true, total: total, foundCount: foundCount, guessesLeft: guessesLeft, solved: solved, canGuess: !solved && guessesLeft > 0 };
    }
```

Add `sworb: sworb,` to the returned object.

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/sworble-status.test.js`
Expected: `sworble-status: sworb block passed` (plus the existing lines).

- [ ] **Step 5: Commit**

```bash
npm test
git add sworble-status.js tests/sworble-status.test.js
git commit -m "feat: daily-status selector reports sworb progress (one source for every surface)"
```

---

## Phase 2.5 — Remove the dead par-bot (cleanup, decided mid-execution)

### Task 7.5: Remove the par bot and simplify its consumers

**Why:** the game is player-vs-player (your Sworble Seven total ranks you on the standings/
leaderboard). "Par for the course" was scrapped; the headless par bot (`simDaily`) is its
ghost. It also actively breaks the sworb feature: it replays the UNSEEDED board, so on a
sworb day the "words you missed" recap would list words that aren't on the board you played.
Removing it fixes that recap for free (the recap's existing non-par branch solves the REAL
opening board). The result screen's rich rank ladder is already leaderboard-driven — par only
gates it and supplies one first-run chip.

**Files:**
- Modify: `index.html` (delete par methods; simplify 4 consumers), then mirror to `Sworble.dc.html`.
- Modify: `sworble-store.js` (the `restartDaily` clear list references `K.PUZZLE_PAR_PREFIX`; leaving the key defined is fine, but stop writing/reading it).

**No new Node test** (monolith UI). Verify in the browser.

- [ ] **Step 1: Find every par reference**

Run: `grep -n "puzzlePar\|ensurePuzzlePar\|simDaily\|PUZZLE_PAR\|_parBusy\|_parClock\|par\.bot\|par\.gold\|par\.words\|par\.bronze\|par\.silver\|parV\|botFind" index.html`
Expected sites: the three methods (`ensurePuzzlePar`, `puzzlePar`, `simDaily`), two `ensurePuzzlePar()` call sites (in `componentDidMount` and a settings/restart path), `overParVals` (`parV`), `prepareRecap`/`missedWords` (`par.words`), `lbStub` (`par.bot`), the home `bench` (`par.gold`), and `_parClock`/`_parBusy` lifecycle bits.

- [ ] **Step 2: Delete the par methods**

Delete `ensurePuzzlePar()`, `puzzlePar()`, and `simDaily(day)` in full. Delete both `ensurePuzzlePar()` call sites. Delete the `_parClock` interval setup + its `clearInterval` in `componentWillUnmount`, and any `_parBusy` references.

- [ ] **Step 3: `overParVals` — drop the par gate + chip**

Change the guard from `if (!puz || !dailyOn || !parV) return {...classicOverShow...}` to `if (!puz || !dailyOn) return {...classicOverShow...}` (keep every returned key that the guard object already has, unchanged — `parOverShow`, `classicOverShow`, `tierRailShow`, `overTierShow`, `botFindShow`, `homePuzzleShow`). Delete the `const par = …`, `const parV = …`, and `const dT = …` lines. Replace the first-run chip:

```js
        if (firstRun) { good = true; chip = total > 1 ? ('you’re #' + fmt(rank) + ' of ' + fmt(total)) : 'you’re on the board'; }
```

(Everything else in `overParVals` — rank, tiers, podium, confetti — is leaderboard-driven and stays.) Ensure `botFindShow` remains returned as `false` in the main return path if it was only ever true via par; grep the template for `{{ botFind` and `{{ tierRail`/`{{ overTier` and set those keys to `false`/empty in the returned object so no `{{ }}` hole appears.

- [ ] **Step 4: `missedWords` — always solve the real board**

In `prepareRecap`, replace the puzzle branch that reads `par.words` with the opening-board solve used by the fallback: `missed = this.topWords(this.openingSnapshot, 3, [...played]);` for all daily runs. Delete the `const par = this.puzzlePar()` line there.

- [ ] **Step 5: `lbStub` — drop the par anchor**

Remove `const par = this.puzzleOn() ? this.puzzlePar() : null;` and the `if (par && par.bot) sc = …` branch; keep the existing non-par puzzle formula (`sc = Math.round(1200 + Math.pow(rnd(), 1.7) * 3200)`) as the only path.

- [ ] **Step 6: home `bench` — drop the par fallback**

Remove the `if (!bench) { … par.gold … }` line in the home bench computation.

- [ ] **Step 7: Verify in the browser**

Serve, play a daily run to the result screen: confirm the rank ladder still shows (NOT the bare classic card), first-run shows the rank/"on the board" chip, "words you missed" lists real board words, home renders, no `{{ }}` holes, no console errors. Reload — no errors from missing par.

- [ ] **Step 8: Mirror, test, commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html sworble-store.js
git commit -m "refactor: remove the dead par bot (game is player-vs-player; recap now uses the real board)"
```

---

## Phase 3 — Game wiring (board, scoring, state)

### Task 7: Store keys + content file + loader

**Files:**
- Modify: `sworble-store.js` (register keys)
- Create: `dailies.json` (seed content — a few days for now; full authoring is Task 12)
- Modify: `index.html` (`<helmet>` script tags for `sworble-seed.js`, `sworble-daily.js`; a `loadDailies()` fetch; `this.dailyEntry()` accessor)
- Test: manual (browser) — covered by Task 11's verification; no new Node test (loader is I/O).

**Interfaces:**
- Produces: `K.SWORB_PREFIX = 'sworble_sworb_'` (per-day state blob `{ guessesUsed, solved, correct, bonus, found: string[] }`) and reuse of existing `K.TARGETS_PREFIX` / `K.FOUND_PREFIX` for clue words. `this.dailyEntry()` returns the parsed entry for today (or null). `this._dailies` holds the loaded JSON.

- [ ] **Step 1: Add keys to `sworble-store.js`**

In the `K` object, after `RUN_PREFIX`:

```js
    SWORB_PREFIX: 'sworble_sworb_', // per-day sworb state: { guessesUsed, solved, correct, bonus, found:[] }
```

- [ ] **Step 2: Create `dailies.json` (starter — today + a couple ahead)**

```json
{
  "2026-07-20": { "sworb": "ocean", "clues": ["tide", "coral", "wave", "reef", "salt"] },
  "2026-07-21": { "sworb": "kitchen", "clues": ["oven", "fork", "pan", "dish", "spoon"] }
}
```

- [ ] **Step 3: Add script tags + loader + accessor to `index.html`**

In `<helmet>`, add after the `sworble-status.js` line (before `sworble-net.js`):

```html
  <script src="./sworble-seed.js"></script>
  <script src="./sworble-daily.js"></script>
```

In `componentDidMount`, near `this.loadDict();`, add `this.loadDailies();`. Add the methods (near `loadDict`):

```js
  async loadDailies() {
    try { const r = await fetch('./dailies.json'); if (r.ok) { this._dailies = await r.json(); this.forceUpdate(); } } catch (e) { this._dailies = null; }
  }
  dailyEntry() {
    if (typeof SworbleDaily === 'undefined' || !this._dailies) return null;
    return SworbleDaily.parseEntry(this._dailies, this.dailyKey || this.dayKey(new Date()));
  }
```

- [ ] **Step 4: Verify load in the browser**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
python3 -m http.server 8737 &
```
Open `http://localhost:8737/`, in console: `window.__sworbleSoomerLive.dailyEntry()` → `{ sworb: 'ocean', clues: [...] }` for 2026-07-20. Kill the server.

- [ ] **Step 5: Commit**

```bash
git add sworble-store.js dailies.json index.html Sworble.dc.html
git commit -m "feat: sworb content file + loader + store keys"
```

---

### Task 8: Seed clue words onto the opening board

**Files:**
- Modify: `index.html` — `newGame()` daily branch (the board-fill loop at ~`index.html:1908-1918`, after `dealt`/`tiles` are built and before `scrubTiles`) and `ensureDailyTargets()` (`~index.html:3644`)
- Test: manual browser verification (determinism covered by seed tests already; findability asserted live).

**Interfaces:**
- Consumes: `SworbleSeed.seedClueLetters`, `SworbleSolver.findWord`, `this.dailyEntry()`.
- Produces: on a sworb day, the opening board's tiles include the 5 clue words (verified findable); `this._cluePaths` cached; `K.TARGETS_PREFIX + day` written as the clue list (so the existing found/targets UI reuses them) INSTEAD of the solver-derived top-5.

- [ ] **Step 1: In `newGame()`, after the board `tiles` array is built (post neighbor-deal loop, before `scrubTiles`), overwrite clue cells on a sworb day**

```js
    // SWORB day: stamp the 5 clue words onto the opening board (guaranteed findable).
    // Mutate tile letters in place, verify all clues findable, revert + reseed on failure.
    const _entry = this.dailyEntry();
    if (_entry && this.optVal('dailyMode', true)) {
      const byCell = {}; tiles.forEach(t => { byCell[t.row + ',' + t.col] = t; });
      let placed = null;
      for (let attempt = 0; attempt < 8 && !placed; attempt++) {
        const rng = mulberry32((SworbleCore.hashSeed(this.dailyKey + '|sworb') ^ (attempt * 0x9E3779B1)) >>> 0);
        const cand = SworbleSeed.seedClueLetters({ clues: _entry.clues, cols: this.cols(), rows: this.rows(), rng });
        if (!cand) continue;
        const reverts = [];
        Object.keys(cand.letters).forEach(k => { const [r, c] = k.split(',').map(Number); const t = byCell[r + ',' + c]; if (t) { reverts.push([t, t.letter]); t.letter = cand.letters[k]; } });
        const ok = _entry.clues.every(w => SworbleSolver.findWord(tiles, { word: w, expand: SworbleCore.expandLetter, diag: this.diag() }));
        if (ok) { placed = cand; this._cluePaths = cand.cluePaths; }
        else { reverts.forEach(([t, l]) => { t.letter = l; }); } // revert, retry with next seed
      }
      if (placed) { try { LS.setItem(K.TARGETS_PREFIX + this.dailyKey, JSON.stringify(_entry.clues)); } catch (e) {} }
    }
```

- [ ] **Step 2: Make `ensureDailyTargets()` defer to clue words on a sworb day**

At the top of `ensureDailyTargets()`, after the guard, add:

```js
    if (this.dailyEntry()) return; // sworb day: targets ARE the clue words, written at seed time
```

- [ ] **Step 3: Verify in the browser**

Serve, open 2026-07-20, swipe into a game. In console:
```js
const c = window.__sworbleSoomerLive;
c.dailyEntry().clues.map(w => !!SworbleSolver.findWord(c.liveTiles(), { word: w, expand: SworbleCore.expandLetter, diag: c.diag() }));
```
Expected: `[true, true, true, true, true]` — all 5 clues findable on the opening board. Reload; confirm identical board (determinism).

- [ ] **Step 4: Commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html
git commit -m "feat: seed the day's clue words onto the opening board (verified findable)"
```

---

### Task 9: Clue bonus on commit + found tracking + persistence hook

**Files:**
- Modify: `index.html` — the word-commit path (`~index.html:3200-3230`, where `nextRoundWords` is built and `pts` finalized) and the refill settle (`refillBoard`/`removeAndSettle` completion, `~index.html:3458-3488`).

**Interfaces:**
- Consumes: `SworbleDaily.isClue`, `this.dailyEntry()`, `this._cluePaths`, `SworbleSeed.reseedBroken`, `SworbleSolver.findWord`.
- Produces: a matched clue word pays +50% and is recorded in `K.FOUND_PREFIX + day`; after each settle, broken unfound clues are re-stamped so all stay findable.

- [ ] **Step 1: Clue bonus + found-record at commit**

In the commit path, immediately before `const nextRoundWords = …`, compute a clue multiplier and record the find:

```js
      const _e = this.dailyEntry();
      if (_e && SworbleDaily.isClue(word, _e)) {
        pts = Math.round(pts * 1.5); // +50% clue bonus
        try {
          const fk = K.FOUND_PREFIX + (this.dailyKey || this.dayKey(new Date()));
          const found = JSON.parse(LS.getItem(fk) || '[]');
          if (found.indexOf(word.toLowerCase()) < 0) { found.push(word.toLowerCase()); LS.setItem(fk, JSON.stringify(found)); }
        } catch (e) {}
        this._clueJustFound = word.toLowerCase(); // surfaces read this for the glow (Task 10)
      }
```

(`pts` is the finalized points variable in that scope; apply the ×1.5 before it enters `nextRoundWords` and the score.)

- [ ] **Step 2: Persistence — re-stamp broken clues after settle**

In `refillBoard()`, after the new tiles are added and state is set (end of the method, after the landing `setState`), add a deferred reseed pass:

```js
    this.later(() => this._persistClues(), 60);
```

Add the method:

```js
  _persistClues() {
    const e = this.dailyEntry();
    if (!e || this.state.over) return;
    let found = []; try { found = JSON.parse(LS.getItem(K.FOUND_PREFIX + this.dailyKey) || '[]'); } catch (err) {}
    const unfound = e.clues.filter(w => found.indexOf(w) < 0);
    if (!unfound.length) return;
    const live = this.liveTiles().filter(t => !t.clearing && !t.dead);
    const isFindable = (w) => !!SworbleSolver.findWord(live, { word: w, expand: SworbleCore.expandLetter, diag: this.diag() });
    const rng = mulberry32((SworbleCore.hashSeed(this.dailyKey + '|persist') ^ (this.tileSeq * 2654435761)) >>> 0);
    const changes = SworbleSeed.reseedBroken({ tiles: live, unfound, isFindable, rng, reserve: new Set() });
    if (!changes.length) return;
    const byCell = {}; changes.forEach(ch => { byCell[ch.r + ',' + ch.c] = ch.letter; });
    this.setState(s => ({ tiles: s.tiles.map(t => (byCell[t.row + ',' + t.col] != null && !t.clearing) ? { ...t, letter: byCell[t.row + ',' + t.col] } : t) }));
  }
```

- [ ] **Step 3: Verify in the browser**

Serve, play the 2026-07-20 board. Find a clue word (e.g. spell one of today's 5) → score jumps (×1.5) and it appears in `JSON.parse(localStorage.getItem('sworble_found_2026-07-20'))`. Clear several non-clue words; after settles, re-check all clues remain findable (rerun the Task 8 findability snippet) — expect all unfound clues still `true`.

- [ ] **Step 4: Commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html
git commit -m "feat: clue +50% bonus, found tracking, and clue persistence across drops"
```

---

### Task 10: Guess flow + state, wired through the selector

**Files:**
- Modify: `index.html` — a `sworbState()`/`saveSworb()` pair, a `guessSworb(input)` action, and the `dailyStatus()` gatherer (Task 6 added the selector block; here we feed it).

**Interfaces:**
- Consumes: `SworbleDaily.checkGuess`, `SworbleDaily.guessReward`, the selector's `src.sworb`.
- Produces: `guessSworb(input)` records a guess, awards the scaled bonus on a correct guess (added to today's score), locks on solve/exhaustion; `this.dailyStatus()` passes `sworb` into the selector so every surface sees progress.

- [ ] **Step 1: sworb state helpers + feed the selector**

```js
  sworbState() {
    const d = this.dailyKey || this.dayKey(new Date());
    try { return JSON.parse(LS.getItem(K.SWORB_PREFIX + d) || 'null') || { guessesUsed: 0, solved: false, correct: false, bonus: 0 }; }
    catch (e) { return { guessesUsed: 0, solved: false, correct: false, bonus: 0 }; }
  }
  saveSworb(st) { try { LS.setItem(K.SWORB_PREFIX + (this.dailyKey || this.dayKey(new Date())), JSON.stringify(st)); } catch (e) {} }
```

In `dailyStatus()` (the gatherer added in the Soomer work), add to the object passed to `SworbleStatus.dailyStatus`:

```js
      sworb: (() => {
        const e = this.dailyEntry(); if (!e) return null;
        let found = []; try { found = JSON.parse(LS.getItem(K.FOUND_PREFIX + day) || '[]'); } catch (x) {}
        const st = this.sworbState();
        return { entry: e, cluesFound: found, guessesUsed: st.guessesUsed, solved: st.solved };
      })(),
```

- [ ] **Step 2: the guess action**

```js
  guessSworb(input) {
    const e = this.dailyEntry(); if (!e) return { ok: false };
    const st = this.sworbState();
    if (st.solved || st.guessesUsed >= 3) return { ok: false, done: true };
    const correct = SworbleDaily.checkGuess(input, e);
    st.guessesUsed += 1;
    if (correct) {
      let found = []; try { found = JSON.parse(LS.getItem(K.FOUND_PREFIX + this.dailyKey) || '[]'); } catch (x) {}
      const bonus = SworbleDaily.guessReward(found.length, e.clues.length);
      st.solved = true; st.correct = true; st.bonus = bonus;
      // DECIDED mid-execution: the guess bonus rides today's competitive score (there is no
      // par target to distort — ranking is player-vs-player, so solving the sworb helps you
      // climb, which is the point). It flows into the Seven total like any other points.
      this.setState(s => ({ score: (s.score || 0) + bonus })); // sworb bonus rides today's score
      this.sfxWin && this.sfxWin();
    } else {
      this.sfxBad && this.sfxBad();
    }
    this.saveSworb(st);
    this.forceUpdate();
    return { ok: true, correct, guessesLeft: Math.max(0, 3 - st.guessesUsed), bonus: st.bonus };
  }
```

- [ ] **Step 3: Verify in the browser**

Console on the 2026-07-20 game: `window.__sworbleSoomerLive.guessSworb('ocean')` → `{ ok:true, correct:true, bonus:500|350|… }`, score jumps by the bonus, and `dailyStatus().sworb.solved === true`. A second guess returns `{ ok:false, done:true }`.

- [ ] **Step 4: Commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html
git commit -m "feat: sworb guess flow — scaled bonus, 3-guess lock, selector-fed status"
```

---

## Phase 4 — Surfaces (visual design is builder's judgment; hook points are fixed)

### Task 11: In-game clue glow + X/5 pips + guess sheet; home progress; result reveal

**Files:**
- Modify: `index.html` — render vals + template. Reuse existing patterns: the name-input sheet (for the guess input), the tile aura/highlight used by "show best word", and the header stat row.

**Interfaces:**
- Consumes: `this.dailyStatus().sworb` (`{ active, total, foundCount, guessesLeft, solved, canGuess }`), `this._clueJustFound`, `this._cluePaths`, `this.guessSworb(input)`.

- [ ] **Step 1: In-game clue feedback**
  - When `dailyStatus().sworb.active`, render an `X / total` pip row in the header stat area (mirror the existing SCORE/BEST/TOP/WORDS cells).
  - On a clue find (`this._clueJustFound` set in Task 9), flash the just-played word's tiles with the existing best-word aura (distinct outline/glow), then clear `_clueJustFound`. Do NOT recolor tiles. This is the "explosive" moment — make it feel bigger than a normal word: pair the aura with the pip tick and let the score-spike animation land. A longer clue naturally spikes harder (bigger base × 1.5), so the same effect scales itself.
  - Render a "GUESS THE SWORB" button when `sworb.canGuess`; it opens a guess sheet.

- [ ] **Step 2: Guess sheet**
  - Clone the name-input modal pattern into a `sworb` modal: a text input + submit calling `this.guessSworb(value)`, showing guesses-left and a wrong-guess shake (reuse `shakeX`). On correct, show the reveal + bonus and close.

- [ ] **Step 3: Home + result**
  - Home (sworb day): show `clues X/5` and, once `sworb.solved`, reveal the sworb word + earned bonus near "today's seven".
  - Result recap: add a sworb line (revealed word + bonus) alongside the seven.

- [ ] **Step 4: Verify in the browser (full loop)**
  - Fresh player, 2026-07-20: play → find a clue (aura + pip ticks) → open guess sheet → wrong guess (shake, guesses-left decrements) → correct guess (reveal + bonus, score jumps) → reload (state persists: solved, pips, score) → home shows the solved sworb. No console errors.

- [ ] **Step 5: Commit**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html && npm test
git add index.html Sworble.dc.html
git commit -m "feat: sworb surfaces — clue glow, X/5 pips, guess sheet, home + result reveal"
```

---

## Phase 5 — Content

### Task 12: Author ~30 days of `dailies.json` + a content guardrail test

**Files:**
- Modify: `dailies.json`
- Create: `tests/dailies-check.js` (validates every clue is real + placeable — runs in `npm test`)

**Authoring rule (the fun dial — from the design owner):** each day's 5 clues MIX length
deliberately. Aim for **~3 accessible 4-letter words** (most players will find these — they
give help and keep the day gettable) **+ ~1–2 meatier 5-letter words** as the *explosive*
finds for sharp players. This is not cosmetic: a 5-letter clue already scores far more than a
4-letter one (length multiplier `lenMult`: 5-tiles = 2.5× vs 4-tiles = 1.5×) AND takes the
+50% clue bonus on top — so longer clues feel disproportionately big when found. That
"explosive" moment (aura flash + pip tick + a score spike) is the core hook; author for it.
The LLM prompt should request a theme plus candidates at BOTH lengths so curation has range.

- [ ] **Step 1: Generate candidates** — per day, prompt an LLM for a theme + ~10 candidates
  split across 4- and 5-letter words strongly tied to the theme. Curate to 5 following the
  mix rule above; all must be common and in `dictionary.txt`.

- [ ] **Step 2: Write the content guardrail test**

```js
// tests/dailies-check.js — content guardrail: every clue must be a real dictionary word AND
// placeable on the board, or the day breaks for everyone. Runs in npm test.
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
  for (const w of e.clues) {
    assert.ok(dict.has(w), day + ': clue "' + w + '" is in dictionary.txt');
    assert.ok(w.length >= 3 && w.length <= 6, day + ': clue "' + w + '" is 3-6 letters');
  }
  const rng = Core.mulberry32(Core.hashSeed(day + '|sworb'));
  assert.ok(Seed.seedClueLetters({ clues: e.clues, cols: 5, rows: 6, rng }), day + ': clues placeable');
  days++;
}
console.log('dailies-check: ' + days + ' days valid');
```

- [ ] **Step 3: Run it, fix any failing day, add to `package.json`**

Run: `node tests/dailies-check.js` — fix any day whose clue isn't in the dictionary or won't
place. Insert `node tests/dailies-check.js && ` before `node tests/mirror-check.js` in
`package.json` so bad content can never ship.

- [ ] **Step 4: Commit**

```bash
npm test
git add dailies.json tests/dailies-check.js package.json
git commit -m "content: ~30 days of sworb themes + placement/dictionary guardrail test"
```

---

## Phase 6 — Final verification

### Task 13: Full-loop browser verification + mirror + suite

- [ ] **Step 1:** `npm test` green (all pure-module suites + mirror).
- [ ] **Step 2:** Browser: play three different days (easy all-4, mixed, hard-6) — confirm clues findable, persistence holds after heavy clearing, guess scaling pays correctly, reload restores sworb state, non-sworb fallback works (a date absent from `dailies.json` plays as a normal daily with no sworb UI).
- [ ] **Step 3:** Confirm determinism: same day → identical board across two fresh loads; `dailyStatus().sworb` identical.
- [ ] **Step 4: Commit** any fixes; the feature ships dark-compatible (a day with no entry = today's game exactly).

---

## Notes for the implementer

- The persistence re-stamp (Task 9 `_persistClues`) mutates tile letters in place — acceptable (tiles change during drops anyway) and only fires when a clue is actually broken. Keep it deferred (after settle) so it never races the drop animation.
- Tuning constants live in `sworble-daily.js` (`REWARD`) and the ×1.5 clue bonus in the commit path — change freely, they're not contracts.
- The answer is in `dailies.json` (public). Fine for the prototype; a later task can ship hashed answers + a verify endpoint.
- Backend seam untouched: when `/sworble/v1/daily/` exists, `loadDailies()` swaps its fetch URL; nothing else changes.
- **Deferred difficulty levers (from the spec, intentionally NOT built in the prototype):** path tortuosity biasing and decoy-fill camouflage. The prototype's difficulty comes entirely from the authored clue-word LENGTH mix (Task 12) plus the natural path variety of `stampWord`'s rng-shuffled walks. Add tortuosity/decoy only if playtesting shows days are too easy to spot; they slot into `stampWord` (bias neighbor order) and the board fill (choose near-miss letters) without changing any interface.
