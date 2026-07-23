'use strict';
const assert = require('assert');
const D = require('../sworbl-daily.js');
const dailies = { '2026-07-21': { sworb: 'ocean', clues: ['tide', 'coral', 'wave', 'reef', 'salt'] } };

const e = D.parseEntry(dailies, '2026-07-21');
assert.deepStrictEqual(e, { sworb: 'ocean', themeWords: ['tide', 'coral', 'wave', 'reef', 'salt'] });
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

// --- scoreGuess: Wordle per-letter feedback (green/yellow/gray) ---------------------
assert.deepStrictEqual(D.scoreGuess('ocean', 'ocean'), ['green','green','green','green','green'], 'exact = all green');
assert.deepStrictEqual(D.scoreGuess('canoe', 'ocean'), ['yellow','yellow','yellow','yellow','yellow'], 'all present, all misplaced = yellow');
assert.deepStrictEqual(D.scoreGuess('xxxxx', 'ocean'), ['gray','gray','gray','gray','gray'], 'none present = gray');
assert.deepStrictEqual(D.scoreGuess('ocxxx', 'ocean'), ['green','green','gray','gray','gray'], 'prefix right = green, rest gray');
// duplicate-letter handling — answer 'reef' has E at positions 1 and 2:
assert.deepStrictEqual(D.scoreGuess('eeee', 'reef'), ['gray','green','green','gray'], 'both middle Es green; the two extra guess-Es have no answer-E left = gray');
assert.deepStrictEqual(D.scoreGuess('erxx', 'reef'), ['yellow','yellow','gray','gray'], 'E and R both present but misplaced = yellow; X absent = gray');

// --- NEW: theme-word pool (relax 5-clue cap) + back-compat clues ---
{
  // NEW shape: a pool of theme words, no 5-cap
  const pool = { '2026-08-01': { sworb: 'ocean', themeWords: ['tide','coral','wave','reef','salt','shore','kelp','surf','foam','brine','pearl','shell'] } };
  const e = D.parseEntry(pool, '2026-08-01');
  assert.strictEqual(e.sworb, 'ocean');
  assert.strictEqual(e.themeWords.length, 12, 'pool larger than 5 is accepted (cap relaxed)');
  assert.strictEqual(e.themeWords[0], 'tide');
  // BACK-COMPAT: legacy `clues` still parses, surfaced as themeWords
  const legacy = { '2026-08-02': { sworb: 'kitchen', clues: ['oven','fork','pan','dish','spoon'] } };
  const l = D.parseEntry(legacy, '2026-08-02');
  assert.deepStrictEqual(l, { sworb: 'kitchen', themeWords: ['oven','fork','pan','dish','spoon'] });
  // normalization + validation
  assert.deepStrictEqual(D.parseEntry({ x: { sworb: ' Ocean ', themeWords: [' Tide ', 'CORAL'] } }, 'x'), { sworb: 'ocean', themeWords: ['tide','coral'] });
  assert.strictEqual(D.parseEntry({ x: { sworb: 'ocean', themeWords: [] } }, 'x'), null, 'empty pool -> null');
  assert.strictEqual(D.parseEntry({ x: { sworb: 'ocean', themeWords: 'nope' } }, 'x'), null, 'non-array -> null');
  assert.strictEqual(D.parseEntry({ x: { sworb: '', themeWords: ['a'] } }, 'x'), null, 'empty sworb -> null');
  assert.strictEqual(D.parseEntry({ x: { sworb: 'ocean', themeWords: ['tide', 7] } }, 'x'), null, 'non-string entry -> null');
}

