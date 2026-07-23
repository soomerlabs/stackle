// tests/sworbl-run.test.js — run with: node tests/sworbl-run.test.js
// Covers the live-run snapshot layer (sworbl-run.js): serialize -> validate round trip,
// transient-field stripping, and every rejection path validateRun guards against.
'use strict';
const assert = require('assert');
const SworblRun = require('../sworbl-run.js');
const SworblStore = require('../sworbl-store.js');

const DAY = '2026-07-20';

function liveTile(extra) {
  return Object.assign({
    id: 7, letter: 'a', row: 5, col: 2, color: 4, boost: 1, mine: true, stackColors: [2, 4],
    // transient/animation fields that must NOT survive a snapshot:
    spawn: true, dead: false, clearing: false, mergeTo: { c: 1, r: 2 }, boostFlash: true,
    stretch: {}, preLit: true, intro: true, introDelay: 0.2, dealDelay: 0.3, armed: true, armedBad: true,
  }, extra || {});
}

function validSrc(extra) {
  return Object.assign({
    day: DAY, cols: 5, rows: 6, tileSeq: 42, queueIdx: 17, juiceNext: 1,
    rngN: { rand: 3, rowRand: 8, mineRand: 2 },
    tiles: [liveTile(), liveTile({ id: 8, letter: 'b', mine: false, boost: 0, stackColors: null })],
    nextRow: [{ letter: 'e', color: 1 }, null, { letter: 't', color: 3 }],
    score: 150, guessesLeft: 12, streak: 2, maxStreak: 4,
    roundWords: [{ word: 'apt', pts: 15, colors: [0, 1, 2], best: false }],
    boardElapsedMs: 65000, bestRun: 1, bestHits: 1, bombRun: 0, mergedOnce: true,
    openingSnapshot: [{ letter: 'a', row: 5, col: 0 }],
  }, extra || {});
}

// --- store contract -------------------------------------------------------
assert.strictEqual(SworblStore.K.RUN_PREFIX, 'sworbl_run_', 'K.RUN_PREFIX must exist for the snapshot key');

// --- serializeRun ---------------------------------------------------------
{
  const src = validSrc();
  const before = JSON.stringify(src);
  const snap = SworblRun.serializeRun(src);
  assert.ok(snap, 'valid src serializes');
  assert.strictEqual(JSON.stringify(src), before, 'serializeRun must not mutate its input');
  assert.strictEqual(snap.v, SworblRun.RUN_VERSION);
  assert.strictEqual(snap.day, DAY);
  assert.strictEqual(snap.score, 150);
  assert.strictEqual(snap.guessesLeft, 12);
  assert.strictEqual(snap.queueIdx, 17);
  assert.strictEqual(snap.cols, 5);
  assert.strictEqual(snap.rows, 6);
  assert.strictEqual(SworblRun.serializeRun(validSrc({ cols: undefined, rows: undefined })).cols, null, 'geometry is optional');
  assert.deepStrictEqual(snap.rngN, { rand: 3, rowRand: 8, mineRand: 2 });
  assert.strictEqual(snap.tiles.length, 2);
  const t = snap.tiles[0];
  assert.deepStrictEqual(t, { id: 7, letter: 'a', row: 5, col: 2, color: 4, boost: 1, mine: true, stackColors: [2, 4] },
    'snapshot tiles keep ONLY durable fields (no animation/transient state)');
  assert.strictEqual(snap.tiles[1].mine, false);
  assert.strictEqual(snap.tiles[1].stackColors, null);
  // JSON-safe end to end
  assert.deepStrictEqual(JSON.parse(JSON.stringify(snap)), snap, 'snapshot must survive a JSON round trip');
}
{
  // dead / clearing tiles are gone from the board — they must not be resurrected
  const snap = SworblRun.serializeRun(validSrc({ tiles: [liveTile(), liveTile({ id: 9, dead: true }), liveTile({ id: 10, clearing: true })] }));
  assert.strictEqual(snap.tiles.length, 1, 'dead/clearing tiles are dropped from the snapshot');
}
{
  assert.strictEqual(SworblRun.serializeRun(null), null);
  assert.strictEqual(SworblRun.serializeRun(validSrc({ day: '' })), null, 'no day -> no snapshot');
  assert.strictEqual(SworblRun.serializeRun(validSrc({ tiles: [] })), null, 'empty board -> no snapshot');
  assert.strictEqual(SworblRun.serializeRun(validSrc({ guessesLeft: 0 })), null, 'spent budget -> no snapshot (run is over)');
  assert.strictEqual(SworblRun.serializeRun(validSrc({ score: NaN })), null, 'non-finite score -> no snapshot');
}

// --- validateRun ----------------------------------------------------------
{
  const snap = SworblRun.serializeRun(validSrc());
  const back = SworblRun.validateRun(JSON.parse(JSON.stringify(snap)), DAY);
  assert.ok(back, 'round trip validates');
  assert.strictEqual(back.score, 150);

  assert.strictEqual(SworblRun.validateRun(null, DAY), null);
  assert.strictEqual(SworblRun.validateRun({}, DAY), null);
  assert.strictEqual(SworblRun.validateRun(snap, '2026-07-21'), null, 'yesterday\'s run never restores today');
  assert.strictEqual(SworblRun.validateRun(Object.assign({}, snap, { v: 0 }), DAY), null, 'version mismatch -> fresh deal');
  assert.strictEqual(SworblRun.validateRun(Object.assign({}, snap, { tiles: [] }), DAY), null);
  assert.strictEqual(SworblRun.validateRun(Object.assign({}, snap, { tiles: 'nope' }), DAY), null);
  assert.strictEqual(SworblRun.validateRun(Object.assign({}, snap, { guessesLeft: 0 }), DAY), null);
  assert.strictEqual(SworblRun.validateRun(Object.assign({}, snap, { rngN: null }), DAY), null);
  assert.strictEqual(SworblRun.validateRun(Object.assign({}, snap, { queueIdx: -1 }), DAY), null);
  // corrupt tile inside an otherwise valid snapshot
  const badTile = Object.assign({}, snap, { tiles: [Object.assign({}, snap.tiles[0], { letter: 7 })] });
  assert.strictEqual(SworblRun.validateRun(badTile, DAY), null, 'malformed tile -> reject whole snapshot');
}

