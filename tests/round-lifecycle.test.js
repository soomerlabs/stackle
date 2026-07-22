'use strict';
// tests/round-lifecycle.test.js — THE headless round test. Drives a full daily — deal →
// spell → clock-expiry → finale guesses → solve → bank — end-to-end through the PURE layer
// (sworble-core/seed/solver/daily/status/flow) with NO browser and NO jsdom.
//
// WHY reducer-level, not a DOM boot: a full boot of the dc-runtime + React render tree is
// brittle (a headless render of a 6000-line component drags in AudioContext, rAF, layout
// measurement, LS, and timers — a test harness that breaks on unrelated UI churn). The value
// of an integration test here is proving the DECISION layer composes correctly across a whole
// round: that the same state-shape flows deal → accumulate → route → resolve → bank and lands
// on the right persisted values. That lives entirely in the pure modules, so we drive THEM
// directly and assert both the accumulated persisted shape AND the flow module's routing at
// each stage. The Component's job (setState/LS/sfx/timers) is a thin side-effect shell over
// exactly these calls; each pure piece is unit-pinned in its own suite.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Core = require('../sworble-core.js');
const Seed = require('../sworble-seed.js');
const Solver = require('../sworble-solver.js');
const Daily = require('../sworble-daily.js');
const Status = require('../sworble-status.js');
const Flow = require('../sworble-flow.js');

const root = path.join(__dirname, '..');
const dailies = JSON.parse(fs.readFileSync(path.join(root, 'dailies.json'), 'utf8'));

const DAY = '2026-07-20';           // fixture day: sworb "ocean"
const COLS = 5, ROWS = 6;
const CLUE_COUNT = 6;               // SWORB_CLUE_COUNT — "6 to find, 6 to crack it"

// ===================================================================================
// STAGE 0 — DEAL: the deterministic board for the fixture day (same two-pass seed the
// app runs in newGame). Determinism is the whole daily contract: same seed → byte-identical.
// ===================================================================================
const entry = Daily.parseEntry(dailies, DAY);
assert.ok(entry, DAY + ' parses');
assert.strictEqual(entry.sworb, 'ocean', 'fixture sworb is "ocean"');

function dealBoard() {
  const rngFactory = () => Core.mulberry32(Core.hashSeed(DAY + '|sworb'));
  return Seed.seedClueLettersTwoPass({ clues: entry.themeWords, cols: COLS, rows: ROWS, rngFactory, target: CLUE_COUNT });
}
const cand = dealBoard();
assert.ok(!cand.usedFallback, 'two-pass lands cleanly (no fallback)');
assert.strictEqual(cand.realized.length, CLUE_COUNT, 'realized set is exactly 6');

// byte-identical determinism: a second identical deal must match the first exactly
const cand2 = dealBoard();
assert.deepStrictEqual(cand2.realized, cand.realized, 'same seed → identical realized set (byte-identical)');
assert.deepStrictEqual(cand2.letters, cand.letters, 'same seed → identical stamped letters');

// the letter QUEUE (the live game's finite-bag dealer input) is deterministic off the same seed
function dealQueue() {
  const qr = Core.mulberry32(Core.hashSeed(DAY) ^ 0x51AC1E);
  return Core.shuffledBag(Core.FRIENDLY, qr)
    .concat(Core.shuffledBag(Core.BAG, qr), Core.shuffledBag(Core.BAG, qr), Core.shuffledBag(Core.BAG, qr));
}
assert.deepStrictEqual(dealQueue(), dealQueue(), 'letter queue is deterministic off the day seed');

// build the real tile board from the stamped letters and confirm every realized clue is
// findable on it (exactly newGame's `realized.filter(findWord ...)` verification)
let _tid = 1;
const tiles = Object.keys(cand.letters).map(k => {
  const rc = k.split(',').map(Number);
  return { id: _tid++, letter: cand.letters[k], row: rc[0], col: rc[1] };
});
for (const w of cand.realized) {
  assert.ok(Solver.findWord(tiles, { word: w, expand: Core.expandLetter, diag: true }),
    'realized clue "' + w + '" is findable on the dealt board');
}
console.log('round-lifecycle: STAGE 0 deal (deterministic board, 6 findable clues) passed');

