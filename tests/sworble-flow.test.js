'use strict';
// sworble-flow.test.js — pins the round-lifecycle DECISION layer (sworble-flow.js). Every
// branch of the startDaily chain (incl. the zombie + finale-pending + resume + fresh cases),
// endRound outcome routing per day-state, the finale-resolve exit table, and pause/resume/
// count-in legality per state. These are the transitions the T3 "zombie run" and "finale
// re-entry" Criticals lived in — the ordering is sacred, so it's enforced here, not just in
// comments.
const assert = require('assert');
const F = require('../sworble-flow.js');

// --- liveHunt ------------------------------------------------------------------------
assert.strictEqual(F.liveHunt({ screen: 'game', over: false, finale: false }), true, 'game + not over + not finale = live hunt');
assert.strictEqual(F.liveHunt({ screen: 'home', over: false, finale: false }), false, 'home is never a live hunt');
assert.strictEqual(F.liveHunt({ screen: 'game', over: true, finale: false }), false, 'over is not a live hunt');
assert.strictEqual(F.liveHunt({ screen: 'game', over: false, finale: true }), false, 'finale is not a live hunt');
assert.strictEqual(F.liveHunt(null), false, 'null ctx never throws');
console.log('sworble-flow: liveHunt passed');

// --- startDailyRoute: THE zombie-fixed branch chain, in order ------------------------
{
  // 1. home-finale-guard wins over EVERYTHING, even a consumed day, and fires first
  assert.strictEqual(
    F.startDailyRoute({ finale: true, onHome: true, consumed: true, dailyLive: true, over: false, hasTiles: true, finalePending: true }),
    'home-finale-guard', 'finale + on home short-circuits before any other branch');
  // finale but NOT on home does not guard — falls through the chain
  assert.strictEqual(
    F.startDailyRoute({ finale: true, onHome: false, consumed: false, dailyLive: false, over: false, hasTiles: false, finalePending: false }),
    'fresh', 'finale off home is not the home guard');

  // 2. consumed is checked FIRST after the guard — a stale live/tiles snapshot must NOT resume
  assert.strictEqual(
    F.startDailyRoute({ finale: false, onHome: false, consumed: true, dailyLive: true, over: false, hasTiles: true, finalePending: true }),
    'consumed', 'ZOMBIE FIX: consumed beats resume even with dailyLive+tiles present');

  // 3. resume — a live unfinished run with tiles, not over
  assert.strictEqual(
    F.startDailyRoute({ finale: false, onHome: false, consumed: false, dailyLive: true, over: false, hasTiles: true, finalePending: true }),
    'resume', 'live run with tiles resumes (and beats a finalePending flag)');
  // resume requires all three: dailyLive AND !over AND tiles
  assert.strictEqual(
    F.startDailyRoute({ finale: false, onHome: false, consumed: false, dailyLive: true, over: true, hasTiles: true, finalePending: false }),
    'fresh', 'dailyLive but over -> not a resume');
  assert.strictEqual(
    F.startDailyRoute({ finale: false, onHome: false, consumed: false, dailyLive: true, over: false, hasTiles: false, finalePending: false }),
    'fresh', 'dailyLive but no tiles -> not a resume');
  assert.strictEqual(
    F.startDailyRoute({ finale: false, onHome: false, consumed: false, dailyLive: false, over: false, hasTiles: true, finalePending: false }),
    'fresh', 'tiles but not dailyLive -> not a resume');

  // 4. finale — a pending finale re-enters instead of dealing fresh (no live run to resume)
  assert.strictEqual(
    F.startDailyRoute({ finale: false, onHome: false, consumed: false, dailyLive: false, over: false, hasTiles: false, finalePending: true }),
    'finale', 'finalePending with nothing to resume -> re-enter finale');

  // 5. fresh — the default when nothing else applies
  assert.strictEqual(
    F.startDailyRoute({ finale: false, onHome: false, consumed: false, dailyLive: false, over: false, hasTiles: false, finalePending: false }),
    'fresh', 'nothing pending -> deal fresh');
  assert.strictEqual(F.startDailyRoute(null), 'fresh', 'null ctx -> fresh, never throws');
}
console.log('sworble-flow: startDailyRoute passed');

// --- endRoundRoute: outcome routing per day-state ------------------------------------
{
  // daily, unresolved sworb (active, unsolved, guesses left) -> finale, no home hop yet
  assert.deepStrictEqual(
    F.endRoundRoute({ practice: false, hasEntry: true, sworbActive: true, sworbSolved: false, sworbGuessesLeft: 6 }),
    { route: 'finale', enteringFinale: true, homeReturn: false }, 'unresolved daily sworb -> finale');

  // daily, already solved -> normal over-landing + home hop
  assert.deepStrictEqual(
    F.endRoundRoute({ practice: false, hasEntry: true, sworbActive: true, sworbSolved: true, sworbGuessesLeft: 3 }),
    { route: 'over', enteringFinale: false, homeReturn: true }, 'solved sworb -> over + home return');

  // daily, guesses exhausted -> no finale (nothing left to guess) -> over + home
  assert.deepStrictEqual(
    F.endRoundRoute({ practice: false, hasEntry: true, sworbActive: true, sworbSolved: false, sworbGuessesLeft: 0 }),
    { route: 'over', enteringFinale: false, homeReturn: true }, 'no guesses left -> over + home');

  // daily, no sworb today -> over + home
  assert.deepStrictEqual(
    F.endRoundRoute({ practice: false, hasEntry: false, sworbActive: false, sworbSolved: false, sworbGuessesLeft: 6 }),
    { route: 'over', enteringFinale: false, homeReturn: true }, 'no entry today -> over + home');

  // practice never enters the finale AND never auto-hops home (keeps its own modal)
  assert.deepStrictEqual(
    F.endRoundRoute({ practice: true, hasEntry: true, sworbActive: true, sworbSolved: false, sworbGuessesLeft: 6 }),
    { route: 'over', enteringFinale: false, homeReturn: false }, 'practice -> over, no home return');

  // inactive sworb (sworbNow.active false) -> over
  assert.deepStrictEqual(
    F.endRoundRoute({ practice: false, hasEntry: true, sworbActive: false, sworbSolved: false, sworbGuessesLeft: 6 }),
    { route: 'over', enteringFinale: false, homeReturn: true }, 'inactive sworb -> over');

  assert.strictEqual(F.endRoundRoute(null).route, 'over', 'null ctx -> over, never throws');
}
console.log('sworble-flow: endRoundRoute passed');