// --- NEW: clueFor(word, entry) -> clue|null — a spelled word banks a clue if it STARTS
// WITH the clue (trims/trimmed/trimming -> "trim"; seedy -> "seed"); isClue becomes a thin
// wrapper (!!clueFor(...)); longest matching clue wins when more than one prefixes the word ---
{
  const kitchen = { sworb: 'kitchen', themeWords: ['trim', 'seed', 'seeds', 'oven'] };

  // exact hit
  assert.strictEqual(D.clueFor('trim', kitchen), 'trim', 'exact match returns the clue');
  assert.strictEqual(D.clueFor('TRIM', kitchen), 'trim', 'case-insensitive');

  // extension hits (trims/trimmed/trimming all bank "trim")
  assert.strictEqual(D.clueFor('trims', kitchen), 'trim', 'trims -> trim');
  assert.strictEqual(D.clueFor('trimmed', kitchen), 'trim', 'trimmed -> trim');
  assert.strictEqual(D.clueFor('trimming', kitchen), 'trim', 'trimming -> trim');

  // non-prefix miss: "roster" does NOT start with "rose" (rost vs rose)
  const beach = { sworb: 'beach', themeWords: ['rose'] };
  assert.strictEqual(D.clueFor('roster', beach), null, 'roster does not start with rose -> miss');

  // longest match wins: both "seed" and "seeds" are clues; spelling "seeds" should bank
  // "seeds" (the longer/more specific match), not "seed"
  assert.strictEqual(D.clueFor('seeds', kitchen), 'seeds', 'longest matching clue wins (seeds over seed)');
  assert.strictEqual(D.clueFor('seedy', kitchen), 'seed', 'seedy -> seed (only "seed" prefixes it)');
  assert.strictEqual(D.clueFor('seed', kitchen), 'seed', 'exact "seed" still matches "seed"');

  // null entry / word safety
  assert.strictEqual(D.clueFor('trim', null), null, 'null entry -> null');
  assert.strictEqual(D.clueFor('', kitchen), null, 'empty word -> null');
  assert.strictEqual(D.clueFor(null, kitchen), null, 'null word -> null');

  // isClue is now a thin wrapper around clueFor (back-compat)
  assert.strictEqual(D.isClue('trims', kitchen), true, 'isClue: extension counts as a clue');
  assert.strictEqual(D.isClue('roster', beach), false, 'isClue: non-prefix still a miss');
  assert.strictEqual(D.isClue('TIDE', e), true, 'isClue: still works against the original fixture');
  assert.strictEqual(D.isClue('shore', e), false);
}

// --- bankClue(found, clue) -> found' — the FOUND_PREFIX banking dedup used by
// checkTargetCatch: append a NEWLY-caught clue exactly once, and treat a clue EXTENSION
// (trims/trimmed/trimming all resolve to the same clueFor() match) as the same bank, not a
// second entry. The split-brain glow/bank class of bug has bitten twice — pinning it. ---
{
  const empty = [];
  const first = D.bankClue(empty, 'trim');
  assert.deepStrictEqual(first, ['trim'], 'a fresh clue gets appended');
  assert.notStrictEqual(first, empty, 'never mutates the input array (immutable: returns a new array)');
  assert.deepStrictEqual(empty, [], 'the original found list is untouched');

  const withTrim = ['trim'];
  const dup = D.bankClue(withTrim, 'trim');
  assert.strictEqual(dup, withTrim, 'exact repeat -> same reference back, nothing banked (dedup)');

  // extension-banks-clue: "trims"/"trimmed" all resolve to clueFor's match ("trim") BEFORE
  // reaching bankClue — so a repeat extension is just another bankClue(list, 'trim') call,
  // which must dedupe identically to a repeat exact spell.
  const afterExtension = D.bankClue(withTrim, 'trim'); // caller already resolved "trims" -> "trim" via clueFor
  assert.strictEqual(afterExtension, withTrim, 'extension of an already-banked clue is still a no-op');

  const multi = D.bankClue(['trim', 'seed'], 'oven');
  assert.deepStrictEqual(multi, ['trim', 'seed', 'oven'], 'appends after existing entries, order preserved');

  assert.deepStrictEqual(D.bankClue(null, 'trim'), ['trim'], 'null found list is treated as empty, never throws');
  assert.deepStrictEqual(D.bankClue(['trim'], null), ['trim'], 'falsy clue -> no-op, list unchanged');
  assert.deepStrictEqual(D.bankClue(['trim'], ''), ['trim'], 'empty-string clue -> no-op');
}
console.log('sworbl-daily: bankClue passed');

