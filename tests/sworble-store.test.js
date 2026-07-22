// tests/sworble-store.test.js — run with: node tests/sworble-store.test.js
// Covers the legacy-key migration (stackle_* -> sworble_*): copy semantics, no
// overwrites, idempotence via the one-time flag. In Node the store falls back to
// its in-memory shim, so every assertion runs against a clean fake localStorage.
'use strict';
const assert = require('assert');
const S = require('../sworble-store.js');
const LS = S.LS;

assert.strictEqual(typeof S.migrateLegacy, 'function', 'store must export migrateLegacy');
assert.strictEqual(S.K.MIGRATED_STACKLE, 'sworble_migrated_stackle', 'flag key must be registered in K');
assert.strictEqual(S.K.HINT_TOKENS_PREFIX, 'sworble_hint_tokens_', 'HINT AIDS token-bank prefix must be registered in K');

// --- first run: copies every stackle_* key whose sworble_* twin is absent ---------
LS.setItem('stackle_best', '4200');
LS.setItem('stackle_name', 'PHIL');
LS.setItem('stackle_daily_2026-07-01', '900');
LS.setItem('stackle_seen_howto', '1');
LS.setItem('sworble_name', 'NEWER'); // player already progressed under the new name — never clobber
LS.setItem('worddrop_muted', '1');   // the spared legacy key is not stackle_* — untouched

const moved = S.migrateLegacy();
assert.strictEqual(moved, 3, 'best + daily + seen_howto copied; name skipped (target exists)');
assert.strictEqual(LS.getItem('sworble_best'), '4200');
assert.strictEqual(LS.getItem('sworble_daily_2026-07-01'), '900');
assert.strictEqual(LS.getItem('sworble_seen_howto'), '1');
assert.strictEqual(LS.getItem('sworble_name'), 'NEWER', 'existing sworble data wins over legacy');
assert.strictEqual(LS.getItem('stackle_best'), '4200', 'originals stay in place (rollback-safe)');
assert.strictEqual(LS.getItem('worddrop_muted'), '1');
assert.strictEqual(LS.getItem(S.K.MIGRATED_STACKLE), '1', 'one-time flag set');

// --- second run: flag short-circuits — nothing new is copied ----------------------
LS.setItem('stackle_late_arrival', 'x');
assert.strictEqual(S.migrateLegacy(), 0, 'migration never runs twice');
assert.strictEqual(LS.getItem('sworble_late_arrival'), null);

console.log('sworble-store: all tests passed');
