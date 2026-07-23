// tests/sworbl-core.test.js — run with: node tests/sworbl-core.test.js
// ⚠ DETERMINISM CONTRACT, PINNED. mulberry32 + hashSeed + shuffledBag feed the daily
// board seed: every player must deal the IDENTICAL board for a given calendar day.
// These known values are frozen — if a change flips any of them, every daily board,
// par-bot score, and leaderboard comparison silently forks. Never "fix" a failing
// value here without deciding, on purpose, to break the daily contract.
'use strict';
const assert = require('assert');
const C = require('../sworbl-core.js');

// --- mulberry32: same seed → same stream, forever ---------------------------------
{
  const r = C.mulberry32(12345);
  assert.strictEqual(r(), 0.9797282677609473);
  assert.strictEqual(r(), 0.3067522644996643);
  assert.strictEqual(r(), 0.484205421525985);
  const r2 = C.mulberry32(12345);
  assert.strictEqual(r2(), 0.9797282677609473, 'independent instances replay the identical stream');
}

// --- hashSeed: stable string → int hash (the day-seed derivation) -----------------
assert.strictEqual(C.hashSeed('2026-07-20'), 1161844537);
assert.strictEqual(C.hashSeed(''), 0);
assert.strictEqual(C.hashSeed('2026-07-20'), C.hashSeed('2026-07-20'));
assert.notStrictEqual(C.hashSeed('2026-07-20'), C.hashSeed('2026-07-21'), 'different days, different boards');

// --- dayKey: LOCAL calendar day, zero-padded --------------------------------------
assert.strictEqual(C.dayKey(new Date(2026, 6, 20)), '2026-07-20');
assert.strictEqual(C.dayKey(new Date(2026, 0, 3)), '2026-01-03');

// --- shuffledBag: seeded Fisher-Yates, quota-preserving ---------------------------
{
  assert.strictEqual(C.shuffledBag('abcde', C.mulberry32(1)).join(''), 'ecbad');
  const shuffled = C.shuffledBag(C.BAG, C.mulberry32(7)).join('');
  assert.strictEqual(shuffled.split('').sort().join(''), C.BAG.split('').sort().join(''), 'a shuffle never creates or loses letters');
}

// --- the actual daily letter queue (seed → queue pipeline, as newGame builds it) --
{
  const seedN = C.hashSeed('2026-07-20');
  const qr = C.mulberry32(seedN ^ 0x51AC1E);
  const q = C.shuffledBag(C.FRIENDLY, qr).concat(C.shuffledBag(C.BAG, qr));
  assert.strictEqual(q.slice(0, 20).join(''), 'seatigenpndolnctusah', 'the 2026-07-20 opening deal is frozen for every player');
}

// --- letter model invariants ------------------------------------------------------
assert.strictEqual(C.BAG.length, 93);
assert.strictEqual(C.FRIENDLY.length, 35);
assert.strictEqual(C.VOWELS, 'aaeeeeiiou');
assert.strictEqual(C.expandLetter('q'), 'qu', "the Q tile IS 'Qu'");
assert.strictEqual(C.expandLetter('a'), 'a');
assert.strictEqual(C.dispLetter('q'), 'Qu');
assert.strictEqual(C.dispLetter('x'), 'X');

// --- scoring primitives (the shipped curve) ---------------------------------------
assert.strictEqual(C.letterVal('q'), 10);
assert.strictEqual(C.letterVal('e'), 1);
assert.strictEqual(C.letterVal('e', 1), 2, 'a stacked twin doubles the tile');
assert.strictEqual(C.lenMult(3), 1);
assert.strictEqual(C.lenMult(4), 1.5);
assert.strictEqual(C.lenMult(5), 2.5);
assert.strictEqual(C.lenMult(6), 4);
assert.strictEqual(C.lenMult(7), 6);
assert.strictEqual(C.lenMult(9), 6, '7+ caps the curve');
assert.strictEqual(C.streakMult(0), 1);
assert.strictEqual(C.streakMult(3), 1.5);
assert.strictEqual(C.streakMult(6), 2);
assert.strictEqual(C.streakMult(30), 2, 'streak multiplier caps at 2x');

