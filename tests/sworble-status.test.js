// tests/sworble-status.test.js — run with: node tests/sworble-status.test.js
// The daily-status selector is THE single answer to "what's the player's status today."
// Every home/graph/header surface must read from it, so these tests pin the exact
// source-priority rules that used to be hand-rolled (differently) in five places.
'use strict';
const assert = require('assert');
const S = require('../sworble-status.js');

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

// --- rankFor ----------------------------------------------------------------------
{
  const field = [{ name: 'A', score: 300 }, { name: 'B', score: 200 }, { name: 'C', score: 100 }];
  assert.strictEqual(S.rankFor(field, 250), 2);
  assert.strictEqual(S.rankFor(field, 400), 1);
  assert.strictEqual(S.rankFor(field, 50), 4);
  assert.strictEqual(S.rankFor([], 10), 1);
  assert.strictEqual(S.rankFor(null, 10), 1);
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
console.log('sworble-status: sworb theme-rank passed');

console.log('sworble-status: sworb block passed');

console.log('sworble-status: all tests passed');