// ===================================================================================
// The persisted round shape the Component keeps in state + LS. We mutate a plain object here
// exactly as the reducers would drive setState/saveSworb.
// ===================================================================================
const persisted = {
  roundWords: [],   // {word, pts, best} — every commit (ROUND_WORDS / roundWords state)
  found: [],        // FOUND_PREFIX — distinct clues caught (dedupe-safe)
  wordsSpelled: 0,  // words this round (hint-token threshold input)
  tokensEarned: 0,  // HINT tokens granted this round
  sworb: { guessesUsed: 0, solved: false, bonus: 0 }, // sworbState()
  done: false,      // DONE_PREFIX
};

// a spelled-word commit: bank any caught clue (resolveCatch), append to roundWords, re-total
function spell(word, pts) {
  const res = Daily.resolveCatch({ word: word, entry: entry, targets: cand.realized, found: persisted.found });
  persisted.found = res.banked;
  persisted.roundWords = persisted.roundWords.concat({ word: word, pts: pts, best: false });
  persisted.wordsSpelled += 1;
  return res;
}

// ===================================================================================
// STAGE 1 — SPELL: catch clues + a bonus word; cumulativeTotal / resolveCatch / bankClue
// accumulate. Dedupe must be reference-stable (the split-brain-glow bug class).
// ===================================================================================
const c0 = cand.realized[0], c1 = cand.realized[1], c2 = cand.realized[2];

let r = spell(c0, 40);
assert.strictEqual(r.clue, c0, 'spelling realized[0] banks its clue');
assert.strictEqual(r.isNew, true, 'first catch is new');
assert.deepStrictEqual(persisted.found, [c0], 'found now holds the first clue');

const foundRefBefore = persisted.found;
r = spell(c0, 40);
assert.strictEqual(r.isNew, false, 're-spelling the same clue is a no-op catch');
assert.strictEqual(persisted.found, foundRefBefore, 'dedupe preserves the SAME array reference (no split-brain glow)');

r = spell(c1 + 's', 55); // clue EXTENSION: "<clue>s" resolves to the base clue (clueFor longest-prefix)
assert.strictEqual(r.clue, c1, 'an extension of realized[1] banks the base clue');
assert.strictEqual(r.isNew, true, 'the extension is a fresh catch');

r = spell(c2, 33);
assert.strictEqual(r.isNew, true, 'third distinct clue banked');

r = spell('star', 12); // a valid non-clue bonus word: scores, banks no clue
assert.strictEqual(r.clue, null, 'a non-clue word banks nothing');
assert.strictEqual(r.isNew, false, 'no catch');

assert.strictEqual(persisted.found.length, 3, 'exactly 3 distinct clues caught');
// cumulativeTotal: best pts per DISTINCT word, uncapped, no double-count for the re-spell
const roundScore = Status.cumulativeTotal(persisted.roundWords);
assert.strictEqual(roundScore, 40 + 55 + 33 + 12, 'cumulativeTotal sums distinct best pts (the duplicate c0 is not double-counted)');
console.log('round-lifecycle: STAGE 1 spell/accumulate passed');

// ===================================================================================
// STAGE 2 — CLOCK EXPIRES: endRound routing. An unresolved sworb (unsolved, guesses live)
// morphs into the finale, does NOT hop home yet. dayState flips fresh → finale.
// ===================================================================================
assert.strictEqual(Status.dayState({ done: false }), 'fresh', 'pre-expiry the day is fresh');

const sw0 = Status.dailyStatus({ done: false, sworb: { entry: entry, cluesFound: persisted.found, guessesUsed: 0, solved: false } }).sworb;
const endRoute = Flow.endRoundRoute({
  practice: false, hasEntry: true,
  sworbActive: sw0.active, sworbSolved: sw0.solved, sworbGuessesLeft: sw0.guessesLeft,
});
assert.deepStrictEqual(endRoute, { route: 'finale', enteringFinale: true, homeReturn: false },
  'unresolved sworb at 0:00 → finale, no home hop yet');

