// TIME FUEL — "three minutes given, seven if you earn it" (owner-locked
// 2026-07-23). Pins the grant table, the clue bonus, and the hard cap: base +
// earned can NEVER exceed CAP_SECS. Living-engine addition (frozen web app
// predates it and keeps its fixed clock).
const assert = require('assert');
const Run = require('../sworbl-run.js');
const Daily = require('../sworbl-daily.js');

const F = Run.TIME_FUEL;
assert.strictEqual(F.BASE_SECS, 180, 'base is three minutes');
assert.strictEqual(F.CAP_SECS, 420, 'cap is the Seven');

// length scaling (fresh round: no earned time yet)
assert.strictEqual(Run.timeForWord({ len: 3, earnedMs: 0 }), 4000, '3-letter +4s');
assert.strictEqual(Run.timeForWord({ len: 4, earnedMs: 0 }), 6000, '4-letter +6s');
assert.strictEqual(Run.timeForWord({ len: 5, earnedMs: 0 }), 9000, '5-letter +9s');
assert.strictEqual(Run.timeForWord({ len: 6, earnedMs: 0 }), 12000, '6-letter +12s');
assert.strictEqual(Run.timeForWord({ len: 7, earnedMs: 0 }), 15000, '7-letter +15s');
assert.strictEqual(Run.timeForWord({ len: 9, earnedMs: 0 }), 15000, '9-letter caps at the 7+ grant');
assert.strictEqual(Run.timeForWord({ len: 2, earnedMs: 0 }), 0, 'too short earns nothing');

// clue catches pay the survival bonus on top
assert.strictEqual(Run.timeForWord({ len: 4, isClue: true, earnedMs: 0 }), 26000, 'clue 4-letter +6s+20s');

// THE CAP: room = cap - base - earned; grants clip to it
const room = (F.CAP_SECS - F.BASE_SECS) * 1000; // 240s of earnable time
assert.strictEqual(
  Run.timeForWord({ len: 7, isClue: true, earnedMs: room - 5000 }),
  5000,
  'partial clip: only the remaining room is granted'
);
assert.strictEqual(
  Run.timeForWord({ len: 7, isClue: true, earnedMs: room }),
  0,
  'full clip: at the cap, nothing more is granted'
);
assert.strictEqual(
  Run.timeForWord({ len: 5, earnedMs: room + 99999 }),
  0,
  'over-cap earned (corrupt input) still grants zero, never negative'
);

// knobs are honored
assert.strictEqual(
  Run.timeForWord({ len: 3, earnedMs: 0, baseSecs: 60, capSecs: 61 }),
  1000,
  'custom base/cap clip correctly'
);

// mercy threshold override (time-fuel rounds fire later than the classic 2:00)
assert.strictEqual(
  Daily.mercyPulseShouldFire({ alreadyFired: false, prevSecsLeft: 46, secsLeft: 45, cluesFound: 1, thresholdSecs: 45 }),
  true, 'mercy fires on the 0:45 crossing with thresholdSecs override'
);
assert.strictEqual(
  Daily.mercyPulseShouldFire({ alreadyFired: false, prevSecsLeft: 121, secsLeft: 120, cluesFound: 1, thresholdSecs: 45 }),
  false, 'the classic 2:00 crossing does NOT fire when the override is lower'
);
assert.strictEqual(
  Daily.mercyPulseShouldFire({ alreadyFired: false, prevSecsLeft: 121, secsLeft: 120, cluesFound: 1 }),
  true, 'no override → the classic 2:00 default still governs'
);

console.log('time-fuel: all tests passed');
