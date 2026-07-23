// tests/sworbl-status.test.js — run with: node tests/sworbl-status.test.js
// The daily-status selector is THE single answer to "what's the player's status today."
// Every home/graph/header surface must read from it, so these tests pin the exact
// source-priority rules that used to be hand-rolled (differently) in five places.
'use strict';
const assert = require('assert');
const S = require('../sworbl-status.js');

// --- sevenFromWords: best-per-word, top 7, descending, totaled --------------------
{
  const seven = S.sevenFromWords([
    { word: 'apt', pts: 15, best: false },
    { word: 'apt', pts: 22, best: true },   // same word, better play — keep the best copy
    { word: 'torch', pts: 90, best: false },
    { word: 'x1', pts: 1 }, { word: 'x2', pts: 2 }, { word: 'x3', pts: 3 },
    { word: 'x4', pts: 4 }, { word: 'x5', pts: 5 }, { word: 'x6', pts: 6 }, // 9 distinct → clipped to 7
  ]);
  assert.strictEqual(seven.words.length, 7);
  assert.strictEqual(seven.words[0].word, 'torch');
  assert.strictEqual(seven.words[1].word, 'apt');
  assert.strictEqual(seven.words[1].pts, 22, 'dedupe keeps the higher-scoring copy');
  assert.strictEqual(seven.words[1].best, true);
  assert.strictEqual(seven.total, 90 + 22 + 6 + 5 + 4 + 3 + 2);
  assert.ok(!seven.words.some(w => w.word === 'x1'), 'lowest scorer clipped by the top-7');
  assert.deepStrictEqual(S.sevenFromWords([]), { words: [], total: 0 });
  assert.deepStrictEqual(S.sevenFromWords(null), { words: [], total: 0 });
  assert.deepStrictEqual(S.sevenFromWords([{ word: '', pts: 5 }, { word: 'ok', pts: 0 }]), { words: [], total: 0 }, 'empty words and zero scores are noise');
}

// --- cumulativeTotal: sums best-pts per distinct word, uncapped, no double-count --
{
  const S = require('../sworbl-status.js');
  assert.strictEqual(typeof S.cumulativeTotal, 'function', 'cumulativeTotal exported');
  // 8 distinct words -> ALL count (best-7 would drop the smallest); dup word -> best pts only
  const rw = [
    { word: 'a', pts: 10 }, { word: 'b', pts: 9 }, { word: 'c', pts: 8 },
    { word: 'd', pts: 7 }, { word: 'e', pts: 6 }, { word: 'f', pts: 5 },
    { word: 'g', pts: 4 }, { word: 'h', pts: 3 },        // 8th word: +3 (best-7 would drop it)
    { word: 'A', pts: 2 },                                // dup of 'a' at lower pts -> ignored
    { word: 'z', pts: 0 }, { word: '', pts: 5 },          // zero/blank -> ignored
  ];
  assert.strictEqual(S.cumulativeTotal(rw), 10+9+8+7+6+5+4+3, 'uncapped sum of best-per-word');
  assert.strictEqual(S.cumulativeTotal([]), 0, 'empty -> 0');
  assert.strictEqual(S.cumulativeTotal(null), 0, 'null-safe');
  // dailyStatus.seven.total + bestToday reflect the cumulative total (not the best-7 cap)
  const ds = S.dailyStatus({ live: { active: true, over: false, roundWords: rw, tilesCount: 5 } });
  assert.strictEqual(ds.seven.total, 52, 'live seven.total is cumulative');
  assert.strictEqual(ds.bestToday, 52, 'bestToday is cumulative');
  assert.strictEqual(ds.seven.words.length, 7, 'display list still capped at 7');
}