// --- applySworbGuess(args) -> {ok, correct, newGuessesUsed, nowSolved, lockedOut, bonus} --
// The finale guess decision, extracted pure from guessSworb: 6-guess cap, no-op once
// solved/exhausted, reward tiers scaled by clues found, case-insensitive match (via
// checkGuess's own normalize()). index.html keeps persistence/setState, this decides. ---
{
  const entry = { sworb: 'ocean', themeWords: ['tide', 'coral', 'wave', 'reef', 'salt'] };

  // correct guess, cold read (0 clues found) -> jackpot reward, solved, one guess spent
  {
    const r = D.applySworbGuess({ input: 'ocean', entry, guessesUsed: 0, solved: false, foundCount: 0, total: 5 });
    assert.deepStrictEqual(r, { ok: true, correct: true, newGuessesUsed: 1, nowSolved: true, lockedOut: false, bonus: 500 });
  }
  // case-insensitivity (checkGuess's normalize()) — matches regardless of case/whitespace
  {
    const r = D.applySworbGuess({ input: '  OCEAN! ', entry, guessesUsed: 0, solved: false, foundCount: 0, total: 5 });
    assert.strictEqual(r.correct, true, 'case/whitespace-insensitive match');
  }
  // wrong guess -> not solved, no bonus, guess count advances by one, not locked (guesses remain)
  {
    const r = D.applySworbGuess({ input: 'sea', entry, guessesUsed: 2, solved: false, foundCount: 2, total: 5 });
    assert.deepStrictEqual(r, { ok: true, correct: false, newGuessesUsed: 3, nowSolved: false, lockedOut: false, bonus: 0 });
  }
  // bonus tiers scale INVERSELY with clues found at guess time
  assert.strictEqual(D.applySworbGuess({ input: 'ocean', entry, guessesUsed: 0, solved: false, foundCount: 0, total: 5 }).bonus, 500, 'none found -> jackpot');
  assert.strictEqual(D.applySworbGuess({ input: 'ocean', entry, guessesUsed: 0, solved: false, foundCount: 2, total: 5 }).bonus, 350, 'few found -> mid tier');
  assert.strictEqual(D.applySworbGuess({ input: 'ocean', entry, guessesUsed: 0, solved: false, foundCount: 4, total: 5 }).bonus, 200, 'most found -> low tier');
  assert.strictEqual(D.applySworbGuess({ input: 'ocean', entry, guessesUsed: 0, solved: false, foundCount: 5, total: 5 }).bonus, 75, 'all found -> gimme');

  // the 6TH wrong guess exhausts the budget -> lockedOut true (finale's "6th miss" exit)
  {
    const r = D.applySworbGuess({ input: 'sea', entry, guessesUsed: 5, solved: false, foundCount: 0, total: 5 });
    assert.deepStrictEqual(r, { ok: true, correct: false, newGuessesUsed: 6, nowSolved: false, lockedOut: true, bonus: 0 });
  }
  // cap at 6: newGuessesUsed never exceeds 6 even from a defensively-overrun input
  {
    const r = D.applySworbGuess({ input: 'sea', entry, guessesUsed: 9, solved: false, foundCount: 0, total: 5 });
    assert.strictEqual(r.ok, false, 'already at/over budget -> no-op, not a real guess');
    assert.strictEqual(r.lockedOut, true);
  }
  // no-op once already solved — a stray resubmit never re-scores or re-banks
  {
    const r = D.applySworbGuess({ input: 'ocean', entry, guessesUsed: 1, solved: true, foundCount: 0, total: 5 });
    assert.strictEqual(r.ok, false, 'already solved -> no-op');
    assert.strictEqual(r.lockedOut, true);
  }
  // no-op once the 6-guess budget is already exhausted (locked before this call)
  {
    const r = D.applySworbGuess({ input: 'ocean', entry, guessesUsed: 6, solved: false, foundCount: 0, total: 5 });
    assert.strictEqual(r.ok, false, 'guessesUsed >= 6 already -> no-op, no fresh guess processed');
  }
  // no entry (no sworb today) -> safe no-op, never throws
  {
    const r = D.applySworbGuess({ input: 'ocean', entry: null, guessesUsed: 0, solved: false, foundCount: 0, total: 5 });
    assert.strictEqual(r.ok, false);
  }
  // malformed/missing args never throw
  assert.strictEqual(D.applySworbGuess({}).ok, false);
  assert.strictEqual(D.applySworbGuess(null).ok, false);
}
console.log('sworbl-daily: applySworbGuess passed');