// endRound writes DONE_PREFIX before the finale branch; the day is now in the finale state
persisted.done = true;
assert.strictEqual(Status.dayState({ done: true, solved: false, guessesUsed: 0 }), 'finale',
  'DONE written + unsolved + guesses left → finale (finalePending would be true)');
console.log('round-lifecycle: STAGE 2 clock-expiry → finale passed');

// ===================================================================================
// STAGE 3 — FINALE WRONG GUESSES: applySworbGuess / scoreGuess color flow / nextSlots
// keep-greens. Each miss with guesses left routes 'miss-continue'.
// ===================================================================================
function guess(word) {
  const colors = Daily.scoreGuess(word, entry.sworb);
  const res = Daily.applySworbGuess({
    input: word, entry: entry,
    guessesUsed: persisted.sworb.guessesUsed, solved: persisted.sworb.solved,
    foundCount: persisted.found.length, total: entry.themeWords.length,
  });
  return { colors: colors, res: res };
}

let g = guess('steam'); // wrong, 5 letters like "ocean"
assert.strictEqual(g.colors.length, 5, 'scoreGuess returns one color per letter');
assert.ok(g.colors.some(c => c !== 'green'), 'a wrong guess is not all-green');
assert.strictEqual(g.res.ok, true, 'guess processed');
assert.strictEqual(g.res.correct, false, 'wrong guess');
assert.strictEqual(g.res.lockedOut, false, 'guesses remain');
persisted.sworb.guessesUsed = g.res.newGuessesUsed; // 1
assert.strictEqual(Flow.finaleResolveRoute({ finale: true, correct: false, spent: g.res.guessesLeft <= 0 }),
  'miss-continue', 'a miss with guesses left continues the finale');

// nextSlots keep-greens: a fresh keystroke after a partial color reveal keeps greens/yellows.
// Simulate the row carrying one green + one yellow (as the caller builds keepSlots/keepColors):
const keepSlots = ['o', '', '', 'a', '']; // greens/yellows kept, grays blanked
const keepColors = ['green', null, null, 'yellow', null];
const typed = Daily.nextSlots({ slots: keepSlots, colors: keepColors, ch: 'C', len: 5 });
assert.strictEqual(typed.slots[0], 'o', 'a locked green survives the next keystroke');
assert.strictEqual(typed.slots[1], 'C', 'the new letter fills the first empty (non-green) slot');

g = guess('learn'); // second wrong guess (5 letters)
persisted.sworb.guessesUsed = g.res.newGuessesUsed; // 2
assert.strictEqual(persisted.sworb.guessesUsed, 2, 'two guesses spent');
console.log('round-lifecycle: STAGE 3 finale wrong-guess color flow passed');

// ===================================================================================
// STAGE 4 — SOLVE: the correct guess. Reward tiers scale by clues found (3 of 15 → "most").
// ===================================================================================
g = guess('OcEaN'); // case-insensitive
assert.strictEqual(g.res.correct, true, 'correct answer solves');
assert.strictEqual(g.res.newGuessesUsed, 3, 'the solve is the third guess');
assert.strictEqual(g.res.bonus, Daily.REWARD.most, 'reward tier: 3 clues found (of 15 pool) → "most" (200)');
assert.strictEqual(g.res.bonus, 200, 'reward is 200');
assert.strictEqual(Flow.finaleResolveRoute({ finale: true, correct: true, spent: false }), 'finale-solve',
  'a correct finale guess routes to finale-solve');

persisted.sworb.solved = true;
persisted.sworb.guessesUsed = g.res.newGuessesUsed; // 3
persisted.sworb.bonus = g.res.bonus;               // 200
console.log('round-lifecycle: STAGE 4 solve passed');

