// sworbl-solver.js — pure board word-finding. NO DOM, NO storage, NO `this`.
//
// The board's word-scans used to be four near-identical DFS copies inside the game class:
//   • findFirstWord   — the auto-reshuffle guard (is ANY word still on the board?)
//   • solveLongest    — the best-word bonus target (longest findable, common-tier preferred)
//   • topWords        — the "words you missed" recap (top-N highest scoring, 4+)
//   • topWordStarts   — bomb "beacon" anchors (top-N + each word's canonical start tile)
// They now share ONE spatial walker here; the live class methods are thin delegates. A fifth,
// findAllWords, powers the dev "all viable words" menu. Loaded like the rest of the kernel:
// <script src> sets window.SworblSolver; module.exports mirrors it for the tests.
//
// A "tile" is any object with { id, row, col, letter }. The caller supplies expand()
// (letter -> spelled chars, e.g. 'q' -> 'qu') so a "Qu" tile spells TWO chars but counts as
// ONE tile — matching how the game scores word length in tiles. Adjacency is 8-way (or 4-way
// when diag === false), no tile reused within a path. Every scan is capped by node visits and
// iterates tiles in the given order, so same board + same dict + same order = same answer for
// every player (daily fairness). Budgets/caps are passed in verbatim from the old inline code.
(function (root) {
  'use strict';

  var DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  var DIRS4 = [[-1,0],[1,0],[0,-1],[0,1]];
  function dirsFor(diag) { return diag === false ? DIRS4 : DIRS8; }

  // row,col -> tile lookup (one tile per cell).
  function makeGrid(tiles) {
    var g = {};
    for (var i = 0; i < tiles.length; i++) g[tiles[i].row + ',' + tiles[i].col] = tiles[i];
    return g;
  }

  // Letter multiset available on the board, in EXPANDED chars (a Qu tile adds q + u).
  function available(tiles, expand) {
    var avail = {};
    for (var i = 0; i < tiles.length; i++) {
      var chars = expand(tiles[i].letter);
      for (var j = 0; j < chars.length; j++) { var ch = chars[j]; avail[ch] = (avail[ch] || 0) + 1; }
    }
    return avail;
  }

  // Words from `dict` (any iterable of lowercase words) whose letter multiset FITS the board —
  // a cheap pre-filter before the expensive spatial DFS. minLen/maxLen bound word STRING length.
  function candidates(dict, avail, minLen, maxLen) {
    var out = [];
    for (var w of dict) {
      if (w.length < minLen || w.length > maxLen) continue;
      var need = {}, ok = true;
      for (var k = 0; k < w.length; k++) { var ch = w[k]; need[ch] = (need[ch] || 0) + 1; if (need[ch] > (avail[ch] || 0)) { ok = false; break; } }
      if (ok) out.push(w);
    }
    return out;
  }

  // Every proper prefix (and the word itself) of a candidate list — the DFS prune set.
  function prefixSet(words) {
    var pref = new Set();
    for (var i = 0; i < words.length; i++) { var w = words[i]; for (var j = 1; j <= w.length; j++) pref.add(w.slice(0, j)); }
    return pref;
  }

  // ── 1. First findable word (the auto-reshuffle guard). Uses a PREBUILT full-dict prefix set
  //    + membership set, prunes by string length (maxChars), early-exits on the first hit.
  //    Returns the word string, or null when the board makes nothing.
  function findFirstWord(tiles, o) {
    var expand = o.expand, prefixes = o.prefixes, dict = o.dict;
    var dirs = dirsFor(o.diag), maxChars = o.maxChars || 6, minLen = o.minLen || 3;
    var grid = makeGrid(tiles), budget = o.budget || 60000, found = null;
    function dfs(t, path, str) {
      if (found || --budget < 0) return;
      var s2 = str + expand(t.letter);
      if (s2.length > maxChars || !prefixes.has(s2)) return;
      if (s2.length >= minLen && dict.has(s2)) { found = s2; return; }
      var p2 = path.concat(t.id);
      for (var d = 0; d < dirs.length; d++) {
        var n = grid[(t.row + dirs[d][0]) + ',' + (t.col + dirs[d][1])];
        if (n && p2.indexOf(n.id) === -1) dfs(n, p2, s2);
      }
    }
    for (var i = 0; i < tiles.length; i++) { if (found) break; dfs(tiles[i], [tiles[i].id], ''); }
    return found;
  }

  // ── 2. Longest findable word (the best-word bonus target). Measured in TILES. Prefers a
  //    RECOGNIZABLE (common-tier) word of the same reach, and won't re-reveal `avoid` when an
  //    equal-length common alternative exists. Returns { ids, word, len } or null.
  function solveLongest(tiles, o) {
    var expand = o.expand, dict = o.dict, common = o.common || null, avoid = o.avoid;
    var dirs = dirsFor(o.diag), cap = o.cap || 6, minLen = o.minLen || 3, budget = o.budget || 150000;
    if (!tiles.length) return null;
    var avail = available(tiles, expand);
    var cand = candidates(dict, avail, minLen, cap + 1); // +1 slack: a Qu tile spends 2 chars
    if (!cand.length) return null;
    var pref = prefixSet(cand), cset = new Set(cand);
    var grid = makeGrid(tiles);
    var best = null, bestCommon = null, bestCommonAlt = null;
    function dfs(t, path, str) {
      if (--budget < 0) return;
      var s2 = str + expand(t.letter);
      if (!pref.has(s2)) return;
      var p2 = path.concat(t.id);
      if (s2.length >= minLen && cset.has(s2)) {
        if (!best || p2.length > best.len) best = { ids: p2, word: s2, len: p2.length };
        if (common && common.has(s2)) {
          if (!bestCommon || p2.length > bestCommon.len) bestCommon = { ids: p2, word: s2, len: p2.length };
          if (s2 !== avoid && (!bestCommonAlt || p2.length > bestCommonAlt.len)) bestCommonAlt = { ids: p2, word: s2, len: p2.length };
        }
      }
      if (p2.length >= cap) return;
      for (var d = 0; d < dirs.length; d++) {
        var n = grid[(t.row + dirs[d][0]) + ',' + (t.col + dirs[d][1])];
        if (n && p2.indexOf(n.id) === -1) dfs(n, p2, s2);
      }
    }
    for (var i = 0; i < tiles.length; i++) dfs(tiles[i], [], '');
    // don't re-reveal the SAME best word two boards running when an equally-long alt exists
    if (avoid && bestCommon && bestCommon.word === avoid && bestCommonAlt && bestCommonAlt.len === bestCommon.len) return bestCommonAlt;
    return bestCommon || best; // common word wins; obscure only if the board has no common one
  }

  // Shared scoring scan for #3/#4: every recognizable word (>= minTiles tiles) findable on the
  // board, keyed word -> { pts, startId }. pts = (sum tile values) × tileCount × lenMult(count);
  // the canonical start is the min (row*100+col) tile among equal-scoring paths (game/bot lockstep).
  function scoreScan(tiles, o) {
    var expand = o.expand, dict = o.dict, letterVal = o.letterVal, lenMult = o.lenMult;
    var dirs = dirsFor(o.diag), cap = o.cap || 6, minTiles = o.minTiles || 4, budget = o.budget || 200000;
    var out = {};
    if (!tiles.length) return out;
    var avail = available(tiles, expand);
    var cand = candidates(dict, avail, minTiles, cap + 1);
    if (!cand.length) return out;
    var pref = prefixSet(cand), cset = new Set(cand);
    var grid = makeGrid(tiles);
    function idx(t) { return t.row * 100 + t.col; }
    function dfs(start, t, visited, str, valSum, count) {
      if (--budget < 0) return;
      var s2 = str + expand(t.letter);
      if (!pref.has(s2)) return;
      var v2 = valSum + letterVal(t.letter);
      var c2 = count + 1;
      if (c2 >= minTiles && cset.has(s2)) {
        var pts = Math.round(v2 * c2 * lenMult(c2));
        var cur = out[s2];
        if (!cur || pts > cur.pts || (pts === cur.pts && idx(start) < cur.startIdx)) out[s2] = { pts: pts, startId: start.id, startIdx: idx(start) };
      }
      if (c2 >= cap) return;
      var nv = visited.concat(t.row + ',' + t.col);
      for (var d = 0; d < dirs.length; d++) {
        var nb = grid[(t.row + dirs[d][0]) + ',' + (t.col + dirs[d][1])];
        if (nb && nv.indexOf(nb.row + ',' + nb.col) === -1) dfs(start, nb, nv, s2, v2, c2);
      }
    }
    for (var i = 0; i < tiles.length; i++) dfs(tiles[i], tiles[i], [], '', 0, 0);
    return out;
  }

  // ── 3. Top-N highest-SCORING recognizable words (the recap). Dedups by word (best path),
  //    excludes already-played words. Returns [{ word, pts }] sorted by pts desc.
  function topWords(tiles, o) {
    var res = scoreScan(tiles, o);
    var ex = new Set((o.exclude || []).map(function (w) { return (w || '').toLowerCase(); }));
    return Object.keys(res)
      .filter(function (w) { return !ex.has(w); })
      .map(function (w) { return { word: w, pts: res[w].pts }; })
      .sort(function (a, b) { return b.pts - a.pts; })
      .slice(0, o.limit || 5);
  }

  // ── 4. Same scan, pinned to each word's canonical START tile — bomb beacon anchors.
  //    Returns [{ word, pts, startId }] sorted by pts desc.
  function topWordStarts(tiles, o) {
    var res = scoreScan(tiles, o);
    return Object.keys(res)
      .map(function (w) { return { word: w, pts: res[w].pts, startId: res[w].startId }; })
      .sort(function (a, b) { return b.pts - a.pts; })
      .slice(0, o.limit || 5);
  }

  // ── DEV: every viable (playable) word on the board — the FULL dict, >= minTiles tiles, each
  //    with its best-scoring path, points, and whether it's a common-tier word. Heavier search
  //    (full dict, larger cap), so it's dev-only and gets a generous budget. Returns
  //    [{ word, pts, ids, len, common }] sorted by pts desc.
  function findAllWords(tiles, o) {
    var expand = o.expand, dict = o.dict, common = o.common || null, letterVal = o.letterVal, lenMult = o.lenMult;
    var dirs = dirsFor(o.diag), cap = o.cap || 7, minTiles = o.minTiles || 3, budget = o.budget || 600000;
    var out = {};
    if (!tiles.length) return [];
    var avail = available(tiles, expand);
    var cand = candidates(dict, avail, minTiles, cap + 1);
    if (!cand.length) return [];
    var pref = prefixSet(cand), cset = new Set(cand);
    var grid = makeGrid(tiles);
    function dfs(t, path, str, valSum) {
      if (--budget < 0) return;
      var s2 = str + expand(t.letter);
      if (!pref.has(s2)) return;
      var p2 = path.concat(t.id);
      var v2 = valSum + letterVal(t.letter);
      if (p2.length >= minTiles && cset.has(s2)) {
        var pts = Math.round(v2 * p2.length * lenMult(p2.length));
        var cur = out[s2];
        if (!cur || pts > cur.pts) out[s2] = { word: s2, pts: pts, ids: p2, len: p2.length, common: !!(common && common.has(s2)) };
      }
      if (p2.length >= cap) return;
      for (var d = 0; d < dirs.length; d++) {
        var n = grid[(t.row + dirs[d][0]) + ',' + (t.col + dirs[d][1])];
        if (n && p2.indexOf(n.id) === -1) dfs(n, p2, s2, v2);
      }
    }
    for (var i = 0; i < tiles.length; i++) dfs(tiles[i], [], '', 0);
    return Object.keys(out)
      .map(function (w) { return out[w]; })
      .sort(function (a, b) { return b.pts - a.pts || b.len - a.len || (a.word < b.word ? -1 : 1); });
  }

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

  // exposed for tests + reuse
  var API = { findFirstWord: findFirstWord, solveLongest: solveLongest, topWords: topWords,
    topWordStarts: topWordStarts, findAllWords: findAllWords, findWord: findWord,
    _internals: { makeGrid: makeGrid, available: available, candidates: candidates, prefixSet: prefixSet, scoreScan: scoreScan } };
  root.SworblSolver = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