// --- nextSlots(args) -> {slots, colors}|null — sworbKey/sworbBackspace's shared slot-fill
// state machine, extracted pure. Wordle-persistence means slots can have interior gaps
// after a miss (green/yellow letters stay put) — typing always fills first-empty; a
// keystroke also clears soft YELLOW hints (locked GREENS never move); backspace clears the
// LAST non-green filled slot. Both actions return null to mean "no state change" (the
// original updaters returned `{}` — same intent, explicit here). ---
{
  const BK = D.BACKSPACE;
  assert.strictEqual(typeof D.nextSlots, 'function', 'nextSlots exported');
  assert.ok(BK !== undefined && BK !== null, 'BACKSPACE sentinel exported');

  // first-empty fill, plain case: empty slots, len 5, type 'O' -> lands at index 0
  {
    const r = D.nextSlots({ slots: [], colors: null, ch: 'O', len: 5 });
    assert.deepStrictEqual(r.slots, ['O', '', '', '', '']);
    assert.strictEqual(r.colors, null, 'no colors yet -> null (nothing truthy to report)');
  }
  // first-empty fill WITH interior gaps: green at index 1, rest empty -> next letter
  // skips the locked green and lands at the first genuinely empty slot (index 0)
  {
    const r = D.nextSlots({ slots: ['', 'C', '', '', ''], colors: [null, 'green', null, null, null], ch: 'X', len: 5 });
    assert.strictEqual(r.slots[0], 'X', 'fills the first empty slot, not appended after the green');
    assert.strictEqual(r.slots[1], 'C', 'green slot untouched');
  }
  // greens locked against typing: a full board except one green interior slot never gets overwritten by more typing
  {
    const r = D.nextSlots({ slots: ['A', 'C', 'E', 'A', ''], colors: [null, 'green', null, null, null], ch: 'N', len: 5 });
    assert.strictEqual(r.slots[4], 'N', 'only the true empty slot is filled');
    assert.strictEqual(r.slots[1], 'C', 'green stays put, never overwritten');
  }
  // yellow-hint clears on the NEXT keystroke: any yellow present wipes all non-green
  // slots/colors before the new letter is placed
  {
    const slots = ['A', 'C', 'E', 'A', 'N']; // a prior guess result
    const colors = ['gray', 'green', 'yellow', 'gray', 'gray'];
    const r = D.nextSlots({ slots, colors, ch: 'Z', len: 5 });
    assert.strictEqual(r.slots[1], 'C', 'the green survives the yellow-clear');
    assert.strictEqual(r.colors[1], 'green', 'green color survives too');
    assert.strictEqual(r.slots[0], 'Z', 'first non-green slot (index 0) takes the fresh keystroke');
    assert.strictEqual(r.colors[0], null, 'freshly-typed slot has no color yet');
    assert.strictEqual(r.slots[2], '', 'yellow slot itself got cleared, not refilled by this same keystroke');
    assert.strictEqual(r.colors[2], null, 'yellow color wiped');
  }
  // full-row no-op: no empty slot left to fill -> null (state unchanged)
  {
    const r = D.nextSlots({ slots: ['A', 'B', 'C', 'D', 'E'], colors: null, ch: 'Z', len: 5 });
    assert.strictEqual(r, null, 'full row -> no-op');
  }
  // BACKSPACE targets the LAST non-locked (non-green) filled slot, scanning from the end
  {
    const slots = ['A', 'C', 'E', 'A', 'N'];
    const colors = [null, 'green', null, null, null];
    const r = D.nextSlots({ slots, colors, ch: BK });
    assert.strictEqual(r.slots[4], '', 'last filled slot cleared');
    assert.strictEqual(r.slots[1], 'C', 'green never eaten by backspace');
  }
  // BACKSPACE skips a trailing green and clears the next-last non-green slot instead
  {
    const slots = ['A', 'C', 'E', 'A', 'N'];
    const colors = [null, null, null, null, 'green']; // trailing slot is locked green
    const r = D.nextSlots({ slots, colors, ch: BK });
    assert.strictEqual(r.slots[4], 'N', 'locked trailing green survives backspace');
    assert.strictEqual(r.slots[3], '', 'backspace clears the last NON-green slot instead');
  }
  // BACKSPACE full-row no-op: nothing but greens/empties to clear -> null
  {
    const r1 = D.nextSlots({ slots: ['', '', '', '', ''], colors: null, ch: BK });
    assert.strictEqual(r1, null, 'nothing to backspace on an empty row');
    const r2 = D.nextSlots({ slots: ['A', 'B'], colors: ['green', 'green'], ch: BK });
    assert.strictEqual(r2, null, 'an all-green row has nothing left to backspace');
  }
  // malformed/missing args never throw
  assert.strictEqual(D.nextSlots({}), null, 'empty args, letter-fill path with len 0 -> no-op, never throws');
  assert.strictEqual(D.nextSlots(null), null, 'null args never throws');
}
console.log('sworbl-daily: nextSlots passed');

