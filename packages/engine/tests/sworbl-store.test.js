// tests/sworbl-store.test.js — run with: node tests/sworbl-store.test.js
// Covers the key registry + the age-based GC for per-day-keyed entries. In Node the store
// falls back to its in-memory shim, so every assertion runs against a clean fake localStorage.
//
// (migrateLegacy — the one-time stackle_* -> sworble_* copy heal — and its MIGRATED_STACKLE
// flag were removed 2026-07-22, pre-release, owner-sanctioned: no real player data exists yet
// to migrate, so the debt was wiped rather than carried forever. worddrop_muted, the legacy
// name that heal used to spare, is gone too — MUTED is plain sworble_muted now.)
'use strict';
const assert = require('assert');
const S = require('../sworbl-store.js');
const LS = S.LS;

assert.strictEqual(S.K.MUTED, 'sworbl_muted', 'MUTED is a plain sworble_ key now (no legacy holdout)');
assert.strictEqual(S.K.HINT_TOKENS_PREFIX, 'sworbl_hint_tokens_', 'HINT AIDS token-bank prefix must be registered in K');

// --- age-GC: dayKeyAgeDays -----------------------------------------------------------
// now pinned to a fixed local calendar day so the test is deterministic regardless of
// when it runs (matches SworblCore.dayKey()'s local-day construction).
const NOW = new Date(2026, 8, 19); // 2026-09-19 local
assert.strictEqual(S.dayKeyAgeDays('2026-09-19', NOW), 0, 'today is age 0');
assert.strictEqual(S.dayKeyAgeDays('2026-07-22', NOW), 59, 'exactly 59 days old');
assert.strictEqual(S.dayKeyAgeDays('2026-07-21', NOW), 60, 'exactly 60 days old');
assert.strictEqual(S.dayKeyAgeDays('2026-07-20', NOW), 61, 'exactly 61 days old');
for (const bad of ['', 'not-a-date', '2026-13-01', '2026-02-30', '26-07-20', undefined, null]) {
  assert.strictEqual(S.dayKeyAgeDays(bad, NOW), null, 'malformed/impossible date -> null: ' + bad);
}

// --- age-GC: agedDayKeys ------------------------------------------------------------
assert.strictEqual(S.AGE_GC_MAX_DAYS, 60, 'default cutoff is 60 days');
{
  const keys = [
    S.K.DAILY_PREFIX + '2026-07-22', // 59d — kept
    S.K.SEVEN_PREFIX + '2026-07-21', // 60d — kept (boundary: not OLDER than 60)
    S.K.RUNS_PREFIX + '2026-07-20',  // 61d — pruned
    S.K.LB_ME_PREFIX + '2026-07-20|puzzle', // 61d, '|mode' suffix — pruned
    S.K.LB_ME_PREFIX + '2026-09-19', // today — kept
    S.K.DONE_PREFIX + 'not-a-date',  // malformed date on a dated prefix — untouched
    S.K.BEST,                        // not a dated prefix at all — untouched
    S.K.MUTED,                       // not a dated prefix at all — untouched
    'sworbl_daily_' + 'undefined',  // the OTHER malformed-key heal already owns this one; still untouched here
  ];
  const aged = S.agedDayKeys(keys, NOW);
  assert.deepStrictEqual(aged.sort(), [
    S.K.LB_ME_PREFIX + '2026-07-20|puzzle',
    S.K.RUNS_PREFIX + '2026-07-20',
  ].sort(), '61d entries (incl. the |mode suffix form) pruned; 59d/60d/malformed/non-dated all kept');

  // pure: only returns names, never itself removes anything from storage
  assert.strictEqual(keys.length, 9);
  LS.setItem(S.K.RUNS_PREFIX + '2026-07-20', 'still here');
  S.agedDayKeys(keys, NOW);
  assert.strictEqual(LS.getItem(S.K.RUNS_PREFIX + '2026-07-20'), 'still here', 'agedDayKeys never writes to storage — pure decision only, caller removes');
}

console.log('sworbl-store: all tests passed');