// --- remainingSecs: restoreRun's remaining-round-time arithmetic (pinned — the T1 Critical
// lived exactly here: a reload must resume with REMAINING time, not a fresh full clock, and
// must never go negative) ------------------------------------------------------------------
{
  assert.strictEqual(SworblRun.remainingSecs(300, 0), 300, 'no time elapsed -> full round');
  assert.strictEqual(SworblRun.remainingSecs(300, 45000), 255, 'partial: 45s elapsed of 300s');
  assert.strictEqual(SworblRun.remainingSecs(300, 300000), 0, 'fully expired -> 0, never negative');
  assert.strictEqual(SworblRun.remainingSecs(300, 999999), 0, 'over-expired -> still 0, never negative');
  assert.strictEqual(SworblRun.remainingSecs(30, 29900), 1, 'elapsed floors to whole seconds (29.9s -> 29s spent, 1s left)');
  assert.strictEqual(SworblRun.remainingSecs(300, null), 300, 'null boardElapsedMs -> treated as 0 elapsed');
  assert.strictEqual(SworblRun.remainingSecs(300, undefined), 300, 'undefined boardElapsedMs -> treated as 0 elapsed');
  assert.strictEqual(SworblRun.remainingSecs(null, 1000), 0, 'null roundSecs -> treated as 0-length round');
}

// --- countInStepAt: armCountIn's shared 3·2·1·GO count-in beat, extracted as a pure
// transition table. armCountIn (index.html) keeps its own token-guard mechanism and the
// actual this.later()/setTimeout wiring exactly as before — only the WHAT (which countIn
// value/branch fires at which millisecond) moved here. Pins the exact timings (700, 1400,
// 2100, 2750, 3300ms), the RELEASE step's modal branch, and UNMOUNT's 'out'-only semantics. -
{
  assert.strictEqual(typeof SworblRun.countInStepAt, 'function', 'countInStepAt exported');
  const MS = SworblRun.COUNT_IN_MS;
  assert.deepStrictEqual(MS, { STEP2: 700, STEP1: 1400, GO: 2100, RELEASE: 2750, UNMOUNT: 3300 }, 'exact timing chain pinned');

  // the three plain numeral/GO beats — unconditional, ignore ctx entirely
  assert.deepStrictEqual(SworblRun.countInStepAt(700, {}), { countIn: 2 });
  assert.deepStrictEqual(SworblRun.countInStepAt(1400, {}), { countIn: 1 });
  assert.deepStrictEqual(SworblRun.countInStepAt(2100, {}), { countIn: 'GO' });
  assert.deepStrictEqual(SworblRun.countInStepAt(MS.STEP2, { activeModal: true }), { countIn: 2 }, 'STEP2/STEP1/GO are unaffected by ctx');

  // RELEASE (2750ms): the board unlocks + the overlay begins its fade-out UNLESS a modal
  // is open, in which case it's left for the modal's own close path to resolve
  assert.deepStrictEqual(SworblRun.countInStepAt(2750, { activeModal: false }), { countIn: 'out', paused: false }, 'no modal -> release + unpause');
  assert.deepStrictEqual(SworblRun.countInStepAt(2750, {}), { countIn: 'out', paused: false }, 'no ctx.activeModal -> same as false');
  assert.deepStrictEqual(SworblRun.countInStepAt(2750, { activeModal: true }), { countIn: null }, 'a modal open at release time gets its own path — paused untouched');

  // UNMOUNT (3300ms): only unmounts the overlay if it's still mid fade-out ('out'); any
  // other value (already resolved by RELEASE, or reset by a modal) -> no-op (null)
  assert.deepStrictEqual(SworblRun.countInStepAt(3300, { countIn: 'out' }), { countIn: null }, 'still fading out -> unmount');
  assert.strictEqual(SworblRun.countInStepAt(3300, { countIn: null }), null, 'already resolved -> no-op');
  assert.strictEqual(SworblRun.countInStepAt(3300, { countIn: 3 }), null, 'a fresh re-arm already moved past this stale step -> no-op');
  assert.strictEqual(SworblRun.countInStepAt(3300, {}), null, 'no countIn in ctx -> no-op');

  // unknown ms -> null, never throws
  assert.strictEqual(SworblRun.countInStepAt(9999, {}), null);
  // null ctx never throws — treated the same as an empty ctx
  assert.deepStrictEqual(SworblRun.countInStepAt(2750, null), { countIn: 'out', paused: false }, 'null ctx -> same as {} (no activeModal)');
  assert.strictEqual(SworblRun.countInStepAt(3300, null), null, 'null ctx -> same as {} (no countIn)');
}
console.log('sworbl-run: countInStepAt passed');

console.log('sworbl-run: all tests passed');