// --- resolveCatch(args) -> {clue, banked, isNew} — checkTargetCatch's catch decision,
// extracted pure. On a sworb day (entry present), banking targets the matched CLUE itself
// (clueFor) — a longer spelled word that only EXTENDS a clue still banks the clue, once.
// Without an entry (no sworb today), falls back to exact-match against the top-5 collectible
// targets list. banked comes straight from bankClue's dedupe-safe append (reference-equality
// preserved: same array back == nothing new banked). ---
{
  assert.strictEqual(typeof D.resolveCatch, 'function', 'resolveCatch exported');
  const kitchen = { sworb: 'kitchen', themeWords: ['trim', 'seed', 'oven'] };

  // extension banks the clue: "trims" isn't a clue verbatim, but it extends "trim"
  {
    const r = D.resolveCatch({ word: 'trims', entry: kitchen, targets: ['trim', 'seed', 'oven'], found: [] });
    assert.strictEqual(r.clue, 'trim', 'extension resolves to the base clue');
    assert.deepStrictEqual(r.banked, ['trim']);
    assert.strictEqual(r.isNew, true);
  }
  // dedup no-op, reference-equality preserved: "trim" already found -> re-spelling (or
  // extending) it again must return the SAME array reference, not an equal-but-new one
  {
    const found = ['trim'];
    const r = D.resolveCatch({ word: 'trimmed', entry: kitchen, targets: ['trim', 'seed', 'oven'], found });
    assert.strictEqual(r.clue, 'trim');
    assert.strictEqual(r.banked, found, 'same reference back — nothing new banked');
    assert.strictEqual(r.isNew, false);
  }
  // entry-null safety: no sworb today -> falls back to EXACT match against targets
  {
    const r1 = D.resolveCatch({ word: 'trim', entry: null, targets: ['trim', 'seed'], found: [] });
    assert.strictEqual(r1.clue, 'trim', 'exact target match with no entry');
    assert.strictEqual(r1.isNew, true);
    const r2 = D.resolveCatch({ word: 'trims', entry: null, targets: ['trim', 'seed'], found: [] });
    assert.strictEqual(r2.clue, null, 'no entry -> no prefix/extension matching, exact only');
    assert.strictEqual(r2.isNew, false);
    assert.deepStrictEqual(r2.banked, [], 'no-op returns found unchanged');
  }
  // targets-vs-entry fallback ORDER: when an entry exists, it always wins — clueFor decides
  // even if the exact spelled word also happens to sit in the targets list verbatim
  {
    const r = D.resolveCatch({ word: 'oven', entry: kitchen, targets: ['nomatch'], found: [] });
    assert.strictEqual(r.clue, 'oven', 'entry-driven clueFor match ignores the (irrelevant) targets list entirely');
  }
  // no match at all (entry present, word matches no clue) -> null, no-op
  {
    const r = D.resolveCatch({ word: 'zzz', entry: kitchen, targets: ['trim'], found: ['seed'] });
    assert.strictEqual(r.clue, null);
    assert.strictEqual(r.isNew, false);
    assert.deepStrictEqual(r.banked, ['seed']);
  }
  // word-null/empty safety — never throws, always a clean no-op
  {
    const found = ['trim'];
    assert.deepStrictEqual(D.resolveCatch({ word: '', entry: kitchen, targets: [], found }), { clue: null, banked: found, isNew: false });
    assert.deepStrictEqual(D.resolveCatch({ word: null, entry: kitchen, targets: [], found }), { clue: null, banked: found, isNew: false });
  }
  // malformed/missing args never throw
  assert.strictEqual(D.resolveCatch({}).clue, null);
  assert.strictEqual(D.resolveCatch(null).clue, null);
}
console.log('sworbl-daily: resolveCatch passed');

