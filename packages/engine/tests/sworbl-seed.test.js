// tests/sworbl-seed.test.js
'use strict';
const assert = require('assert');
const Seed = require('../sworbl-seed.js');
const Core = require('../sworbl-core.js');
const Solver = require('../sworbl-solver.js');

function allCells(cols, rows) { const a = []; for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) a.push({ r, c }); return a; }
function adjacent(a, b) { return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) === 1; }
const expand = (l) => (l === 'q' ? 'qu' : l);
// build a tile grid from a seedClueLetters letters map (non-clue cells filled with a filler)
function tilesFromLetters(letters, cols, rows) { const t = []; let id = 1; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) t.push({ id: id++, row: r, col: c, letter: letters[r + ',' + c] || 'x' }); return t; }

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
// crossing: a pre-placed 'a' can be REUSED by a new word whose path needs an 'a' there —
// stampWord may step onto an occupied cell only when its letter matches (a true crossing).
{
  // CAT across the top row of a 3x3; place BAR whose only 'a' is the shared (0,1)
  const letters = { '0,0': 'c', '0,1': 'a', '0,2': 't' };
  const path = Seed.stampWord(allCells(3, 3), { word: 'bar', rng: Core.mulberry32(5), letters });
  assert.ok(path, 'bar places (may cross the shared a)');
  assert.strictEqual(path.map(p => p.letter).join(''), 'bar');
  // never lands a letter on a cell already holding a DIFFERENT letter (crossings only on match)
  assert.ok(path.every(p => { const k = p.r + ',' + p.c; return letters[k] == null || letters[k] === p.letter; }), 'only crosses on matching letters');
}
// a word that would need a mismatched occupied cell must route around it (or fail), never clobber
{
  // fill the whole middle column with 'z'; 'aaa' cannot use any 'z' cell
  const letters = {};
  for (let r = 0; r < 3; r++) letters['' + r + ',1'] = 'z';
  const path = Seed.stampWord(allCells(3, 3), { word: 'aaa', rng: Core.mulberry32(2), letters });
  assert.ok(path, 'aaa still fits in the two free columns');
  assert.ok(path.every(p => letters[p.r + ',' + p.c] == null), 'never steps onto a mismatched z cell');
}
console.log('sworbl-seed: stampWord passed');

// seedClueLetters places multiple clues, CROSSING where letters match (crossword-style)
{
  const out = Seed.seedClueLetters({ clues: ['tide', 'coral', 'wave', 'reef', 'salt'], cols: 5, rows: 6, rng: Core.mulberry32(Core.hashSeed('2026-07-21')) });
  assert.ok(out, '5 short clues fit on 5x6');
  const occupied = Object.keys(out.letters);
  const wordLen = 'tide'.length + 'coral'.length + 'wave'.length + 'reef'.length + 'salt'.length;
  // letter-sharing can only SHRINK the footprint vs disjoint (never grow it); a shared cell
  // holds ONE letter serving both clues.
  assert.ok(occupied.length <= wordLen, 'crossings never occupy MORE than the disjoint sum');
  for (const w of ['tide', 'coral', 'wave', 'reef', 'salt']) {
    assert.strictEqual(out.cluePaths[w].map(p => out.letters[p.r + ',' + p.c]).join(''), w, w + ' letters land on its path');
  }
  // every clue is genuinely FINDABLE on the resulting board (real 8-adjacency, no reuse within a word)
  const tiles = tilesFromLetters(out.letters, 5, 6);
  for (const w of ['tide', 'coral', 'wave', 'reef', 'salt']) {
    assert.ok(Solver.findWord(tiles, { word: w, expand, diag: true }), w + ' is findable on the seeded board');
  }
  // deterministic
  const out2 = Seed.seedClueLetters({ clues: ['tide', 'coral', 'wave', 'reef', 'salt'], cols: 5, rows: 6, rng: Core.mulberry32(Core.hashSeed('2026-07-21')) });
  assert.deepStrictEqual(out.cluePaths, out2.cluePaths, 'same seed -> same placement');
}
// FORCED crossing: two 3-letter words sharing all letters CANNOT fit disjoint on a 2x2 (needs
// 6 cells, only 4 exist) — so a non-null result PROVES the seeder wove them through shared cells.
{
  const out = Seed.seedClueLetters({ clues: ['are', 'ear'], cols: 2, rows: 2, rng: Core.mulberry32(9) });
  assert.ok(out, 'are+ear fit on a 2x2 only by sharing cells (crossword-style)');
  const occupied = Object.keys(out.letters).length;
  assert.ok(occupied < 6, 'shared cells: footprint (' + occupied + ') < 3+3 disjoint');
  assert.strictEqual(out.cluePaths['are'].map(p => out.letters[p.r + ',' + p.c]).join(''), 'are');
  assert.strictEqual(out.cluePaths['ear'].map(p => out.letters[p.r + ',' + p.c]).join(''), 'ear');
  // both still findable under real adjacency
  const tiles = tilesFromLetters(out.letters, 2, 2);
  assert.ok(Solver.findWord(tiles, { word: 'are', expand, diag: true }), 'are findable');
  assert.ok(Solver.findWord(tiles, { word: 'ear', expand, diag: true }), 'ear findable');
}
// still returns null when a set genuinely cannot fit (no shared letters BETWEEN words to cross on,
// and the disjoint footprint exceeds the grid)
{
  const tooMany = Seed.seedClueLetters({ clues: ['aaaaa','bbbbb','ccccc','ddddd','eeeee','fffff','ggggg'], cols: 5, rows: 6, rng: Core.mulberry32(1) });
  assert.strictEqual(tooMany, null, 'impossible pack (no cross letters, 35>30) -> null so caller reseeds/rejects');
}
console.log('sworbl-seed: seedClueLetters passed');

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
console.log('sworbl-seed: seedClueLettersBestEffort passed');

