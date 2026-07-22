// tests/dailies-check.js — content guardrail for the AI-generated daily regime. Every day must:
//   • parse (Daily.parseEntry)
//   • sworb: a real dictionary word, 5-7 letters (owner rule 2026-07-22 FINAL: big answers are
//     historical 7-letter sworb was retired for cross-day consistency, nothing depends on 7)
//   • theme words: real dictionary words, each 4-7 letters, AT MOST 2 sevens per day (owner
//     FINAL rule 2026-07-22: sevens are rare "stretcher" clues — engine-measured safe at ≤3)
//   • pool size 10-15 theme words (enough candidates for the two-pass to lock 6, not a firehose)
//   • NO prefix-pairs: no pool word may be a prefix of another pool word the same day. The
//     clue-extension feature (clueFor / starts-with banking) resolves a spelled word to its clue
//     by longest-prefix match; two clues where one prefixes the other (trim + trims) make that
//     resolution ambiguous, so the content regime forbids the collision outright.
//   • two-pass seed lands EXACTLY 6 theme words ("6 to find, 6 to crack it" — no fallback).
// Runs in npm test.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Core = require('../sworble-core.js');
const Seed = require('../sworble-seed.js');
const Daily = require('../sworble-daily.js');
const root = path.join(__dirname, '..');
const dailies = JSON.parse(fs.readFileSync(path.join(root, 'dailies.json'), 'utf8'));
const dict = new Set(fs.readFileSync(path.join(root, 'dictionary.txt'), 'utf8').split(/\r?\n/).map(w => w.trim()).filter(Boolean));

const CLUE_COUNT = 6;      // realized theme words per day ("6 to find")
const WORD_MIN = 4;        // theme-word minimum length (owner rule: no 3-letter words)
const WORD_MAX = 7;        // theme-word maximum length (owner FINAL rule 2026-07-22: 4-7, sevens are rare "stretchers")
const SEVEN_CAP = 2;       // at most 2 seven-letter theme words per day (soft rule made hard here)
const SWORB_MIN = 5;       // sworb 5-7 (owner: 4s too slight for the daily climax; 7s encouraged — e.g. KITCHEN)
const SWORB_MAX = 7;
const POOL_MIN = 10;       // candidate pool floor
const POOL_MAX = 15;       // candidate pool ceiling

// Return the first prefix-pair [shorter, longer] found in `words` (word A a strict prefix of a
// longer word B), or null if none. O(n^2) over a <=15-word pool — trivial, and clarity wins.
function findPrefixPair(words) {
  for (let i = 0; i < words.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (i === j) continue;
      const a = words[i], b = words[j];
      if (b.length > a.length && b.indexOf(a) === 0) return [a, b];
    }
  }
  return null;
}

let days = 0;
for (const day of Object.keys(dailies)) {
  const e = Daily.parseEntry(dailies, day);
  assert.ok(e, day + ': parses');

  // sworb: real word, 5-7 letters
  assert.ok(dict.has(e.sworb), day + ': sworb "' + e.sworb + '" is in dictionary.txt');
  assert.ok(e.sworb.length >= SWORB_MIN && e.sworb.length <= SWORB_MAX,
    day + ': sworb "' + e.sworb + '" is ' + SWORB_MIN + '-' + SWORB_MAX + ' letters (got ' + e.sworb.length + ')');

  // pool size 10-15
  assert.ok(e.themeWords.length >= POOL_MIN && e.themeWords.length <= POOL_MAX,
    day + ': pool has ' + POOL_MIN + '-' + POOL_MAX + ' theme words (got ' + e.themeWords.length + ')');

  // theme words: real dictionary words, each 4-7 letters
  for (const w of e.themeWords) {
    assert.ok(dict.has(w), day + ': theme word "' + w + '" is in dictionary.txt');
    assert.ok(w.length >= WORD_MIN && w.length <= WORD_MAX,
      day + ': theme word "' + w + '" is ' + WORD_MIN + '-' + WORD_MAX + ' letters (got ' + w.length + ')');
  }

  // at most SEVEN_CAP seven-letter theme words (stretchers stay rare + board stays packable)
  const sevens = e.themeWords.filter(w => w.length === 7);
  assert.ok(sevens.length <= SEVEN_CAP,
    day + ': ' + sevens.length + ' seven-letter theme words (' + sevens.join(', ') + ') — max ' + SEVEN_CAP);

  // NO prefix-pairs (clueFor longest-match ambiguity guard)
  const pair = findPrefixPair(e.themeWords);
  assert.ok(!pair, pair && day + ': prefix-pair "' + pair[0] + '" is a prefix of "' + pair[1] +
    '" — clue-extension banking is ambiguous; replace one so no pool word prefixes another');

  // simulate the SAME two-pass seed the app runs (see index.html's theme seed block): pass 1
  // best-effort packs the full candidate pool; the first 6 realized (insertion order) become
  // the target set; pass 2 re-packs a FRESH board with ONLY those 6, on a fresh rng from the
  // same seed. Content days must land cleanly on exactly 6 — a day that needs the fallback
  // (pass 2 dropping below 6) is thin/misconfigured content and must fail this check.
  const rngFactory = () => Core.mulberry32(Core.hashSeed(day + '|sworb'));
  const out = Seed.seedClueLettersTwoPass({ clues: e.themeWords, cols: 5, rows: 6, rngFactory, target: CLUE_COUNT });
  assert.ok(!out.usedFallback, day + ': two-pass seed lands cleanly on ' + CLUE_COUNT + ' clues (no fallback bonus words)');
  assert.strictEqual(out.realized.length, CLUE_COUNT, day + ': realized theme set is exactly ' + CLUE_COUNT + ' (got ' + out.realized.length + ')');
  days++;
}
console.log('dailies-check: ' + days + ' days valid (sworb 5-7, hints 4-7 (≤2 sevens), pool 10-15, no prefix-pairs, each locking exactly ' + CLUE_COUNT + ' clues)');
