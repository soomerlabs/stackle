// setBacking: the LS facade must stay reference-stable while the backing swaps —
// the seam MMKV (native) and localStorage (web) plug into. Living-engine addition;
// the frozen web app's root copy predates and never calls this.
const assert = require('assert');
const Store = require('../sworbl-store.js');

// hold the facade reference BEFORE swapping — the whole point is it keeps working
const LS = Store.LS;

function memBacking() {
  const m = {};
  return {
    store: m,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

const a = memBacking();
Store.setBacking(a);

// writes land in the new backing through the OLD facade reference
LS.setItem('sworbl_test_x', '42');
assert.strictEqual(a.store.sworbl_test_x, '42', 'facade writes reach the swapped backing');
assert.strictEqual(LS.getItem('sworbl_test_x'), '42', 'facade reads from the swapped backing');
assert.strictEqual(Store.getInt('sworbl_test_x', 0), 42, 'typed helpers ride the facade');

// setJSON/getJSON round-trip
Store.setJSON('sworbl_test_j', { a: 1, b: ['x'] });
assert.deepStrictEqual(Store.getJSON('sworbl_test_j', null), { a: 1, b: ['x'] }, 'JSON round-trip');

// keys() iterates the swapped backing (length + key(i))
LS.setItem('sworbl_daily_2026-07-22', '9');
const found = [];
for (let i = 0; i < LS.length; i++) found.push(LS.key(i));
assert.ok(found.includes('sworbl_daily_2026-07-22'), 'key(i)/length iterate the backing');

// a second swap redirects again; the first backing stops receiving writes
const b = memBacking();
Store.setBacking(b);
LS.setItem('sworbl_test_y', '7');
assert.strictEqual(b.store.sworbl_test_y, '7', 'second swap receives writes');
assert.ok(!('sworbl_test_y' in a.store), 'first backing no longer written');

// malformed backings are rejected loudly
assert.throws(() => Store.setBacking(null), /setBacking/, 'null rejected');
assert.throws(() => Store.setBacking({ getItem: () => null }), /setBacking/, 'partial rejected');

console.log('store-backing: all tests passed');