// two-pass: locks the realized set to EXACTLY `target` (default 6) — "6 to find, 6 to crack it"
{
  const ocean = ['tide','coral','wave','reef','salt','shore','kelp','surf','foam','brine','pearl','shell'];
  const rngFactory = () => Core.mulberry32(Core.hashSeed('ocean|twopass'));
  const out = Seed.seedClueLettersTwoPass({ clues: ocean, cols: 5, rows: 6, rngFactory, target: 6 });
  assert.strictEqual(out.usedFallback, false, 'a healthy 12-word pool locks 6 cleanly (no fallback)');
  assert.strictEqual(out.realized.length, 6, 'realized set is exactly 6');
  // the final board stamps ONLY the 6 targets — no leftover pass-1 bonus words
  assert.deepStrictEqual(Object.keys(out.cluePaths).sort(), out.realized.slice().sort(), 'cluePaths keys are exactly the 6 realized targets');
  for (const w of out.realized) {
    assert.strictEqual(out.cluePaths[w].map(p => out.letters[p.r + ',' + p.c]).join(''), w, w + ' spelled on its path');
  }
  const tiles = tilesFromLetters(out.letters, 5, 6);
  for (const w of out.realized) assert.ok(Solver.findWord(tiles, { word: w, expand, diag: true }), w + ' findable on the trimmed board');
  // deterministic: same rngFactory (fresh generator per call, same seed) -> identical target set
  const out2 = Seed.seedClueLettersTwoPass({ clues: ocean, cols: 5, rows: 6, rngFactory, target: 6 });
  assert.deepStrictEqual(out.realized, out2.realized, 'same seed -> same realized 6');
  assert.deepStrictEqual(out.cluePaths, out2.cluePaths, 'same seed -> same trimmed board');
}
// two-pass fallback: a candidate pool smaller than `target` can never realize `target` — flagged,
// not silently eaten. `realized` reports the short slice pass 1 actually placed.
{
  const rngFactory = () => Core.mulberry32(Core.hashSeed('tiny|twopass'));
  const out = Seed.seedClueLettersTwoPass({ clues: ['tide', 'coral'], cols: 5, rows: 6, rngFactory, target: 6 });
  assert.strictEqual(out.usedFallback, true, 'a 2-word pool cannot realize a 6-word target');
  assert.strictEqual(out.realized.length, 2, 'realized reports what pass 1 actually placed (2)');
}
// two-pass SUBSET RETRY: when the canonical first-6 target set can't re-pack cleanly (pass 2
// falls short), the seeder deterministically tries alternative 6-subsets of the pool (by
// rotating the pool order into pass 1) until one packs — instead of surrendering to fallback.
// This pool + seed realized only 5 under the single-attempt algorithm; retry lands a clean 6.
// (Case mined from tests/seed-stress.js worst-case output — a genuinely hard all-6-letter pool.)
{
  const pool = ['cheesy','batboy','zocalo','fiends','venges','singer','mouldy','spline','fluffs','reward','rustic','blends'];
  const rngFactory = () => Core.mulberry32(Core.hashSeed('board|9'));
  const out = Seed.seedClueLettersTwoPass({ clues: pool, cols: 5, rows: 6, rngFactory, target: 6 });
  assert.strictEqual(out.usedFallback, false, 'subset-retry rescues a pool the single attempt could not pack');
  assert.strictEqual(out.realized.length, 6, 'retry lands exactly 6');
  // the realized 6 are real pool words, spelled on their paths, and findable on the final board
  const tiles = tilesFromLetters(out.letters, 5, 6);
  for (const w of out.realized) {
    assert.ok(pool.indexOf(w) >= 0, w + ' is one of the pool words');
    assert.strictEqual(out.cluePaths[w].map(p => out.letters[p.r + ',' + p.c]).join(''), w, w + ' spelled on its path');
    assert.ok(Solver.findWord(tiles, { word: w, expand, diag: true }), w + ' findable on the retried board');
  }
  // determinism: same seed -> identical retried board + realized set
  const out2 = Seed.seedClueLettersTwoPass({ clues: pool, cols: 5, rows: 6, rngFactory, target: 6 });
  assert.deepStrictEqual(out.realized, out2.realized, 'same seed -> same retried realized set');
  assert.deepStrictEqual(out.cluePaths, out2.cluePaths, 'same seed -> same retried board');
}
// retry is opt-outable / bounded: attempts:1 restores the single-attempt behavior (no retry),
// so the same hard pool falls back — proving attempt 0 is byte-identical to the old algorithm
// and existing (already-passing) content days keep their exact boards.
{
  const pool = ['cheesy','batboy','zocalo','fiends','venges','singer','mouldy','spline','fluffs','reward','rustic','blends'];
  const rngFactory = () => Core.mulberry32(Core.hashSeed('board|9'));
  const out = Seed.seedClueLettersTwoPass({ clues: pool, cols: 5, rows: 6, rngFactory, target: 6, attempts: 1 });
  assert.strictEqual(out.usedFallback, true, 'attempts:1 == old single-attempt behavior (this pool falls back)');
  assert.strictEqual(out.realized.length, 5, 'single attempt realized only 5 here');
}
console.log('sworbl-seed: seedClueLettersTwoPass passed');

// reseedBroken: re-stamp unfindable clues
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
console.log('sworbl-seed: reseedBroken passed');