// ===================================================================================
// STAGE 5 — BANK: reconcileFinaleScore. The bonus rides the day total. Reconstructs the same
// banked total whether state.score survived (uninterrupted) or was reset to bonus-only (a
// mid-finale exit / reload re-entry).
// ===================================================================================
const storedBest = roundScore; // endRound banked the pre-finale score at 0:00
// uninterrupted: state.score = pre-finale total + the just-applied bonus
const uninterrupted = Status.reconcileFinaleScore({ stateScore: roundScore + persisted.sworb.bonus, storedBest: storedBest, bonus: persisted.sworb.bonus, runsLast: roundScore });
// re-entry: exiting mid-finale reset state.score to bonus-ONLY — must reconstruct the same banked total
const reentry = Status.reconcileFinaleScore({ stateScore: persisted.sworb.bonus, storedBest: storedBest, bonus: persisted.sworb.bonus, runsLast: roundScore });
assert.strictEqual(uninterrupted.banked, roundScore + 200, 'uninterrupted banks pre-finale total + bonus');
assert.strictEqual(reentry.banked, roundScore + 200, 're-entry reconstructs the SAME banked total');
assert.strictEqual(uninterrupted.runsLast, roundScore + 200, 'RUNS history ratchets up to the banked total');
const finalScore = uninterrupted.banked;
console.log('round-lifecycle: STAGE 5 bank (reconcileFinaleScore) passed');

// ===================================================================================
// STAGE 6 — HINT TOKENS + FINAL PERSISTED SHAPE.
// ===================================================================================
// tokens: no grant at 5 words spelled; a grant once >=7 words while clues remain; once only.
assert.deepStrictEqual(Daily.hintTokenEvents({ wordsSpelledThisRound: persisted.wordsSpelled, cluesFound: persisted.found.length, cluesTotal: CLUE_COUNT, tokensEarnedAlready: 0 }), { grant: false }, 'under 7 words → no token');
assert.deepStrictEqual(Daily.hintTokenEvents({ wordsSpelledThisRound: 7, cluesFound: 3, cluesTotal: CLUE_COUNT, tokensEarnedAlready: 0 }), { grant: true }, '>=7 words with clues remaining → grant a token');
persisted.tokensEarned = 1;
assert.deepStrictEqual(Daily.hintTokenEvents({ wordsSpelledThisRound: 12, cluesFound: 3, cluesTotal: CLUE_COUNT, tokensEarnedAlready: persisted.tokensEarned }), { grant: false }, 'one grant per round — never a repeat');

// final persisted-shape assertions (the values that survive to home's result surfaces)
const seven = Status.sevenFromWords(persisted.roundWords);
assert.strictEqual(seven.words.length, 4, 'seven holds the 4 distinct words spelled');
assert.strictEqual(finalScore, roundScore + 200, 'final banked score = round total + solve bonus');
assert.strictEqual(persisted.sworb.solved, true, 'sworb solved');
assert.strictEqual(persisted.sworb.guessesUsed, 3, 'solved on the 3rd guess');
assert.strictEqual(persisted.found.length, 3, '3 clues caught');
assert.strictEqual(persisted.tokensEarned, 1, 'one hint token earned this round');
// day is now fully consumed: DONE + solved → 'done' (dailyConsumed true, PLAY must not re-deal)
assert.strictEqual(Status.dayState({ done: true, solved: true, guessesUsed: 3 }), 'done',
  'solved finale → day fully consumed (dailyConsumed)');
// and startDaily on a consumed day routes to the zombie-guarded no-op, never a fresh deal
assert.strictEqual(Flow.startDailyRoute({ finale: false, onHome: true, consumed: true, dailyLive: false, over: false, hasTiles: false, finalePending: false }),
  'consumed', 'PLAY on the now-consumed day is a guarded no-op, never a fresh round');
console.log('round-lifecycle: STAGE 6 tokens + final persisted shape passed');

console.log('round-lifecycle: full day drove deal → spell → finale → solve → bank end-to-end; all passed');