// --- hintTokenEvents(args) -> {grant} — the HINT AIDS token seam: grant ONE token once the
// player has spelled >=7 words this round WHILE clues remain unfound, and only once per
// round (tokensEarnedAlready guards the repeat). Pure decision only — the caller owns
// persistence + the on-brand grant fx. ---
{
  assert.strictEqual(typeof D.hintTokenEvents, 'function', 'hintTokenEvents exported');

  // under the word threshold -> no grant, even with clues outstanding
  assert.strictEqual(D.hintTokenEvents({ wordsSpelledThisRound: 6, cluesFound: 0, cluesTotal: 5, tokensEarnedAlready: 0 }).grant, false, 'fewer than 7 words -> no grant');

  // at/over threshold, clues still outstanding, nothing granted yet -> grant
  assert.strictEqual(D.hintTokenEvents({ wordsSpelledThisRound: 7, cluesFound: 2, cluesTotal: 5, tokensEarnedAlready: 0 }).grant, true, '7 words, clues remain -> grant');
  assert.strictEqual(D.hintTokenEvents({ wordsSpelledThisRound: 12, cluesFound: 4, cluesTotal: 5, tokensEarnedAlready: 0 }).grant, true, 'well over threshold still grants once');

  // all clues already found -> nothing to hint at, no grant
  assert.strictEqual(D.hintTokenEvents({ wordsSpelledThisRound: 9, cluesFound: 5, cluesTotal: 5, tokensEarnedAlready: 0 }).grant, false, 'clues fully found -> no grant');

  // already granted this round -> no repeat grant (one per round for now)
  assert.strictEqual(D.hintTokenEvents({ wordsSpelledThisRound: 9, cluesFound: 1, cluesTotal: 5, tokensEarnedAlready: 1 }).grant, false, 'already granted this round -> no repeat');

  // malformed/missing args never throw, and never grant
  assert.strictEqual(D.hintTokenEvents({}).grant, false, 'empty args -> no grant, never throws');
  assert.strictEqual(D.hintTokenEvents(null).grant, false, 'null args -> no grant, never throws');
  assert.strictEqual(D.hintTokenEvents({ wordsSpelledThisRound: 7, cluesFound: 0, cluesTotal: 0, tokensEarnedAlready: 0 }).grant, false, 'no clues at all today -> nothing to hint at, no grant');
}
console.log('sworbl-daily: hintTokenEvents passed');

