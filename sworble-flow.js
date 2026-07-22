// sworble-flow.js — the round-lifecycle DECISION layer: given a snapshot of the day/round
// state, decide which transition happens. Pure data-in/data-out — NO DOM, NO storage, NO
// `this`, NO setState/sfx/timers. The Component (index.html) gathers the inputs, calls one
// of these to get the DECISION, then owns every side effect (setState, LS, sfx, this.later).
//
// This is the state machine the T3 "zombie run" and "finale re-entry" Criticals lived in.
// The whole point of pinning it here is that the branch ORDER — which the fixes made sacred —
// is now enforced by tests instead of living only as inline comments in a 6000-line method.
//
// Loaded via <script src> in <helmet> (sets window.SworbleFlow); mirrored to module.exports
// for tests (tests/sworble-flow.test.js).
(function (root) {
  'use strict';

  function num(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }

  // A round is a LIVE hunt (the timed word-drop is running) when we're on the game screen and
  // neither the over-sheet nor the finale has taken over. Mirrors index.html's liveHunt(st).
  // Everything that gates a pause/resume keys off this exact predicate.
  function liveHunt(ctx) {
    var c = ctx || {};
    return c.screen === 'game' && !c.over && !c.finale;
  }

  // startDaily's branch chain — THE zombie-fixed ordering, kept sacred. PLAY / dock button /
  // swipe-up all route through here. The order matters and is load-bearing:
  //   1. 'home-finale-guard' — the HOME finale keyboard is open (finale + on home): the player
  //      is already guessing right where they are; PLAY must NOT bounce to the game screen and
  //      wipe the letters. This is the ONLY route that fires BEFORE the click sfx (a pure no-op).
  //   2. 'consumed' — the day is fully resolved (checked FIRST after the guard, before any
  //      resume): no branch below may run, ESPECIALLY not the in-memory resume — a stale
  //      rehydrated snapshot once matched it and opened a ghost round on a finished day. The
  //      caller kills any such zombie state on the way out.
  //   3. 'resume' — a live, unfinished daily run only paused by visiting home (or an auto-pause):
  //      re-enter the SAME run (fair-pause overlay), never re-roll.
  //   4. 'finale' — a pending finale (left early via back/swipe-down): re-enter the SAME
  //      unresolved guess, never deal a fresh round.
  //   5. 'fresh' — nothing to resume: deal a new round.
  //
  // ctx = { finale, onHome, consumed, dailyLive, over, hasTiles, finalePending }
  function startDailyRoute(ctx) {
    var c = ctx || {};
    if (c.finale && c.onHome) return 'home-finale-guard';
    if (c.consumed) return 'consumed';
    if (c.dailyLive && !c.over && c.hasTiles) return 'resume';
    if (c.finalePending) return 'finale';
    return 'fresh';
  }

  // endRound's outcome routing. THE FINALE GATE: a daily round whose sworb is still unresolved
  // (active, unsolved, a guess still live) morphs the board straight into the guess keyboard
  // instead of landing on the over-sheet. Already-solved (or no sworb / practice) takes the
  // normal over-landing. `over` stays FALSE for the whole finale on purpose (see index.html).
  //
  // ctx = { practice, hasEntry, sworbActive, sworbSolved, sworbGuessesLeft }
  // -> { route: 'finale' | 'over', enteringFinale, homeReturn }
  //   homeReturn: only the non-finale DAILY exit auto-hops home here; practice keeps its own
  //   on-board modal, and the finale's own resolution (sworbSubmit) hops home itself later.
  function endRoundRoute(ctx) {
    var c = ctx || {};
    var dailyMode = !c.practice;
    // sworbEntry in index.html is `dailyMode && dailyEntry()` — so hasEntry only counts in daily
    var enteringFinale = !!(dailyMode && c.hasEntry && c.sworbActive && !c.sworbSolved && num(c.sworbGuessesLeft) > 0);
    return {
      route: enteringFinale ? 'finale' : 'over',
      enteringFinale: enteringFinale,
      homeReturn: dailyMode && !enteringFinale,
    };
  }

  // sworbSubmit's four-way exit routing once a guess resolves. The engine (color reveal, win
  // flash, block-keep) is identical; only the EXIT differs by finale-vs-not × solved-vs-spent.
  //   'finale-solve'    — correct in the finale: bank the bonus, then land home.
  //   'solve'           — correct mid-day (pre-finale flip): retire the keyboard to PLAY.
  //   'finale-miss-out' — 6th miss in the finale: reveal the answer, then land home.
  //   'miss-out'        — 6th miss mid-day: reveal the answer, retire to PLAY.
  //   'miss-continue'   — a miss with guesses left: keep greens/yellows, blank the grays.
  //
  // ctx = { finale, correct, spent }  (spent = guessesLeft <= 0 after this guess)
  function finaleResolveRoute(ctx) {
    var c = ctx || {};
    if (c.correct) return c.finale ? 'finale-solve' : 'solve';
    if (c.spent) return c.finale ? 'finale-miss-out' : 'miss-out';
    return 'miss-continue';
  }

  // Manual PAUSE legality (the pause button): a fair-pause only applies to a live hunt that
  // isn't already paused and has no modal open (a modal owns its own pause). No-op otherwise.
  // ctx = { screen, over, finale, paused, activeModal }
  function pauseAction(ctx) {
    var c = ctx || {};
    return (liveHunt(c) && !c.paused && !c.activeModal) ? 'pause' : 'noop';
  }

  // RESUME legality (tapping inside the fair-pause overlay): only a fair-paused game resumes,
  // and it re-arms the 3·2·1 count-in rather than jumping to a running clock. No-op otherwise.
  // ctx = { gamePaused }
  function resumeAction(ctx) {
    var c = ctx || {};
    return c.gamePaused ? 'resume' : 'noop';
  }

  // AUTO fair-pause legality (visibilitychange / pagehide / blur all call this). Must still run
  // DURING a count-in (count-in holds `paused` true but NOT `gamePaused`) so a backgrounded tab
  // mid-3·2·1 cancels the chain and arms the overlay. No-op once already fair-paused, or off a
  // live hunt. ctx = { screen, over, finale, gamePaused }
  function fairPauseAction(ctx) {
    var c = ctx || {};
    return (liveHunt(c) && !c.gamePaused) ? 'pause' : 'noop';
  }

  // flipStepper legality: the stepper card flip is a no-op while a daily round is still being
  // hunted (nothing to flip to yet) AND once the finale itself is live (the morph is locked to
  // the sworb face for its whole duration). Practice is unaffected by either guard.
  // ctx = { practice, screen, over, finale }  -> 'flip' | 'noop'
  function flipStepperAction(ctx) {
    var c = ctx || {};
    var daily = !c.practice && c.screen === 'game';
    var liveHunting = daily && !c.over && !c.finale;
    return (liveHunting || c.finale) ? 'noop' : 'flip';
  }

  var API = {
    liveHunt: liveHunt,
    startDailyRoute: startDailyRoute,
    endRoundRoute: endRoundRoute,
    finaleResolveRoute: finaleResolveRoute,
    pauseAction: pauseAction,
    resumeAction: resumeAction,
    fairPauseAction: fairPauseAction,
    flipStepperAction: flipStepperAction,
  };
  root.SworbleFlow = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