// --- rankFor ------------------------------------------------------------------------
// back-compat: plain-number "me" against a score-only field behaves exactly like before
{
  const field = [{ name: 'A', score: 300 }, { name: 'B', score: 200 }, { name: 'C', score: 100 }];
  assert.strictEqual(S.rankFor(field, 250), 2);
  assert.strictEqual(S.rankFor(field, 400), 1);
  assert.strictEqual(S.rankFor(field, 50), 4);
  assert.strictEqual(S.rankFor([], 10), 1);
  assert.strictEqual(S.rankFor(null, 10), 1);
}
// solved-first, score-second: a solved entry always outranks an unsolved one, regardless
// of score; ties within the same solved bucket fall back to score.
{
  const A = { score: 1480, solved: true };
  const B = { score: 1360, solved: false };
  const C = { score: 1240, solved: true };
  const field = [A, B, C];
  const others = (me) => field.filter(e => e !== me);
  assert.strictEqual(S.rankFor(others(A), A), 1, 'A: highest score, solved -> #1');
  assert.strictEqual(S.rankFor(others(B), B), 3, 'B: higher score than C but unsolved -> behind both solved entries');
  assert.strictEqual(S.rankFor(others(C), C), 2, 'C: solved but outscored by solved A -> #2, still ahead of unsolved B');
  // an unsolved "me" against an all-unsolved field falls back to plain score ordering
  assert.strictEqual(S.rankFor([{ score: 900, solved: false }, { score: 700, solved: false }], { score: 800, solved: false }), 2);
}

// --- dailyStatus ------------------------------------------------------------------
const BASE = {
  done: false, storedDailyBest: 0, storedSeven: null, puzzleBest: 0, lbMe: null,
  savedRun: null, live: { active: false, over: false, roundWords: [], tilesCount: 0 },
};
function st(over) { return S.dailyStatus(Object.assign({}, BASE, over)); }

{ // untouched day
  const s = st({});
  assert.strictEqual(s.played, false);
  assert.strictEqual(s.bestToday, 0);
  assert.strictEqual(s.resumable, false);
  assert.deepStrictEqual(s.seven, { words: [], total: 0, live: false });
}
{ // live run in memory → seven comes from the live words and counts toward bestToday
  const s = st({ live: { active: true, over: false, roundWords: [{ word: 'apt', pts: 15 }], tilesCount: 30 } });
  assert.strictEqual(s.played, true);
  assert.strictEqual(s.bestToday, 15);
  assert.strictEqual(s.resumable, true, 'a live unfinished run resumes');
  assert.strictEqual(s.seven.live, true);
  assert.strictEqual(s.seven.words[0].word, 'apt');
}
{ // live run beats a worse stored day; stored beats a worse live run
  assert.strictEqual(st({ storedDailyBest: 10, live: { active: true, over: false, roundWords: [{ word: 'apt', pts: 15 }], tilesCount: 30 } }).bestToday, 15);
  assert.strictEqual(st({ storedDailyBest: 99, live: { active: true, over: false, roundWords: [{ word: 'apt', pts: 15 }], tilesCount: 30 } }).bestToday, 99);
}
{ // saved snapshot (pre-rehydrate) → resumable, and its words count as the seven
  const savedRun = { roundWords: [{ word: 'torch', pts: 90 }], score: 90 };
  const s = st({ savedRun });
  assert.strictEqual(s.resumable, true, 'a saved snapshot resumes even before rehydrate');
  assert.strictEqual(s.bestToday, 90);
  assert.strictEqual(s.seven.words[0].word, 'torch');
  assert.strictEqual(s.seven.live, true, 'snapshot words are an in-progress run');
}
{ // live memory wins over the snapshot when both exist (memory is fresher)
  const savedRun = { roundWords: [{ word: 'old', pts: 5 }], score: 5 };
  const s = st({ savedRun, live: { active: true, over: false, roundWords: [{ word: 'apt', pts: 15 }], tilesCount: 30 } });
  assert.strictEqual(s.seven.words[0].word, 'apt');
}
{ // done day: nothing resumes, stored results are the story
  const s = st({ done: true, storedDailyBest: 120, storedSeven: { score: 120, words: [{ word: 'pence', pts: 120 }] }, savedRun: { roundWords: [], score: 0 } });
  assert.strictEqual(s.resumable, false, 'a finished day never resumes');
  assert.strictEqual(s.played, true);
  assert.strictEqual(s.bestToday, 120);
  assert.strictEqual(s.seven.live, false);
  assert.strictEqual(s.seven.words[0].word, 'pence');
}
{ // an over run in memory does not resume
  const s = st({ live: { active: true, over: true, roundWords: [{ word: 'apt', pts: 15 }], tilesCount: 30 } });
  assert.strictEqual(s.resumable, false);
}
{ // all storage sources feed bestToday (leaderboard submit, per-mode best, day best)
  assert.strictEqual(st({ lbMe: { name: 'P', score: 70 } }).bestToday, 70);
  assert.strictEqual(st({ puzzleBest: 80 }).bestToday, 80);
  assert.strictEqual(st({ storedSeven: { score: 60, words: [] } }).bestToday, 60);
}
{ // malformed inputs never throw — the selector is the safe layer
  const s = S.dailyStatus({});
  assert.strictEqual(s.played, false);
  assert.strictEqual(s.resumable, false);
  assert.strictEqual(S.dailyStatus(null).played, false);
}

