// sworble-store.js — persistence layer: the ONE place every storage key is named,
// plus the safe localStorage shim and typed get/set helpers.
//
// Loaded via <script src> in <helmet> (sets window.SworbleStore); mirrored to
// module.exports for tests. The game does `const LS = SworbleStore.LS, K = SworbleStore.K;`.
//
// ⚠ Key names are a COMPATIBILITY CONTRACT — renaming one orphans real player data.
// The Jul-2026 clean break (worddrop_* → sworble_*) deliberately spared `worddrop_muted`.
(function (root) {
  'use strict';

  // storage-blocked contexts (zip/mail/Drive previews, some private modes) throw on ANY
  // localStorage touch — fall back to in-memory so the game still runs.
  const LS = (() => {
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

  // Every key in one place. PREFIX entries are concatenated with a day-key or board id.
  const K = {
    BEST: 'sworble_best',
    OPTS: 'sworble_opts',
    NAME: 'sworble_name',
    SINCE: 'sworble_since', // first-seen timestamp -> "player since <Mon YYYY>" on the profile eyebrow
    BESTWORD: 'sworble_bestword',
    WORDS_TOTAL: 'sworble_words_total',
    SEEN_HOWTO: 'sworble_seen_howto',
    SEEN_MINES: 'sworble_seen_mines',
    SEEN_STACKHINT: 'sworble_seen_stackhint',
    SEEN_BOMBHINT: 'sworble_seen_bombhint',
    TUT_DONE: 'sworble_tut_done',
    AUDIO_CLAIM: 'sworble_audio_claim',
    MUTED: 'worddrop_muted', // legacy name kept ON PURPOSE (the rename spared it)
    // per-day / per-board PREFIXES — `K.DAILY_PREFIX + dayKey`, `K.LB_ME_PREFIX + boardId`:
    DAILY_PREFIX: 'sworble_daily_',
    ATT_PREFIX: 'sworble_att_',
    SEVEN_PREFIX: 'sworble_seven_',
    RUNS_PREFIX: 'sworble_runs_',
    PUZZLE_BEST_PREFIX: 'sworble_puzzle_best_',
    PUZZLE_PAR_PREFIX: 'sworble_puzzle_par_',
    TARGETS_PREFIX: 'sworble_targets_',
    FOUND_PREFIX: 'sworble_found_',
    LB_ME_PREFIX: 'sworble_lb_me_',
    DONE_PREFIX: 'sworble_done_', // one run per day: set when a daily run ends, locks the daily
    RUN_PREFIX: 'sworble_run_', // live-run snapshot (mid-run save/resume) — cleared when the run ends
    SWORB_PREFIX: 'sworble_sworb_', // per-day sworb state: { guessesUsed, solved, correct, bonus, found:[] }
    MIGRATED_STACKLE: 'sworble_migrated_stackle', // one-time flag: stackle_*-era data has been copied over
    PLAYER_ID: 'sworble_player_id', // stable per-device UUID sent with Soomer submits (claimable by an account later)
    PENDING_SUBMITS: 'sworble_pending_submits', // SworbleApi's durable submit outbox — value must match QUEUE_KEY in sworble-net.js
    EFF_PREFIX: 'sworble_eff_', // per-day efficiency (your best-7 vs the bot's optimal) → season IQ
    TIME_PREFIX: 'sworble_time_', // per-day seconds actively on the board (freezes when you leave the board)
  };

  // Typed, exception-safe accessors (optional sugar over LS + parse/stringify).
  function getStr(k, d) { try { const v = LS.getItem(k); return v == null ? (d == null ? null : d) : v; } catch (e) { return d == null ? null : d; } }
  function getInt(k, d) { try { return (parseInt(LS.getItem(k) || '', 10) || 0) || (d || 0); } catch (e) { return d || 0; } }
  function getJSON(k, d) { try { const v = LS.getItem(k); return v == null ? (d == null ? null : d) : JSON.parse(v); } catch (e) { return d == null ? null : d; } }
  function set(k, v) { try { LS.setItem(k, String(v)); } catch (e) {} }
  function setJSON(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function remove(k) { try { LS.removeItem(k); } catch (e) {} }
  function keys() { const out = []; try { for (let i = 0; i < LS.length; i++) { const kk = LS.key(i); if (kk) out.push(kk); } } catch (e) {} return out; }

  // One-time heal for the stackle_* -> sworble_* rename: the Jul-2026 clean break orphaned
  // returning players' progress (name, best, streaks all "wiped"). Copies every stackle_*
  // value to its sworble_* twin — but ONLY where the twin is absent, so progress made since
  // the rename always wins. Originals stay in place (rollback-safe, a few KB at most).
  // Returns the number of keys copied; 0 on any repeat run (flag-guarded).
  function migrateLegacy() {
    try {
      if (LS.getItem(K.MIGRATED_STACKLE)) return 0;
      const legacy = [];
      for (let i = 0; i < LS.length; i++) {
        const k = LS.key(i);
        if (k && k.indexOf('stackle_') === 0) legacy.push(k);
      }
      let moved = 0;
      for (const k of legacy) {
        const target = 'sworble_' + k.slice(8);
        if (LS.getItem(target) == null) {
          const v = LS.getItem(k);
          if (v != null) { LS.setItem(target, v); moved++; }
        }
      }
      LS.setItem(K.MIGRATED_STACKLE, '1');
      return moved;
    } catch (e) { return 0; }
  }

  const API = { LS, K, getStr, getInt, getJSON, set, setJSON, remove, keys, migrateLegacy };
  root.SworbleStore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