// --- firstUnfoundClue(themeWords, found) -> word|null — MERCY PULSE's deterministic pick:
// the first still-unfound clue in REALIZED (themeWords) order, lowercased. ---
{
  assert.strictEqual(typeof D.firstUnfoundClue, 'function', 'firstUnfoundClue exported');
  const themeWords = ['tide', 'coral', 'wave', 'reef', 'salt'];

  assert.strictEqual(D.firstUnfoundClue(themeWords, []), 'tide', 'nothing found yet -> first in realized order');
  assert.strictEqual(D.firstUnfoundClue(themeWords, ['tide']), 'coral', 'skips already-found clues, in order');
  assert.strictEqual(D.firstUnfoundClue(themeWords, ['tide', 'coral', 'wave']), 'reef', 'keeps skipping through the middle');
  assert.strictEqual(D.firstUnfoundClue(themeWords, themeWords), null, 'everything found -> null, nothing to pulse');
  assert.strictEqual(D.firstUnfoundClue(themeWords, ['CORAL']), 'tide', 'found-list case is normalized before comparing');

  // malformed/missing args never throw
  assert.strictEqual(D.firstUnfoundClue(null, []), null, 'null themeWords -> null, never throws');
  assert.strictEqual(D.firstUnfoundClue(themeWords, null), 'tide', 'null found -> treated as empty');
  assert.strictEqual(D.firstUnfoundClue([], []), null, 'empty themeWords -> null');
}
console.log('sworbl-daily: firstUnfoundClue passed');

// --- mercyPulseShouldFire(args) -> boolean — the automatic, token-free mercy pulse: fires
// exactly on the tick the round clock CROSSES the 2:00-remaining threshold (matches the
// existing low-time-warning edge-detection idiom: prevSecsLeft > threshold && secsLeft <=
// threshold), only when the player has found <=2 clues, and never twice in a round
// (alreadyFired guards the repeat — the caller owns that guard as an in-memory flag so a
// reload naturally re-arms it; see the HINT AIDS integrity rules). ---
{
  assert.strictEqual(typeof D.mercyPulseShouldFire, 'function', 'mercyPulseShouldFire exported');

  // the exact crossing tick (121 -> 120) with <=2 clues found -> fire
  assert.strictEqual(D.mercyPulseShouldFire({ prevSecsLeft: 121, secsLeft: 120, cluesFound: 2, alreadyFired: false }), true, 'crossing 2:00 with <=2 clues -> fire');
  assert.strictEqual(D.mercyPulseShouldFire({ prevSecsLeft: 121, secsLeft: 120, cluesFound: 0, alreadyFired: false }), true, 'zero clues found also qualifies');

  // not actually crossing the threshold this tick -> no fire
  assert.strictEqual(D.mercyPulseShouldFire({ prevSecsLeft: 130, secsLeft: 125, cluesFound: 1, alreadyFired: false }), false, 'still above 2:00 -> no fire');
  assert.strictEqual(D.mercyPulseShouldFire({ prevSecsLeft: 90, secsLeft: 89, cluesFound: 1, alreadyFired: false }), false, 'already past 2:00 (not the crossing tick) -> no fire');

  // too many clues already found -> the mercy isn't needed
  assert.strictEqual(D.mercyPulseShouldFire({ prevSecsLeft: 121, secsLeft: 120, cluesFound: 3, alreadyFired: false }), false, 'more than 2 clues found -> no fire');

  // already fired this round -> never again
  assert.strictEqual(D.mercyPulseShouldFire({ prevSecsLeft: 121, secsLeft: 120, cluesFound: 0, alreadyFired: true }), false, 'already fired this round -> no repeat');

  // malformed/missing args never throw, and never fire
  assert.strictEqual(D.mercyPulseShouldFire({}), false, 'empty args -> no fire, never throws');
  assert.strictEqual(D.mercyPulseShouldFire(null), false, 'null args -> no fire, never throws');
}
console.log('sworbl-daily: mercyPulseShouldFire passed');

console.log('sworbl-daily: all passed');