// --- sworb block -------------------------------------------------------------------
{
  const entry = { sworb: 'ocean', themeWords: ['tide','coral','wave','reef','salt'] };
  const base = { done:false, storedDailyBest:0, storedSeven:null, puzzleBest:0, lbMe:null, savedRun:null, live:{active:false,over:false,roundWords:[],tilesCount:0} };
  const off = S.dailyStatus(base).sworb;
  assert.deepStrictEqual(off, { active: false }, 'no sworb src -> inactive');
  const on = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: ['tide','wave'], guessesUsed: 2, solved: false } })).sworb;
  assert.strictEqual(on.active, true);
  assert.strictEqual(on.total, 5);
  assert.strictEqual(on.foundCount, 2);
  assert.strictEqual(on.guessesLeft, 4, 'guessesLeft counts down from 6 (6 - 2 used)');
  assert.strictEqual(on.solved, false);
  assert.strictEqual(on.canGuess, true);
  const solved = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: ['tide'], guessesUsed: 1, solved: true } })).sworb;
  assert.strictEqual(solved.canGuess, false, 'solved -> cannot guess');
  const spent = S.dailyStatus(Object.assign({}, base, { sworb: { entry, cluesFound: [], guessesUsed: 6, solved: false } })).sworb;
  assert.strictEqual(spent.guessesLeft, 0, 'all 6 guesses used -> 0 left');
  assert.strictEqual(spent.canGuess, false, 'no guesses left -> cannot guess');
}

// --- sworb theme-rank block --------------------------------------------------------
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
console.log('sworbl-status: sworb theme-rank passed');

console.log('sworbl-status: sworb block passed');

// --- dayState: the day's persisted finale lifecycle (fresh/finale/done), no live/runtime
// board state involved — the T3 re-entry Critical (endRound/frame re-entering the finale
// pipeline every animation frame) lived in exactly this state machine. finalePending()/
// dailyConsumed() in index.html both delegate to this single source of truth now.
// NOTE: 'live' (a round currently being hunted) is not derivable from {done, solved,
// guessesUsed} alone — the sworb-guess UI only ever unlocks once `done` is already true (see
// endRound's finale gate), so done:false always means guessesUsed:0/solved:false regardless
// of whether a round is mid-hunt or never started. Callers layer the runtime `_dailyLive`
// signal on top of dayState()==='fresh' when they need to tell "in progress" from "untouched."
{
  assert.strictEqual(S.dayState({ done: false, solved: false, guessesUsed: 0 }), 'fresh', 'not done yet -> fresh');
  assert.strictEqual(S.dayState({ done: false, solved: true, guessesUsed: 6 }), 'fresh', 'done always wins first regardless of stray solved/guessesUsed');
  assert.strictEqual(S.dayState({ done: true, solved: false, guessesUsed: 0 }), 'finale', 'finale just unlocked, no guesses spent yet');
  assert.strictEqual(S.dayState({ done: true, solved: false, guessesUsed: 3 }), 'finale', 'mid-finale, guesses remain');
  assert.strictEqual(S.dayState({ done: true, solved: false, guessesUsed: 5 }), 'finale', 'one guess left -> still finale (matches guessesLeft>0)');
  assert.strictEqual(S.dayState({ done: true, solved: true, guessesUsed: 1 }), 'done', 'solved (even early) -> done');
  assert.strictEqual(S.dayState({ done: true, solved: false, guessesUsed: 6 }), 'done', 'all 6 guesses exhausted, unsolved -> done');
  assert.strictEqual(S.dayState({ done: true, solved: false, guessesUsed: 9 }), 'done', 'over-count is safe -> still done, never negative guessesLeft');
  assert.strictEqual(S.dayState({ done: true }), 'finale', 'missing solved/guessesUsed default to falsy/0 -> finale (6 fresh guesses)');
  assert.strictEqual(S.dayState({}), 'fresh', 'empty input -> fresh, never throws');
  assert.strictEqual(S.dayState(null), 'fresh', 'null input -> fresh, never throws');
}
console.log('sworbl-status: dayState passed');

