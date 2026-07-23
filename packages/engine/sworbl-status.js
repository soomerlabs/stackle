// sworbl-status.js — the daily-status selector: ONE pure answer to "what's the player's
// status today." Every surface that shows daily state (home seven, standings graph,
// header best, PLAY/RESUME label) reads THIS — never its own mix of storage + memory.
// That rule is the whole point: when a new source of truth appears (a saved snapshot,
// a live run), it's added here once and every surface picks it up together.
//
// Pure data-in/data-out — NO DOM, NO storage, NO `this`. The game gathers the inputs
// (from SworblStore + component memory) and passes them in; tests pin the priorities.
(function (root) {
  'use strict';

  function num(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }

  // Distinct words at their best-scoring play, top 7 by points, with the run total.
  // (The "Sworbl Seven" shape used by home, the recap, and the leaderboard number.)
  function sevenFromWords(roundWords) {
    const map = {};
    for (const w of (Array.isArray(roundWords) ? roundWords : [])) {
      const word = (w && w.word) ? String(w.word) : '';
      const pts = num(w && w.pts);
      if (!word || pts <= 0) continue;
      if (!map[word] || pts > map[word].pts) map[word] = { word, pts, best: !!(w && w.best) };
    }
    const words = Object.values(map).sort((a, b) => b.pts - a.pts).slice(0, 7);
    return { words, total: words.reduce((a, b) => a + b.pts, 0) };
  }

  // Cumulative score: sum of the best pts per DISTINCT word, UNCAPPED (no top-7 slice) and no
  // double-count for re-spelling. This is the running total the arcade/daily now shows (decision A).
  function cumulativeTotal(roundWords) {
    const map = {};
    for (const w of (Array.isArray(roundWords) ? roundWords : [])) {
      const word = (w && w.word) ? String(w.word).toLowerCase() : '';
      const pts = num(w && w.pts);
      if (!word || pts <= 0) continue;
      if (!map[word] || pts > map[word]) map[word] = pts;
    }
    return Object.values(map).reduce((a, b) => a + b, 0);
  }

  // Standing rank (1-based) for `me` against a field of opponents — solved-first,
  // score-second: an entry that solved the sworb outranks one that didn't, no matter the
  // score gap; within the same solved/unsolved bucket, higher score wins.
  // `me` is {score, solved} (the ONE-GAME shape). Back-compat: a plain number is treated
  // as {score: number, solved: false}, and field entries without a `solved` key are
  // treated as unsolved too — so a legacy all-score field ranks exactly as it always did.
  function rankFor(entries, me) {
    const f = Array.isArray(entries) ? entries : [];
    const target = (me && typeof me === 'object') ? { score: num(me.score), solved: !!me.solved } : { score: num(me), solved: false };
    const ahead = (e) => {
      if (!e) return false;
      const es = !!e.solved;
      if (es !== target.solved) return es; // solved beats unsolved regardless of score
      return num(e.score) > target.score;
    };
    return f.filter(ahead).length + 1;
  }

  // src = {
  //   done,            // the day's run finished (DONE_PREFIX)
  //   storedDailyBest, // int  (DAILY_PREFIX)
  //   storedSeven,     // {score, words}|null (SEVEN_PREFIX)
  //   puzzleBest,      // int  (PUZZLE_BEST_PREFIX)
  //   lbMe,            // {name, score}|null (LB_ME_PREFIX)
  //   savedRun,        // validated live-run snapshot|null (RUN_PREFIX)
  //   live: { active, over, roundWords, tilesCount },  // in-memory run
  // }
  function dailyStatus(src) {
    const s = src || {};
    const live = s.live || {};
    const liveNow = !!(live.active && !live.over && (Array.isArray(live.roundWords) ? live.roundWords : []).length);
    // seven source priority: live memory (freshest) > saved snapshot (pre-rehydrate) > banked day
    let seven, sevenLive;
    if (liveNow) { seven = sevenFromWords(live.roundWords); seven.total = cumulativeTotal(live.roundWords); sevenLive = true; }
    else if (!s.done && s.savedRun && Array.isArray(s.savedRun.roundWords) && s.savedRun.roundWords.length) { seven = sevenFromWords(s.savedRun.roundWords); seven.total = cumulativeTotal(s.savedRun.roundWords); sevenLive = true; }
    else {
      const st = s.storedSeven;
      const words = (st && Array.isArray(st.words)) ? st.words.slice(0, 7) : [];
      seven = { words, total: num(st && st.score) || num(s.storedDailyBest) };
      sevenLive = false;
    }
    // bestToday: the highest score any source has recorded for today — live included
    const bestToday = Math.max(
      num(s.storedDailyBest),
      num(s.storedSeven && s.storedSeven.score),
      num(s.puzzleBest),
      num(s.lbMe && s.lbMe.score),
      liveNow ? seven.total : 0,
      (!s.done && s.savedRun) ? cumulativeTotal(s.savedRun.roundWords) : 0
    );
    const resumable = !s.done && (
      !!(live.active && !live.over && num(live.tilesCount)) || !!s.savedRun
    );
    var sw = s.sworb;
    var sworb;
    if (!sw || !sw.entry) { sworb = { active: false }; }
    else {
      var themeList = sw.entry.themeWords || [];
      var total = themeList.length;
      var foundCount = Array.isArray(sw.cluesFound) ? sw.cluesFound.length : 0;
      var guessesLeft = Math.max(0, 6 - (num(sw.guessesUsed) || 0));
      var solved = !!sw.solved;
      sworb = {
        active: true, total: total, foundCount: foundCount, guessesLeft: guessesLeft, solved: solved,
        canGuess: !solved && guessesLeft > 0,
        rank: { solved: solved, solveTier: num(sw.solveTier) || 0, themeFound: foundCount },
      };
    }
    return {
      played: bestToday > 0,
      bestToday,
      seven: { words: seven.words, total: seven.total, live: !!sevenLive },
      resumable,
      sworb: sworb,
    };
  }

  // The day's persisted finale lifecycle — 'fresh' | 'finale' | 'done' — derived purely from
  // storage-backed facts: DONE_PREFIX (`done`) plus the raw sworbState() fields (`solved`,
  // `guessesUsed`). The T3 re-entry Critical (endRound()/frame() re-entering the finale
  // pipeline on every animation frame) lived in exactly this state machine; finalePending()/
  // dailyConsumed() in index.html are now thin wrappers around this single source of truth.
  //
  // 'live' (a round currently being hunted) is part of the app's full day-status domain but
  // is NOT reachable from these three inputs alone: the sworb-guess UI only ever unlocks once
  // `done` is already true (endRound's finale gate writes DONE_PREFIX before the finale branch
  // even runs), so done:false always means solved:false/guessesUsed:0 whether a round is
  // mid-hunt or was never started today. Callers layer their own runtime signal (e.g.
  // _dailyLive) on top of a 'fresh' result when they need to tell those two apart.
  function dayState(s) {
    s = s || {};
    if (!s.done) return 'fresh';
    const solved = !!s.solved;
    const guessesUsed = num(s.guessesUsed); // same sanitizer dailyStatus() uses: non-finite/negative -> 0
    if (solved || guessesUsed >= 6) return 'done';
    return 'finale';
  }

  // Home slim score strip: how far `you` (bestToday) sit against `top` (the field's #1
  // score) — the fill-bar percent, clamped so beating the leader never overflows the track,
  // plus whether that pair counts as a "hit" (knob turns candy violet). top<=0 (nobody's
  // posted yet, or a dormant/pre-play read) always reads 0%/no-hit — there's nothing to
  // chase. `you` alone never gates the result: the caller's own `played`/`dormant` checks
  // already keep an un-played 0 from reaching here with a real top score.
  function progressToTop(you, top) {
    const t = Number(top) || 0;
    const y = Number(you) || 0;
    const pct = t > 0 ? Math.min(100, Math.round((y / t) * 100)) : 0;
    const hit = t > 0 && y >= t;
    return { pct, hit };
  }

  // bankFinaleBonus's score-banking math: the finale solve's bonus rides today's live
  // state.score, but state.score doesn't survive a mid-finale re-entry (exiting resets it,
  // and a reload lands on the fresh-boot default) — either way it's reconstructable from
  // sources that DO survive: the standing daily best (storedBest) + the persisted solve
  // bonus. Uninterrupted play has stateScore == storedBest+bonus already (equal either
  // way); re-entry has stateScore == bonus alone (storedBest+bonus must win) — Math.max
  // is correct for both. `runsLast` (the RUNS history's last entry) ratchets up to the
  // banked total but is never regressed downward by a reconstructed re-entry read.
  function reconcileFinaleScore(input) {
    const i = input || {};
    const stateScore = num(i.stateScore);
    const storedBest = num(i.storedBest);
    const bonus = num(i.bonus);
    const runsLast = num(i.runsLast);
    const banked = Math.max(stateScore, storedBest + bonus);
    return { banked, runsLast: Math.max(runsLast, banked) };
  }

  const API = { sevenFromWords, cumulativeTotal, rankFor, dailyStatus, dayState, progressToTop, reconcileFinaleScore };
  root.SworblStatus = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
