// sworbl-store.js — persistence layer: the ONE place every storage key is named,
// plus the safe localStorage shim and typed get/set helpers.
//
// Loaded via <script src> in <helmet> (sets window.SworblStore); mirrored to
// module.exports for tests. The game does `const LS = SworblStore.LS, K = SworblStore.K;`.
//
// ⚠ Key names are a COMPATIBILITY CONTRACT — renaming one orphans real player data.
// (Pre-release exception, owner-sanctioned 2026-07-22: no real player data exists yet, so the
// migration debt from the Jul-2026 worddrop_* -> sworble_* rename — the stackle_* legacy-copy
// heal and the `worddrop_muted` holdout name it spared — was wiped outright rather than kept
// forever. Once this ships, key renames go back to being a real compatibility contract.)
(function (root) {
  'use strict';

  // storage-blocked contexts (zip/mail/Drive previews, some private modes) throw on ANY
  // localStorage touch — fall back to in-memory so the game still runs.
  let backing = (() => {
    try {
      const t = (root.localStorage || globalThis.localStorage);
      t.setItem('__ls_t', '1'); t.removeItem('__ls_t'); return t;
    } catch (e) {
      const m = {};
      return {
        getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
        setItem: (k, v) => { m[k] = String(v); },
        removeItem: k => { delete m[k]; },
        key: i => Object.keys(m)[i] || null,
        get length() { return Object.keys(m).length; },
      };
    }
  })();

  // LS is a stable FACADE over a swappable backing (living-engine change, Phase 1 of the
  // RN rebuild): callers keep their `const LS = SworblStore.LS` reference forever while
  // setBacking() redirects it — MMKV on native, localStorage on web, memory in tests.
  // A backing must provide getItem/setItem/removeItem, and key(i)+length for keys().
  const LS = {
    getItem: (k) => backing.getItem(k),
    setItem: (k, v) => backing.setItem(k, v),
    removeItem: (k) => backing.removeItem(k),
    key: (i) => (backing.key ? backing.key(i) : null),
    get length() { return backing.length || 0; },
  };
  function setBacking(b) {
    if (!b || typeof b.getItem !== 'function' || typeof b.setItem !== 'function' || typeof b.removeItem !== 'function') {
      throw new Error('setBacking: backing needs getItem/setItem/removeItem');
    }
    backing = b;
  }

  // Every key in one place. PREFIX entries are concatenated with a day-key or board id.
  const K = {
    BEST: 'sworbl_best',
    OPTS: 'sworbl_opts',
    NAME: 'sworbl_name',
    SINCE: 'sworbl_since', // first-seen timestamp -> "player since <Mon YYYY>" on the profile eyebrow
    BESTWORD: 'sworbl_bestword',
    WORDS_TOTAL: 'sworbl_words_total',
    // SEEN_HOWTO/SEEN_MINES retired: the auto-opening first-run how-to sheet they gated is
    // gone (see componentDidMount's Post-pivot comment) and neither key has any remaining
    // reader/writer. Any orphaned sworble_seen_howto/sworble_seen_mines in a returning
    // player's storage is simply inert.
    SEEN_STACKHINT: 'sworbl_seen_stackhint',
    SEEN_BOMBHINT: 'sworbl_seen_bombhint',
    // TUT_DONE ('sworbl_tut_done') retired in Task 5c — the warm-up (`tut`) flow is removed
    // entirely (onboarding is the future tutorial, backlogged). Not reused: any orphaned
    // sworble_tut_done in a returning player's storage is simply inert.
    AUDIO_CLAIM: 'sworbl_audio_claim',
    MUTED: 'sworbl_muted', // was the legacy 'worddrop_muted' name, pre-release-wiped 2026-07-22
    // per-day / per-board PREFIXES — `K.DAILY_PREFIX + dayKey`, `K.LB_ME_PREFIX + boardId`:
    DAILY_PREFIX: 'sworbl_daily_',
    ATT_PREFIX: 'sworbl_att_',
    SEVEN_PREFIX: 'sworbl_seven_',
    RUNS_PREFIX: 'sworbl_runs_',
    PUZZLE_BEST_PREFIX: 'sworbl_puzzle_best_',
    // STACKL_BEST_PREFIX retired in Task 4 (mode collapse) — the Stackl (2-min timed) arm no
    // longer exists, so its per-day best key is dead. Not reused: any orphaned
    // sworble_stackl_best_* entries in a returning player's storage are simply inert.
    // PUZZLE_PAR_PREFIX retired: nothing ever wrote a sworble_puzzle_par_* entry — it was only
    // ever named in resetDayTap's defensive wipe list. Any orphaned entries are simply inert.
    TARGETS_PREFIX: 'sworbl_targets_',
    FOUND_PREFIX: 'sworbl_found_',
    LB_ME_PREFIX: 'sworbl_lb_me_',
    DONE_PREFIX: 'sworbl_done_', // one run per day: set when a daily run ends, locks the daily
    RUN_PREFIX: 'sworbl_run_', // live-run snapshot (mid-run save/resume) — cleared when the run ends
    SWORB_PREFIX: 'sworbl_sworb_', // per-day sworb state: { guessesUsed, solved, correct, bonus, found:[] }
    HINT_TOKENS_PREFIX: 'sworbl_hint_tokens_', // per-day HINT AIDS token bank: { count, granted } — granted guards the one-per-round hintTokenEvents() grant (see sworbl-daily.js)
    THEME_PREFIX: 'sworbl_theme_', // per-day realized theme set (words actually seeded on the board): string[]
    PLAYER_ID: 'sworbl_player_id', // stable per-device UUID sent with Soomer submits (claimable by an account later)
    PENDING_SUBMITS: 'sworbl_pending_submits', // SworblApi's durable submit outbox — value must match QUEUE_KEY in sworbl-net.js
    TIME_PREFIX: 'sworbl_time_', // per-day seconds actively on the board (freezes when you leave the board)
  };

  // Typed, exception-safe accessors (optional sugar over LS + parse/stringify).
  // (getStr — a plain-string get/default wrapper — had zero callers across index.html and
  // zero test coverage; dead-code sweep 2026-07-22 removed it. getInt/getJSON below cover
  // every actual accessor the game reads.)
  function getInt(k, d) { try { return (parseInt(LS.getItem(k) || '', 10) || 0) || (d || 0); } catch (e) { return d || 0; } }
  function getJSON(k, d) { try { const v = LS.getItem(k); return v == null ? (d == null ? null : d) : JSON.parse(v); } catch (e) { return d == null ? null : d; } }
  function set(k, v) { try { LS.setItem(k, String(v)); } catch (e) {} }
  function setJSON(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function remove(k) { try { LS.removeItem(k); } catch (e) {} }
  function keys() { const out = []; try { for (let i = 0; i < LS.length; i++) { const kk = LS.key(i); if (kk) out.push(kk); } } catch (e) {} return out; }

  // ---- age-based GC for per-day-keyed entries ------------------------------------
  // Every PREFIX in K whose suffix names a calendar day (`PREFIX + 'YYYY-MM-DD'`, one —
  // LB_ME_PREFIX — with an optional trailing `|mode`). Sourced from resetDayTap's own
  // defensive per-day wipe list in index.html (the one place that already enumerates
  // "every key this day could have written"), plus LB_ME_PREFIX. Anything NOT in this list
  // (BEST, OPTS, NAME, PLAYER_ID, the one-off flags, MUTED, …) is never day-keyed and the
  // GC below must never touch it.
  const DATED_PREFIXES = [
    K.DAILY_PREFIX, K.ATT_PREFIX, K.SEVEN_PREFIX, K.RUNS_PREFIX, K.PUZZLE_BEST_PREFIX,
    K.TARGETS_PREFIX, K.FOUND_PREFIX, K.DONE_PREFIX, K.RUN_PREFIX, K.SWORB_PREFIX,
    K.HINT_TOKENS_PREFIX, K.THEME_PREFIX, K.TIME_PREFIX, K.LB_ME_PREFIX,
  ];
  const AGE_GC_MAX_DAYS = 60; // Road-to-9 Sprint 1 #3: prune per-day entries older than ~60 days

  // Age (in whole days) of a "YYYY-MM-DD" day key relative to `now` — the SAME local-calendar
  // definition SworblCore.dayKey() uses to mint these keys in the first place, so a key's
  // age here always matches the calendar day it names, no timezone drift between minting and
  // pruning. Malformed input (bad shape, or a shape-valid-but-impossible date like
  // "2026-02-30") returns null, NEVER a number — callers must treat null as "leave it alone",
  // not as "very old".
  function dayKeyAgeDays(dayStr, now) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayStr || '');
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const then = new Date(y, mo - 1, d);
    if (then.getFullYear() !== y || then.getMonth() !== mo - 1 || then.getDate() !== d) return null; // rejects e.g. 2026-02-30
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - then) / 86400000);
  }

  // Pure: given every current key name + `now` (+ optional maxDays override), returns the
  // subset that (a) matches one of DATED_PREFIXES and (b) names a day older than maxDays.
  // Never mutates, never touches storage — the caller (boot, near the existing malformed-key
  // cleanup) removes exactly this list. A key that doesn't parse as a dated-prefix key at all
  // (malformed date, garbled suffix) is simply excluded from the result — "can't tell how old
  // this is" must never be treated as "delete it".
  function agedDayKeys(allKeys, now, maxDays) {
    const cutoff = maxDays == null ? AGE_GC_MAX_DAYS : maxDays;
    const out = [];
    for (const k of (allKeys || [])) {
      for (const prefix of DATED_PREFIXES) {
        if (k.indexOf(prefix) !== 0) continue;
        const dayStr = k.slice(prefix.length).split('|')[0]; // strips LB_ME_PREFIX's optional '|puzzle'
        const age = dayKeyAgeDays(dayStr, now);
        if (age != null && age > cutoff) out.push(k);
        break; // prefixes are disjoint by construction — a key matches at most one
      }
    }
    return out;
  }

  const API = { LS, K, getInt, getJSON, set, setJSON, remove, keys,
    setBacking, dayKeyAgeDays, agedDayKeys, AGE_GC_MAX_DAYS };
  root.SworblStore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
