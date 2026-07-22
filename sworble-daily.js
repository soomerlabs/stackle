// sworble-daily.js — pure "sworb of the day" content + guess logic. NO DOM, NO storage, NO `this`.
// Loaded via <script src> (sets window.SworbleDaily); module.exports mirrors it for tests.
(function (root) {
  'use strict';

  // Reward tiers for a correct sworb guess, scaled INVERSELY by clues found at guess time
  // (bold cold-read pays most; guessing after finding everything pays least). Tuning constants.
  var REWARD = { none: 500, few: 350, most: 200, all: 75 };

  function parseEntry(dailies, day) {
    if (!dailies || typeof dailies !== 'object') return null;
    var e = dailies[day];
    if (!e || typeof e !== 'object') return null;
    var sworb = typeof e.sworb === 'string' ? e.sworb.trim().toLowerCase() : '';
    if (!sworb) return null;
    // accept a theme-word POOL (new) or the legacy `clues` array (back-compat); no upper cap
    var raw = Array.isArray(e.themeWords) ? e.themeWords : (Array.isArray(e.clues) ? e.clues : null);
    if (!raw || !raw.length) return null;
    var themeWords = [];
    for (var i = 0; i < raw.length; i++) {
      var w = typeof raw[i] === 'string' ? raw[i].trim().toLowerCase() : '';
      if (!w) return null;
      themeWords.push(w);
    }
    return { sworb: sworb, themeWords: themeWords };
  }

  // A spelled word counts as finding a clue if it STARTS WITH the clue (trims/trimmed/
  // trimming all bank "trim"; seedy banks "seed"). Returns the matched clue itself (lowercase)
  // so the caller knows exactly what to bank/dedup — not the spelled word. When more than one
  // clue prefixes the word (e.g. both "seed" and "seeds" are clues and the word is "seeds"),
  // the LONGEST matching clue wins. Returns null on no match / missing entry / empty word.
  function clueFor(word, entry) {
    if (!entry || !word) return null;
    var list = entry.themeWords || [];
    var w = String(word).toLowerCase();
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var c = String(list[i] || '').toLowerCase();
      if (c && w.indexOf(c) === 0 && (!best || c.length > best.length)) best = c;
    }
    return best;
  }
  function isClue(word, entry) { return !!clueFor(word, entry); }

  function normalize(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function checkGuess(input, entry) { return !!entry && normalize(input) === entry.sworb; }

  function guessReward(cluesFound, total) {
    if (cluesFound <= 0) return REWARD.none;
    if (cluesFound >= total) return REWARD.all;
    if (cluesFound <= 2) return REWARD.few;
    return REWARD.most;
  }

  // Wordle-style per-letter feedback for a guess against the answer. Returns an array the
  // length of `guess`: 'green' (right letter, right spot), 'yellow' (in the word, wrong spot),
  // 'gray' (not in the word). Duplicate letters are handled the true-Wordle way: greens are
  // matched first, then each remaining answer letter can satisfy at most one yellow.
  function scoreGuess(guess, answer) {
    var g = String(guess || '').toLowerCase();
    var a = String(answer || '').toLowerCase();
    var res = [], used = [];
    for (var j = 0; j < a.length; j++) used[j] = false;
    for (var i = 0; i < g.length; i++) {
      if (g[i] === a[i]) { res[i] = 'green'; used[i] = true; } else res[i] = 'gray';
    }
    for (var k = 0; k < g.length; k++) {
      if (res[k] === 'green') continue;
      for (var m = 0; m < a.length; m++) {
        if (!used[m] && g[k] === a[m]) { res[k] = 'yellow'; used[m] = true; break; }
      }
    }
    return res;
  }

  // FOUND_PREFIX banking, dedupe-safe: bank `clue` into `found` exactly once. The caller
  // resolves a spelled word to its clue via clueFor() first (so "trims"/"trimmed"/"trimming"
  // all arrive here as the SAME clue, "trim") — bankClue's only job is the append-once
  // arithmetic. Never mutates `found`: returns the SAME reference back when there's nothing
  // new to bank (already present, or clue is falsy), a NEW array (append) otherwise — the
  // split-brain glow/bank class of bug has bitten twice, pinning this with the caller able to
  // tell "banked" from "no-op" via reference equality.
  function bankClue(found, clue) {
    var list = Array.isArray(found) ? found : [];
    if (!clue || list.indexOf(clue) >= 0) return list;
    return list.concat([clue]);
  }

  // The finale guess decision, extracted pure from guessSworb (index.html): 6-guess cap,
  // no-op once already solved or budget exhausted, reward tiers scaled by clues found at
  // guess time, case-insensitive match (checkGuess's own normalize()). The caller
  // (index.html) still owns persistence (saveSworb) and setState — this just decides.
  //
  // args = { input, entry, guessesUsed, solved, foundCount, total }
  // -> { ok, correct, newGuessesUsed, nowSolved, lockedOut, bonus }
  //   ok=false means no fresh guess was processed (no entry today, or already
  //   solved/exhausted — a no-op resubmit never re-scores or re-banks). lockedOut is true
  //   whenever the 6-guess budget is spent after this call (already-spent no-ops, and the
  //   6th miss itself) — the caller uses it to trigger the finale's exhausted exit.
  function applySworbGuess(args) {
    var a = args || {};
    var guessesUsed = (typeof a.guessesUsed === 'number' && isFinite(a.guessesUsed) && a.guessesUsed > 0) ? a.guessesUsed : 0;
    var solved = !!a.solved;
    if (!a.entry) return { ok: false };
    if (solved || guessesUsed >= 6) return { ok: false, lockedOut: true };
    var correct = checkGuess(a.input, a.entry);
    var newGuessesUsed = Math.min(6, guessesUsed + 1); // cap at 6, defensive against overrun input
    var bonus = 0;
    if (correct) {
      var foundCount = (typeof a.foundCount === 'number' && isFinite(a.foundCount) && a.foundCount > 0) ? a.foundCount : 0;
      var total = (typeof a.total === 'number' && isFinite(a.total) && a.total > 0) ? a.total : 0;
      bonus = guessReward(foundCount, total);
    }
    return {
      ok: true, correct: correct, newGuessesUsed: newGuessesUsed, nowSolved: correct,
      lockedOut: !correct && newGuessesUsed >= 6, bonus: bonus,
    };
  }

  // sentinel `ch` value for nextSlots meaning "backspace" rather than a typed letter —
  // never collides with a real key (sworbKey's onClick only ever passes 'A'..'Z').
  var BACKSPACE = '';

  // sworbKey/sworbBackspace's shared slot-fill state machine, extracted pure. Wordle-
  // persistence means slots can have interior gaps after a miss (green/yellow letters stay
  // put), so typing always fills the first genuinely EMPTY slot (greens are skipped because
  // they're never empty). A fresh keystroke also clears any soft YELLOW hints first (locked
  // GREENS never move) so the player can freely override them. Backspace clears the LAST
  // filled slot that isn't a locked green, scanning from the end.
  //
  // args = { slots, colors, ch, len } — `ch` is a letter to type, or the BACKSPACE
  // sentinel. `len` (the sworb's length) is only used to pad `slots` on the typing path
  // (backspace never extends the row — matches the original sworbBackspace, which never
  // padded either). Returns { slots, colors } (colors is null when nothing is colored yet,
  // matching the original `colors.some(Boolean) ? colors : null`), or null when the action
  // is a no-op (full row with nothing empty to type into; nothing but greens/empties to
  // backspace) — the ORIGINAL updaters returned `{}` for this case (no state change); null
  // here is the same intent, made explicit for a pure function.
  function nextSlots(args) {
    var a = args || {};
    var srcSlots = Array.isArray(a.slots) ? a.slots.slice() : [];
    var srcColors = Array.isArray(a.colors) ? a.colors.slice() : [];
    if (a.ch === BACKSPACE) {
      var bSlots = srcSlots.slice(), bColors = srcColors.slice();
      var bIdx = -1;
      for (var i = bSlots.length - 1; i >= 0; i--) { if (bSlots[i] && bColors[i] !== 'green') { bIdx = i; break; } }
      if (bIdx < 0) return null;
      bSlots[bIdx] = ''; bColors[bIdx] = null;
      return { slots: bSlots, colors: bColors.some(Boolean) ? bColors : null };
    }
    var len = (typeof a.len === 'number' && isFinite(a.len) && a.len > 0) ? a.len : 0;
    var slots = srcSlots.slice(); while (slots.length < len) slots.push('');
    var colors = srcColors.slice();
    if (colors.some(function (x) { return x === 'yellow'; })) {
      slots = slots.map(function (c, i) { return colors[i] === 'green' ? c : ''; });
      colors = colors.map(function (x) { return x === 'green' ? x : null; });
    }
    var idx = slots.findIndex(function (x) { return !x; }); // first empty slot (greens filled -> skipped)
    if (idx < 0) return null;
    slots[idx] = a.ch; colors[idx] = null;
    return { slots: slots, colors: colors.some(Boolean) ? colors : null };
  }

  // checkTargetCatch's catch decision, extracted pure: does this committed word match an
  // un-caught target, and if so bank it. On a sworb day (entry present) banking targets the
  // matched CLUE itself (clueFor) — a longer spelled word that only EXTENDS a clue (trims,
  // trimmed, trimming) still banks "trim", once. Without an entry (no sworb today), falls
  // back to exact-match against the top-5 collectible `targets` list — clueFor is never
  // consulted, so `targets` only matters when there's no entry to defer to.
  //
  // args = { word, entry, targets, found } -> { clue, banked, isNew }
  //   clue: the matched clue/target, or null on no match. banked: the result of bankClue
  //   (SAME reference as `found` when nothing new was banked — dedupe-safe, reference-
  //   equality preserved). isNew: true only when a fresh clue actually got banked.
  function resolveCatch(args) {
    var a = args || {};
    var found = Array.isArray(a.found) ? a.found : [];
    var word = a.word ? String(a.word).toLowerCase() : '';
    if (!word) return { clue: null, banked: found, isNew: false };
    var targets = Array.isArray(a.targets) ? a.targets : [];
    var clue = a.entry ? clueFor(word, a.entry) : (targets.indexOf(word) >= 0 ? word : null);
    if (!clue) return { clue: null, banked: found, isNew: false };
    var banked = bankClue(found, clue);
    return { clue: clue, banked: banked, isNew: banked !== found };
  }

  // ---- HINT AIDS (owner-locked 2026-07-22, docs/superpowers/specs/2026-07-21-app-redesign-
  // scope.md "HINT AIDS + MONETIZATION SEAM"): three free aids — first-letter ghost pills
  // (see index.html's clueToken), earned hint TOKENS (the seam, decided here), and an
  // automatic token-free MERCY PULSE (also decided here). All pure: these fns only ANSWER
  // "should X happen right now" — index.html owns persistence, setState, and the glow fx.

  // one grant per round for now; a number (not a bool) so a future "earn up to N" tuning
  // knob is a one-line change here, not a reshape of the caller's contract.
  var MAX_HINT_GRANTS_PER_ROUND = 1;
  var HINT_TOKEN_WORD_THRESHOLD = 7;
  var MERCY_THRESHOLD_SECS = 120; // "2:00 remaining"
  var MERCY_MAX_CLUES_FOUND = 2;

  // hintTokenEvents(args) -> {grant: bool} — grants ONE token once the player has spelled
  // >=7 words THIS ROUND while clues remain unfound (cluesFound < cluesTotal), and only if
  // a token hasn't already been earned this round (tokensEarnedAlready, guards the repeat —
  // the caller persists this per day so it survives a reload). cluesTotal<=0 (no sworb
  // today, or nothing left to find) never grants — there'd be nothing to hint at.
  function hintTokenEvents(args) {
    var a = args || {};
    var words = Number(a.wordsSpelledThisRound) || 0;
    var cluesFound = Number(a.cluesFound) || 0;
    var cluesTotal = Number(a.cluesTotal) || 0;
    var already = Number(a.tokensEarnedAlready) || 0;
    if (already >= MAX_HINT_GRANTS_PER_ROUND) return { grant: false };
    if (words < HINT_TOKEN_WORD_THRESHOLD) return { grant: false };
    if (cluesTotal <= 0 || cluesFound >= cluesTotal) return { grant: false };
    return { grant: true };
  }

  // firstUnfoundClue(themeWords, found) -> word|null — MERCY PULSE's deterministic target:
  // the first still-unfound clue in REALIZED (themeWords) order. `found` entries are
  // compared case-insensitively (FOUND_PREFIX always banks lowercase, but this stays
  // defensive rather than trusting the caller).
  function firstUnfoundClue(themeWords, found) {
    var list = Array.isArray(themeWords) ? themeWords : [];
    var f = (Array.isArray(found) ? found : []).map(function (w) { return String(w || '').toLowerCase(); });
    for (var i = 0; i < list.length; i++) {
      var w = String(list[i] || '').toLowerCase();
      if (w && f.indexOf(w) < 0) return w;
    }
    return null;
  }

  // mercyPulseShouldFire(args) -> bool — fires exactly on the tick the round clock CROSSES
  // the 2:00-remaining mark (same crossing idiom as index.html's low-time banner:
  // prevSecsLeft > threshold && secsLeft <= threshold — never a level check, or a slow tab
  // re-render could re-fire it every tick), only when <=2 clues are found, and never once
  // alreadyFired (the caller's in-memory-only guard — deliberately NOT persisted, so a
  // reload re-arms it; see the HINT AIDS integrity rules).
  function mercyPulseShouldFire(args) {
    var a = args || {};
    if (a.alreadyFired) return false;
    var prev = Number(a.prevSecsLeft);
    var now = Number(a.secsLeft);
    if (!isFinite(prev) || !isFinite(now)) return false;
    var crossed = prev > MERCY_THRESHOLD_SECS && now <= MERCY_THRESHOLD_SECS;
    if (!crossed) return false;
    var cluesFound = Number(a.cluesFound) || 0;
    return cluesFound <= MERCY_MAX_CLUES_FOUND;
  }

  var API = { parseEntry: parseEntry, isClue: isClue, clueFor: clueFor, checkGuess: checkGuess, guessReward: guessReward, scoreGuess: scoreGuess, bankClue: bankClue, applySworbGuess: applySworbGuess, nextSlots: nextSlots, BACKSPACE: BACKSPACE, resolveCatch: resolveCatch, REWARD: REWARD,
    hintTokenEvents: hintTokenEvents, firstUnfoundClue: firstUnfoundClue, mercyPulseShouldFire: mercyPulseShouldFire,
    HINT_TOKEN_WORD_THRESHOLD: HINT_TOKEN_WORD_THRESHOLD, MAX_HINT_GRANTS_PER_ROUND: MAX_HINT_GRANTS_PER_ROUND, MERCY_THRESHOLD_SECS: MERCY_THRESHOLD_SECS, MERCY_MAX_CLUES_FOUND: MERCY_MAX_CLUES_FOUND };
  root.SworbleDaily = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