// --- msToNextDay: countdown-to-next-day math (the home dock's H:MM:SS + "next puzzle in")
// -- pinned across a plain midnight boundary AND a DST transition day, since setHours(24,...)
// must roll to the correct WALL-CLOCK next midnight either way -----------------------------
{
  assert.strictEqual(C.msToNextDay(new Date(2026, 6, 20, 0, 0, 0, 0)), 24 * 3600000, 'exactly at midnight -> a full day remains');
  assert.strictEqual(C.msToNextDay(new Date(2026, 6, 20, 23, 59, 59, 0)), 1000, '1 second before midnight -> 1000ms left');
  assert.strictEqual(C.msToNextDay(new Date(2026, 6, 20, 12, 0, 0, 0)), 12 * 3600000, 'noon -> exactly 12h left');
  assert.strictEqual(C.msToNextDay(new Date(2026, 6, 20, 0, 0, 0, 0)) >= 0, true, 'never negative');

  // DST transitions — America/New_York, 2026: spring-forward is a 23h day (Mar 8), fall-back
  // is a 25h day (Nov 1). Real Date arithmetic (not naive calendar-field math) must reflect
  // the actual wall-clock gap, not a hardcoded 24h.
  const origTZ = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    assert.strictEqual(C.msToNextDay(new Date(2026, 2, 7, 0, 0, 0, 0)), 24 * 3600000, 'the day before spring-forward (Mar 7) is a normal 24h day');
    assert.strictEqual(C.msToNextDay(new Date(2026, 2, 8, 0, 0, 0, 0)), 23 * 3600000, 'spring-forward day itself (Mar 8, 2026) is 23h, clocks skip 2am->3am');
    assert.strictEqual(C.msToNextDay(new Date(2026, 9, 31, 0, 0, 0, 0)), 24 * 3600000, 'the day before fall-back (Oct 31) is still a normal 24h day');
    assert.strictEqual(C.msToNextDay(new Date(2026, 10, 1, 0, 0, 0, 0)), 25 * 3600000, 'fall-back day itself (Nov 1, 2026) is 25h, clocks repeat 2am->1am');
  } finally {
    if (origTZ === undefined) delete process.env.TZ; else process.env.TZ = origTZ;
  }
}

// --- containsFoulTerm: word-boundary matching, not naive substring (Scunthorpe problem) ---
{
  const FOUL = ['nig', 'fag', 'cunt', 'sex', 'cock', 'tard', 'damn'];
  // classic false positives a plain .includes(w) would trip — none of these are profane
  assert.strictEqual(C.containsFoulTerm('SCUNTHORPE', FOUL), false, '"cunt" mid-word (preceded by s) must not flag Scunthorpe');
  assert.strictEqual(C.containsFoulTerm('ESSEX', FOUL), false, '"sex" mid-word (preceded by s) must not flag Essex');
  assert.strictEqual(C.containsFoulTerm('HITCHCOCK', FOUL), false, '"cock" mid-word (preceded by h) must not flag Hitchcock');
  assert.strictEqual(C.containsFoulTerm('KNIGHT', FOUL), false, '"nig" mid-word (preceded by k) must not flag Knight');
  assert.strictEqual(C.containsFoulTerm('CUSTARD', FOUL), false, '"tard" mid-word (preceded by s) must not flag Custard');
  // the list's deliberately-truncated stems still catch their real variants (boundary at
  // the START of the match is enough — nothing requires the WHOLE word to be the stem)
  assert.strictEqual(C.containsFoulTerm('FAGGOT', FOUL), true, 'stem "fag" at the start of a word must still be caught');
  assert.strictEqual(C.containsFoulTerm('DAMNIT', FOUL), true, 'stem "damn" at the start of a word must still be caught');
  assert.strictEqual(C.containsFoulTerm('SEX', FOUL), true, 'the bare term itself must always be caught');
  assert.strictEqual(C.containsFoulTerm('MY SEX NAME', FOUL), true, 'a term as its own word mid-string (real boundary) is still caught');
  // case-insensitive, empty/null-safe
  assert.strictEqual(C.containsFoulTerm('fAgGoT', FOUL), true, 'case-insensitive');
  assert.strictEqual(C.containsFoulTerm('', FOUL), false);
  assert.strictEqual(C.containsFoulTerm(null, FOUL), false);
  assert.strictEqual(C.containsFoulTerm('CLEANNAME', FOUL), false);
}

console.log('sworbl-core: all tests passed');
