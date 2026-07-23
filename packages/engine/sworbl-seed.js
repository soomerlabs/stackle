// sworbl-seed.js — pure, deterministic clue-word board seeder. NO DOM, NO storage, NO `this`.
// Stamps a word onto the grid as a self-avoiding 8-adjacent path (used for BOTH the opening
// board and re-stamping a clue broken by play). All randomness is an injected mulberry32 rng
// so the daily is identical for every player. Loaded via <script src> (sets window.SworblSeed);
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
  //
  // CROSSWORD-STYLE SHARING: pass `letters` ("r,c" -> letter, the letters already on the board)
  // and the path may step onto an OCCUPIED cell only when its letter MATCHES the letter the word
  // needs there — a true crossing, like a word-search. The walker PREFERS such crossings (they
  // weave the clues together into a denser board) but never clobbers a mismatched cell. Fully
  // deterministic given rng: crossing candidates rank first, ties broken by an rng shuffle.
  function stampWord(cells, opts) {
    var word = String(opts.word || '').toLowerCase();
    var rng = opts.rng, avoid = opts.avoid || new Set(), letters = opts.letters || null;
    if (!word) return null;
    var free = {}; // "r,c" -> {r,c} for O(1) neighbor lookup
    for (var i = 0; i < cells.length; i++) { var cc = cells[i]; var fk = key(cc.r, cc.c); if (!avoid.has(fk)) free[fk] = cc; }
    // a cell may hold `ch` if it's empty OR already holds exactly `ch` (a crossing)
    function letterOK(k, ch) { return !letters || letters[k] == null || letters[k] === ch; }
    function isCross(k) { return !!(letters && letters[k] != null); }
    var used = new Set(); // reset per start below; walk() closes over it (function-scoped var)
    function walk(cell, idx) {
      var k = key(cell.r, cell.c);
      used.add(k);
      var here = { r: cell.r, c: cell.c, letter: word[idx] };
      if (idx === word.length - 1) return [here];
      var cross = [], fresh = [], ch = word[idx + 1];
      for (var d = 0; d < DIRS.length; d++) {
        var nr = cell.r + DIRS[d][0], nc = cell.c + DIRS[d][1], nk = key(nr, nc);
        if (free[nk] && !used.has(nk) && letterOK(nk, ch)) { (isCross(nk) ? cross : fresh).push(free[nk]); }
      }
      // weave first: try crossing neighbors before fresh ones (each group rng-shuffled)
      var neigh = shuffle(cross, rng).concat(shuffle(fresh, rng));
      for (var n = 0; n < neigh.length; n++) {
        var rest = walk(neigh[n], idx + 1);
        if (rest) return [here].concat(rest);
      }
      used.delete(k); // backtrack
      return null;
    }
    var startCells = Object.keys(free).map(function (k2) { return free[k2]; }).filter(function (cc) { return letterOK(key(cc.r, cc.c), word[0]); });
    // prefer starting ON an existing matching letter (a crossing start) to encourage weaving
    var startCross = [], startFresh = [];
    for (var si = 0; si < startCells.length; si++) { (isCross(key(startCells[si].r, startCells[si].c)) ? startCross : startFresh).push(startCells[si]); }
    var starts = shuffle(startCross, rng).concat(shuffle(startFresh, rng));
    for (var s = 0; s < starts.length; s++) {
      used = new Set();
      var path = walk(starts[s], 0);
      if (path) return path;
    }
    return null;
  }

  // Place multiple clues, letting later clues CROSS earlier ones wherever letters coincide
  // (crossword-style). Returns { letters, cluePaths } or null if any clue can't be placed.
  // `letters` is "r,c" -> letter (shared cells hold one letter serving every clue through them).
  // `cluePaths` is { word: [{r,c}] } — each clue's full path, including any shared cells.
  function seedClueLetters(opts) {
    var clues = opts.clues || [], cols = opts.cols, rows = opts.rows, rng = opts.rng;
    var cells = [];
    for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) cells.push({ r: r, c: c });
    var letters = {}, cluePaths = {};
    for (var i = 0; i < clues.length; i++) {
      var w = String(clues[i]).toLowerCase();
      // pass the running `letters` so this clue may cross the ones already placed (on match)
      var path = stampWord(cells, { word: w, rng: rng, letters: letters });
      if (!path) return null;
      cluePaths[w] = path.map(function (p) { return { r: p.r, c: p.c }; });
      for (var j = 0; j < path.length; j++) { var k = path[j].r + ',' + path[j].c; letters[k] = path[j].letter; }
    }
    return { letters: letters, cluePaths: cluePaths };
  }

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

  // Default attempt budget for seedClueLettersTwoPass's subset retry (below). 12 covers every
  // rotation of a 10-15-word pool; the stress harness (tests/seed-stress.js) shows realistic
  // content clears 100% within ~3 and even all-6-letter pools reach 100% by 12.
  var DEFAULT_TWOPASS_ATTEMPTS = 12;

  // Rotate a word list left by k (k mod length) — attempt a's pool order for the retry below.
  // Pure: returns a new array, never mutates. k=0 is the identity (attempt 0 == canonical).
  function rotateWords(words, k) {
    if (!words.length) return words.slice();
    var n = ((k % words.length) + words.length) % words.length;
    return words.slice(n).concat(words.slice(0, n));
  }

  // Two-pass variant that locks the realized theme set to EXACTLY `target` words (default 6 —
  // "6 to find, 6 to crack it"). Pass 1 runs seedClueLettersBestEffort against the full `clues`
  // candidate pool; the first `target` realized words (cluePaths insertion order) become the
  // candidate target set. Pass 2 re-runs seedClueLettersBestEffort with ONLY those words, on a
  // FRESH rng (via `rngFactory()`, called once per pass — each call yields an identical stream
  // from the same seed): the final board stamps ONLY the target words, no leftover bonus words.
  //
  // SUBSET RETRY: the first `target` realized words sometimes fit in pass 1 ONLY because the
  // wider pool's bonus words gave them crossings — a `target`-only re-pack on an empty board
  // then can't reproduce that and falls short. Reordering the SAME doomed subset does not help
  // (measured); a DIFFERENT `target`-subset does. So attempt 0 packs the pool as-is (byte-
  // identical to the old single-attempt algorithm — already-passing days are unchanged), and
  // each further attempt ROTATES the pool into pass 1, surfacing a different first-`target`
  // subset to re-pack. The first attempt whose pass 2 lands exactly `target` wins. `opts.attempts`
  // (default DEFAULT_TWOPASS_ATTEMPTS) bounds the search; attempts:1 restores the old behavior.
  //
  // DETERMINISM: same seed (same rngFactory) + same `clues` + same `attempts` → same board,
  // always — the rotation schedule is a pure function of the attempt index.
  //
  // FALLBACK (should be rare on real content — flag it, don't silently eat it): if NO attempt
  // (canonical + all rotations tried) yields a clean `target`-word board — the pool is too thin
  // or too dense to pack `target` — this returns `usedFallback: true` on attempt 0's pass-1
  // board (extra pass-1 words remain as unmarked bonus words) with `realized` reporting attempt
  // 0's (possibly short) target slice. Callers treat `usedFallback: true` as a content problem
  // (thin/misconfigured day), not a runtime error.
  function seedClueLettersTwoPass(opts) {
    var clues = opts.clues || [], cols = opts.cols, rows = opts.rows, rngFactory = opts.rngFactory;
    var target = opts.target || 6;
    var attempts = (typeof opts.attempts === 'number' && opts.attempts > 0) ? Math.floor(opts.attempts) : DEFAULT_TWOPASS_ATTEMPTS;
    // attempt 0's pass 1 is the canonical packing; it also seeds the fallback board.
    var basePass1 = seedClueLettersBestEffort({ clues: clues, cols: cols, rows: rows, rng: rngFactory() });
    var baseFirst = Object.keys(basePass1.cluePaths).slice(0, target);
    for (var a = 0; a < attempts; a++) {
      var pass1 = a === 0 ? basePass1
        : seedClueLettersBestEffort({ clues: rotateWords(clues, a), cols: cols, rows: rows, rng: rngFactory() });
      var first = Object.keys(pass1.cluePaths).slice(0, target);
      if (first.length < target) continue; // this rotation couldn't even realize `target` — try next
      var pass2 = seedClueLettersBestEffort({ clues: first, cols: cols, rows: rows, rng: rngFactory() });
      var realized2 = Object.keys(pass2.cluePaths);
      if (realized2.length === target) {
        return { letters: pass2.letters, cluePaths: pass2.cluePaths, realized: realized2, usedFallback: false };
      }
    }
    // no attempt produced a clean `target`-word board — fall back to attempt 0's pass-1 board,
    // which DID place all of `baseFirst` (that's how it was derived), just alongside extras.
    return { letters: basePass1.letters, cluePaths: basePass1.cluePaths, realized: baseFirst, usedFallback: true };
  }

  // Re-stamp unfindable clues broken by play. For each unfound clue where isFindable(word)
  // is false, stamp it onto the current board's cells, avoiding reserve + other unfound
  // clues' chosen cells this pass. Returns flat list of cell changes [{r,c,letter}].
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

  var API = { stampWord: stampWord, seedClueLetters: seedClueLetters, seedClueLettersBestEffort: seedClueLettersBestEffort, seedClueLettersTwoPass: seedClueLettersTwoPass, reseedBroken: reseedBroken, _shuffle: shuffle };
  root.SworblSeed = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