// --- progressToTop: the home slim-strip's fill%/knob-hit math (you vs. the field's top
// score) — pinned: top=0 (nobody's posted yet), you>top (clamped, still a hit), rounding ---
{
  assert.deepStrictEqual(S.progressToTop(0, 0), { pct: 0, hit: false }, 'no top score yet -> 0%, never a hit');
  assert.deepStrictEqual(S.progressToTop(500, 0), { pct: 0, hit: false }, 'top=0 with a nonzero you is still 0% (nothing to chase)');
  assert.deepStrictEqual(S.progressToTop(0, 1000), { pct: 0, hit: false }, 'dormant (no play yet) -> 0%');
  assert.deepStrictEqual(S.progressToTop(250, 1000), { pct: 25, hit: false }, 'exact quarter of the way there');
  assert.deepStrictEqual(S.progressToTop(1000, 1000), { pct: 100, hit: true }, 'exactly matching the top score IS a hit');
  assert.deepStrictEqual(S.progressToTop(1500, 1000), { pct: 100, hit: true }, 'beating the top score clamps the fill at 100%, still a hit');
  assert.deepStrictEqual(S.progressToTop(333, 1000), { pct: 33, hit: false }, 'rounds to nearest whole percent (33.3 -> 33)');
  assert.deepStrictEqual(S.progressToTop(667, 1000), { pct: 67, hit: false }, 'rounds to nearest whole percent (66.7 -> 67)');
}
console.log('sworbl-status: progressToTop passed');

// --- reconcileFinaleScore: bankFinaleBonus's score-banking math (extracted, pinning
// TODAY's behavior). banked = max(live state.score, storedBest+bonus) — covers both the
// uninterrupted-play path (state.score already equals storedBest+bonus) and the mid-finale
// re-entry path (state.score resets to bonus-only, so storedBest+bonus must win). The RUNS
// history entry is separately ratcheted up to `banked` but never regressed downward.
{
  assert.strictEqual(typeof S.reconcileFinaleScore, 'function', 'reconcileFinaleScore exported');

  // uninterrupted path: state.score already carries roundScore+bonus == storedBest+bonus
  assert.deepStrictEqual(
    S.reconcileFinaleScore({ stateScore: 1150, storedBest: 1100, bonus: 50, runsLast: 0 }),
    { banked: 1150, runsLast: 1150 },
    'uninterrupted: state.score and storedBest+bonus agree'
  );

  // re-entry path: state.score was reset (finale re-entered), so it's bonus-ONLY —
  // storedBest+bonus must win over the deflated live score
  assert.deepStrictEqual(
    S.reconcileFinaleScore({ stateScore: 50, storedBest: 1100, bonus: 50, runsLast: 0 }),
    { banked: 1150, runsLast: 1150 },
    're-entry: storedBest+bonus wins over the bonus-only live score'
  );

  // runs never regress: a higher pre-existing runsLast survives even though banked is lower
  assert.deepStrictEqual(
    S.reconcileFinaleScore({ stateScore: 900, storedBest: 800, bonus: 50, runsLast: 2000 }),
    { banked: 900, runsLast: 2000 },
    'runs history never regresses below a higher prior entry'
  );

  // runs ratchet UP to a new banked high
  assert.deepStrictEqual(
    S.reconcileFinaleScore({ stateScore: 500, storedBest: 400, bonus: 100, runsLast: 300 }),
    { banked: 500, runsLast: 500 },
    'runs history ratchets up to the new banked total'
  );

  // zero/null safety: every field defaults safely, never throws, never negative
  assert.deepStrictEqual(S.reconcileFinaleScore({}), { banked: 0, runsLast: 0 }, 'empty input -> all zero');
  assert.deepStrictEqual(S.reconcileFinaleScore(null), { banked: 0, runsLast: 0 }, 'null input -> all zero, never throws');
  assert.deepStrictEqual(
    S.reconcileFinaleScore({ stateScore: null, storedBest: undefined, bonus: NaN, runsLast: -5 }),
    { banked: 0, runsLast: 0 },
    'malformed fields sanitize to 0, never NaN/negative'
  );
}
console.log('sworbl-status: reconcileFinaleScore passed');

console.log('sworbl-status: all tests passed');
