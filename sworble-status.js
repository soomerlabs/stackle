// sworble-status.js — the daily-status selector: ONE pure answer to "what's the player's
// status today." Every surface that shows daily state (home seven, standings graph,
// header best, PLAY/RESUME label) reads THIS — never its own mix of storage + memory.
// That rule is the whole point: when a new source of truth appears (a saved snapshot,
// a live run), it's added here once and every surface picks it up together.
//
// Pure data-in/data-out — NO DOM, NO storage, NO `this`. The game gathers the inputs
// (from SworbleStore + component memory) and passes them in; tests pin the priorities.
(function (root) {
  'use strict';

  function num(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 0; }

  // Distinct words at their best-scoring play, top 7 by points, with the run total.
  // (The "Sworble Seven" shape used by home, the recap, and the leaderboard number.)
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

  // Standing rank for a score against a field of {score} entries (1-based).
  function rankFor(entries, score) {
    const f = Array.isArray(entries) ? entries : [];
    return f.filter(e => e && num(e.score) > num(score)).length + 1;
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
    if (liveNow) { seven = sevenFromWords(live.roundWords); sevenLive = true; }
    else if (!s.done && s.savedRun && Array.isArray(s.savedRun.roundWords) && s.savedRun.roundWords.length) { seven = sevenFromWords(s.savedRun.roundWords); sevenLive = true; }
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
      (!s.done && s.savedRun) ? num(sevenFromWords(s.savedRun.roundWords).total) : 0
    );
    const resumable = !s.done && (
      !!(live.active && !live.over && num(live.tilesCount)) || !!s.savedRun
    );
    var sw = s.sworb;
    var sworb;
    if (!sw || !sw.entry) { sworb = { active: false }; }
    else {
      var themeList = sw.entry.themeWords || sw.entry.clues || [];
      var total = themeList.length;
      var foundCount = Array.isArray(sw.cluesFound) ? sw.cluesFound.length : 0;
      var guessesLeft = Math.max(0, 3 - (num(sw.guessesUsed) || 0));
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

  const API = { sevenFromWords, rankFor, dailyStatus };
  root.SworbleStatus = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