// --- finaleResolveRoute: the four-way (+continue) exit table --------------------------
{
  assert.strictEqual(F.finaleResolveRoute({ finale: true, correct: true, spent: false }), 'finale-solve', 'correct in finale');
  assert.strictEqual(F.finaleResolveRoute({ finale: false, correct: true, spent: false }), 'solve', 'correct mid-day');
  assert.strictEqual(F.finaleResolveRoute({ finale: true, correct: false, spent: true }), 'finale-miss-out', '6th miss in finale');
  assert.strictEqual(F.finaleResolveRoute({ finale: false, correct: false, spent: true }), 'miss-out', '6th miss mid-day');
  assert.strictEqual(F.finaleResolveRoute({ finale: false, correct: false, spent: false }), 'miss-continue', 'miss with guesses left');
  assert.strictEqual(F.finaleResolveRoute({ finale: true, correct: false, spent: false }), 'miss-continue', 'miss with guesses left, in finale, still continues');
  // correct ALWAYS wins over spent (a correct guess is never a lockout)
  assert.strictEqual(F.finaleResolveRoute({ finale: true, correct: true, spent: true }), 'finale-solve', 'correct beats spent');
  assert.strictEqual(F.finaleResolveRoute(null), 'miss-continue', 'null ctx -> miss-continue, never throws');
}
console.log('sworble-flow: finaleResolveRoute passed');

// --- pause / resume / count-in legality ----------------------------------------------
{
  // manual pause: live hunt, not paused, no modal
  assert.strictEqual(F.pauseAction({ screen: 'game', over: false, finale: false, paused: false, activeModal: null }), 'pause', 'live hunt pauses');
  assert.strictEqual(F.pauseAction({ screen: 'game', over: false, finale: false, paused: true, activeModal: null }), 'noop', 'already paused -> noop');
  assert.strictEqual(F.pauseAction({ screen: 'game', over: false, finale: false, paused: false, activeModal: 'howto' }), 'noop', 'modal owns its own pause -> noop');
  assert.strictEqual(F.pauseAction({ screen: 'home', over: false, finale: false, paused: false, activeModal: null }), 'noop', 'off a hunt -> noop');
  assert.strictEqual(F.pauseAction({ screen: 'game', over: false, finale: true, paused: false, activeModal: null }), 'noop', 'finale -> noop (untimed)');

  // resume: only a fair-paused game
  assert.strictEqual(F.resumeAction({ gamePaused: true }), 'resume', 'gamePaused resumes');
  assert.strictEqual(F.resumeAction({ gamePaused: false }), 'noop', 'not fair-paused -> noop');
  assert.strictEqual(F.resumeAction(null), 'noop', 'null -> noop');

  // auto fair-pause: live hunt not already fair-paused — MUST fire during a count-in
  // (paused true, gamePaused false), so it can't gate on `paused`
  assert.strictEqual(F.fairPauseAction({ screen: 'game', over: false, finale: false, gamePaused: false }), 'pause', 'live hunt fair-pauses');
  assert.strictEqual(F.fairPauseAction({ screen: 'game', over: false, finale: false, gamePaused: true }), 'noop', 'already fair-paused -> noop');
  assert.strictEqual(F.fairPauseAction({ screen: 'home', over: false, finale: false, gamePaused: false }), 'noop', 'off a hunt -> noop');
  assert.strictEqual(F.fairPauseAction({ screen: 'game', over: true, finale: false, gamePaused: false }), 'noop', 'over -> noop');

  // flipStepper: no-op mid-hunt and mid-finale; flips only when the round is settled
  assert.strictEqual(F.flipStepperAction({ practice: false, screen: 'game', over: false, finale: false }), 'noop', 'live hunt -> no flip');
  assert.strictEqual(F.flipStepperAction({ practice: false, screen: 'game', over: false, finale: true }), 'noop', 'finale locked to sworb face -> no flip');
  assert.strictEqual(F.flipStepperAction({ practice: false, screen: 'game', over: true, finale: false }), 'flip', 'over (post-hunt) -> flip allowed');
  assert.strictEqual(F.flipStepperAction({ practice: true, screen: 'game', over: false, finale: false }), 'flip', 'practice is unaffected by the hunt guard');
}
console.log('sworble-flow: pause/resume/count-in legality passed');

console.log('sworble-flow: all passed');
