// Storm boards + clue-swap collision guard, headless. Pins: daily seed
// minting (determinism, server seed law, name dealing) and the swap
// guard that ended the duplicate-pill crash.
import assert from 'assert';
import { dailyStormBoards, stormIntensity, stormName } from '../src/game/storm-seeds';
import { applySwaps } from '../src/game/clue-swaps';

const DAY = new Date('2026-07-23T15:00:00');

// ---- daily storm boards ----
const boards = dailyStormBoards(DAY);
assert.strictEqual(boards.length, 4, 'four boards per day');

const again = dailyStormBoards(new Date('2026-07-23T23:59:00'));
assert.deepStrictEqual(boards, again, 'same day → identical boards (any hour)');

const tomorrow = dailyStormBoards(new Date('2026-07-24T00:01:00'));
// names ARE the tiers now (owner: "actually call the one hurricane") —
// constant identity, fresh BOARDS underneath every day
assert.deepStrictEqual(
  boards.map((b) => b.name),
  ['diphthong drizzle', 'synonym squall', 'thesaurus thunder', 'homonym hurricane'],
  'the boards are named by tier'
);
assert.notDeepStrictEqual(
  boards.map((b) => b.seed),
  tomorrow.map((b) => b.seed),
  'new day → new seeds (fresh boards under constant names)'
);

// every seed obeys the server's law: ^[a-z0-9-]{3,24}$
for (const b of boards.concat(tomorrow)) {
  assert.ok(/^[a-z0-9-]{3,24}$/.test(b.seed), `seed "${b.seed}" fits the server check`);
}


// stormName resolves today's boards and passes foreign seeds through
assert.strictEqual(stormName(boards[0].seed, DAY), 'diphthong drizzle', 'slot seeds wear the tier name');
assert.strictEqual(stormName('s-20990101-d'), 'homonym hurricane', 'any day, any slot — tier name holds');
assert.strictEqual(stormName('first-storm', DAY), 'first-storm', 'foreign seed passes through');

console.log('storms: daily mint pinned (determinism, seed law, names)');

// ---- clue-swap collision guard (the duplicate 'gusty' pill crash) ----
// a persisted swap whose replacement reappears as a NATURAL clue in a
// later round's deal must not duplicate — the swap is skipped
{
  const clues = ['windy', 'gusty', 'foggy'];
  const out = applySwaps(clues, { windy: 'gusty' });
  assert.deepStrictEqual(out, ['windy', 'gusty', 'foggy'], 'colliding swap skipped, original kept');
  assert.strictEqual(new Set(out).size, out.length, 'never a duplicate');
}
// a clean swap still applies
{
  const out = applySwaps(['windy', 'gusty'], { windy: 'hail' });
  assert.deepStrictEqual(out, ['hail', 'gusty'], 'non-colliding swap applies');
}
// two clues swapped to the SAME replacement: first wins, second keeps original
{
  const out = applySwaps(['windy', 'gusty'], { windy: 'hail', gusty: 'hail' });
  assert.deepStrictEqual(out, ['hail', 'gusty'], 'double-target collision: one swap wins');
  assert.strictEqual(new Set(out).size, out.length, 'unique floor holds');
}
console.log('storms: swap collision guard pinned');

// ---- THE INTENSITY LADDER (owner: a ladder, not an XP gate) ----
{
  const bs = dailyStormBoards(DAY);
  assert.deepStrictEqual(
    bs.map((b) => b.intensity.key),
    ['drizzle', 'squall', 'thunder', 'hurricane'],
    'slot a/b/c/d IS the tier'
  );
  assert.strictEqual(stormIntensity(bs[0].seed).clockSecs, 180, 'drizzle = 3:00');
  assert.strictEqual(stormIntensity(bs[1].seed).clockSecs, 120, 'squall = 2:00');
  assert.strictEqual(stormIntensity(bs[2].seed).clockSecs, 90, 'thunder = 1:30');
  assert.strictEqual(stormIntensity(bs[3].seed).clockSecs, 60, 'hurricane = 1:00');
  assert.strictEqual(stormIntensity(bs[2].seed).friendly, false, 'thunder: the harsh bag arrives');
  assert.strictEqual(stormIntensity(bs[3].seed).friendly, false, 'hurricane: no friendly on-ramp');
  assert.strictEqual(stormIntensity('first-storm').key, 'squall', 'foreign seeds play the standard contract');
}

// the hurricane's harsher bag still deals deterministically — and differs
// from what the friendly bag would have dealt
{
  const { dealPractice } = require('../src/game/daily') as typeof import('../src/game/daily');
  const dk = '20990101';
  const h1 = dealPractice(`s-${dk}-c`);
  const h2 = dealPractice(`s-${dk}-c`);
  assert.deepStrictEqual(
    h1.tiles.map((t) => `${t.row},${t.col}:${t.letter}`),
    h2.tiles.map((t) => `${t.row},${t.col}:${t.letter}`),
    'hurricane deal is deterministic'
  );
  const d1 = dealPractice(`s-${dk}-a`);
  assert.notDeepStrictEqual(
    h1.tiles.map((t) => t.letter),
    d1.tiles.map((t) => t.letter),
    'hurricane bag differs from the drizzle bag'
  );
}
console.log('storms: intensity ladder pinned (tiers, clocks, hurricane bag)');
