// sworbl-run.js — live-run timing/snapshot layer. Two things live here, both pure
// data-in/data-out — NO DOM, NO storage, NO `this`:
//   1. The live-run SNAPSHOT: serialize/validate the mid-run state of a daily so a reload
//      (or a mobile tab eviction) can restore the run exactly where it was (the game wires
//      it to LS via SworblStore.K.RUN_PREFIX + dayKey).
//   2. The round-start COUNT-IN timing chain (COUNT_IN_MS/countInStepAt) — the 3·2·1·GO
//      beat every round START and PAUSE RESUME plays; armCountIn (index.html) owns the
//      actual scheduling/token-guard, this owns only the timing/value data.
//
// Loaded via <script src> in <helmet> (sets window.SworblRun); mirrored to
// module.exports for tests (tests/sworbl-run.test.js).
//
// Restore contract: the snapshot carries everything the seeded daily needs to continue
// deterministically — the letter-queue position (queueIdx) plus CALL COUNTS for the three
// seeded RNG streams (rngN), so the game can rebuild each mulberry32 stream from the day
// seed and fast-forward it to its exact position at save time.
(function (root) {
  'use strict';

  const RUN_VERSION = 1;

  // The ONLY tile fields that survive a snapshot. Everything else (spawn/mergeTo/
  // boostFlash/stretch/intro/dealDelay/armed/...) is animation or interaction state
  // that must reset to a settled board on restore.
  function packTile(t) {
    return {
      id: t.id, letter: t.letter, row: t.row, col: t.col, color: t.color,
      boost: t.boost || 0, mine: !!t.mine, stackColors: t.stackColors || null,
    };
  }

  function isFiniteNum(n) { return typeof n === 'number' && isFinite(n); }
  function validTile(t) {
    return !!t && isFiniteNum(t.id) && typeof t.letter === 'string' && t.letter.length > 0 &&
      isFiniteNum(t.row) && isFiniteNum(t.col);
  }
  function validRngN(r) {
    return !!r && isFiniteNum(r.rand) && r.rand >= 0 && isFiniteNum(r.rowRand) && r.rowRand >= 0 &&
      isFiniteNum(r.mineRand) && r.mineRand >= 0;
  }

  // Build a JSON-safe snapshot from the live run's state, or null if the input does not
  // describe a resumable run (no day, empty board, spent budget, corrupt numbers).
  // Never mutates `src` — every array/object in the result is a fresh copy.
  function serializeRun(src) {
    if (!src || typeof src.day !== 'string' || !src.day) return null;
    if (!Array.isArray(src.tiles)) return null;
    if (!isFiniteNum(src.score) || !isFiniteNum(src.guessesLeft) || src.guessesLeft <= 0) return null;
    if (!validRngN(src.rngN)) return null;
    if (!isFiniteNum(src.queueIdx) || src.queueIdx < 0) return null;
    const tiles = src.tiles.filter(t => t && !t.dead && !t.clearing).map(packTile);
    if (!tiles.length) return null;
    return {
      v: RUN_VERSION,
      day: src.day,
      cols: isFiniteNum(src.cols) ? src.cols : null, // board geometry at save time — a
      rows: isFiniteNum(src.rows) ? src.rows : null, // restore onto a resized grid re-deals instead
      tileSeq: isFiniteNum(src.tileSeq) ? src.tileSeq : 1,
      queueIdx: src.queueIdx,
      juiceNext: isFiniteNum(src.juiceNext) ? src.juiceNext : 0,
      rngN: { rand: src.rngN.rand, rowRand: src.rngN.rowRand, mineRand: src.rngN.mineRand },
      tiles,
      nextRow: Array.isArray(src.nextRow)
        ? src.nextRow.map(c => (c ? { letter: c.letter, color: c.color } : null))
        : null,
      score: src.score,
      guessesLeft: src.guessesLeft,
      streak: isFiniteNum(src.streak) ? src.streak : 0,
      maxStreak: isFiniteNum(src.maxStreak) ? src.maxStreak : 0,
      roundWords: Array.isArray(src.roundWords)
        ? src.roundWords.map(w => ({ word: w.word, pts: w.pts, colors: Array.isArray(w.colors) ? w.colors.slice() : null, best: !!w.best }))
        : [],
      boardElapsedMs: isFiniteNum(src.boardElapsedMs) ? src.boardElapsedMs : 0,
      bestRun: isFiniteNum(src.bestRun) ? src.bestRun : 0,
      bestHits: isFiniteNum(src.bestHits) ? src.bestHits : 0,
      bombRun: isFiniteNum(src.bombRun) ? src.bombRun : 0,
      mergedOnce: !!src.mergedOnce,
      openingSnapshot: Array.isArray(src.openingSnapshot)
        ? src.openingSnapshot.map(s => ({ letter: s.letter, row: s.row, col: s.col }))
        : null,
    };
  }

  // Gate a parsed snapshot before restore: right version, right day, structurally sound.
  // Anything off -> null, and the caller deals a fresh board (never a broken restore).
  function validateRun(snap, day) {
    if (!snap || typeof snap !== 'object') return null;
    if (snap.v !== RUN_VERSION) return null;
    if (typeof day !== 'string' || snap.day !== day) return null;
    if (!Array.isArray(snap.tiles) || !snap.tiles.length || !snap.tiles.every(validTile)) return null;
    if (!isFiniteNum(snap.score) || !isFiniteNum(snap.guessesLeft) || snap.guessesLeft <= 0) return null;
    if (!validRngN(snap.rngN)) return null;
    if (!isFiniteNum(snap.queueIdx) || snap.queueIdx < 0) return null;
    if (!Array.isArray(snap.roundWords)) return null;
    return snap;
  }

  // restoreRun's remaining-round-time arithmetic: resume with REMAINING round time, not a
  // fresh full clock — boardElapsedMs (actual time spent on the board, saved in the snapshot)
  // is subtracted so a reload can't be used to farm extra time. Never negative: floors at 0
  // (the caller decides what a 0-time resume means — restoreRun hands frame() a minimum 1s
  // clock so its own timeLeft<=0 tick fires endRound naturally rather than calling it here).
  function remainingSecs(roundSecs, boardElapsedMs) {
    const elapsed = Math.floor((boardElapsedMs || 0) / 1000);
    const remaining = (roundSecs || 0) - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  // The shared 3·2·1·GO count-in beat's timing chain, extracted pure from armCountIn
  // (index.html). This module owns only the WHAT — which countIn value/branch fires at
  // which millisecond; armCountIn keeps its own token-guard mechanism (orphaning a stale
  // in-flight chain when a newer deal/resume/auto-pause pre-empts it) and the actual
  // this.later()/setTimeout wiring exactly as before — only the timing/value data moved.
  const COUNT_IN_MS = { STEP2: 700, STEP1: 1400, GO: 2100, RELEASE: 2750, UNMOUNT: 3300 };

  // countInStepAt(ms, ctx) -> the setState patch for the step at `ms`, or null (no-op /
  // unknown ms). `ctx` carries only what each step's branch needs at fire-time:
  //   RELEASE (2750ms): ctx.activeModal — a modal open at release time is left for its own
  //     close path to resolve (`paused` untouched); otherwise the board unlocks
  //     (`paused: false`) and the overlay starts fading out (`countIn: 'out'`).
  //   UNMOUNT (3300ms): ctx.countIn — only unmounts the overlay while it's still in the
  //     'out' fade tail; any other value (already resolved by RELEASE, or reset by a
  //     modal, or a stale step overtaken by a fresh re-arm) is left alone.
  function countInStepAt(ms, ctx) {
    const c = ctx || {};
    switch (ms) {
      case COUNT_IN_MS.STEP2: return { countIn: 2 };
      case COUNT_IN_MS.STEP1: return { countIn: 1 };
      case COUNT_IN_MS.GO: return { countIn: 'GO' };
      case COUNT_IN_MS.RELEASE: return c.activeModal ? { countIn: null } : { countIn: 'out', paused: false };
      case COUNT_IN_MS.UNMOUNT: return c.countIn === 'out' ? { countIn: null } : null;
      default: return null;
    }
  }

  // ---- TIME FUEL (owner-locked 2026-07-23): "three minutes given, seven if
  // you earn it." Words grant time alongside points; the round's TOTAL length
  // (base + earned) is hard-capped at the Seven. Deterministic by construction
  // (time earned is a pure function of the words played) — replay validation
  // and the anti-cheat ladder are unaffected. All values are tuning knobs.
  const TIME_FUEL = {
    BASE_SECS: 180,
    CAP_SECS: 420, // the Seven — now the EARNED ceiling, not the given clock
    CLUE_BONUS_MS: 20000, // catching a clue keeps the hunt alive
    perLen: { 3: 4000, 4: 6000, 5: 9000, 6: 12000 },
    sevenPlusMs: 15000,
  };

  // timeForWord({ len, isClue, earnedMs, baseSecs?, capSecs?, fuel? }) -> ms granted,
  // CLIPPED so base + earned + grant never exceeds the cap. 0 for len < 3.
  function timeForWord(args) {
    const a = args || {};
    const len = (typeof a.len === 'number' && isFinite(a.len)) ? Math.floor(a.len) : 0;
    if (len < 3) return 0;
    const fuel = a.fuel || TIME_FUEL;
    const baseSecs = (typeof a.baseSecs === 'number' && isFinite(a.baseSecs)) ? a.baseSecs : fuel.BASE_SECS;
    const capSecs = (typeof a.capSecs === 'number' && isFinite(a.capSecs)) ? a.capSecs : fuel.CAP_SECS;
    const earnedMs = (typeof a.earnedMs === 'number' && isFinite(a.earnedMs) && a.earnedMs > 0) ? a.earnedMs : 0;
    const base = len >= 7 ? fuel.sevenPlusMs : (fuel.perLen[len] || 0);
    const grant = base + (a.isClue ? fuel.CLUE_BONUS_MS : 0);
    const room = Math.max(0, capSecs * 1000 - baseSecs * 1000 - earnedMs);
    return Math.min(grant, room);
  }

  const API = { RUN_VERSION, serializeRun, validateRun, remainingSecs, COUNT_IN_MS, countInStepAt,
    TIME_FUEL, timeForWord };
  root.SworblRun = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
