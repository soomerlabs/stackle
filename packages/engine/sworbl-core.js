// sworbl-core.js — pure, deterministic core logic. NO DOM, NO storage, NO `this`.
//
// Loaded two ways:
//   • live game + standalone export: <script src="./sworbl-core.js"> in <helmet>,
//     which sets window.SworblCore (synchronous, before first render).
//   • tests: require()/import in Node — module.exports mirrors the same API.
//
// ⚠ DETERMINISM CONTRACT: mulberry32 + hashSeed feed the daily board seed. Their
// output is frozen — every player must deal the identical board. tests/sworbl-core.test.js
// pins known values; never "optimize" these without updating that contract on purpose.
(function (root) {
  'use strict';

  // Seeded PRNG (mulberry32). Same seed → same stream, forever.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Stable string → 32-bit int hash (the daily/leaderboard seed derivation).
  function hashSeed(str) {
    let n = 0;
    for (const ch of String(str)) n = (n * 31 + ch.charCodeAt(0)) | 0;
    return n;
  }

  // Local calendar day key, e.g. "2026-07-19" (leading-zeroed, matches storage keys).
  function dayKey(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // Milliseconds remaining until the next local-calendar-day rollover (the SAME boundary
  // dayKey() uses) — feeds the home dock's H:MM:SS countdown + "next puzzle in" copy.
  // setHours(24,0,0,0) on a copy of `d` rolls to next-day local midnight; subtracting two
  // real Date objects (not calendar-field arithmetic) naturally absorbs a DST transition —
  // a 23-hour spring-forward day or a 25-hour fall-back day both come out correct. Never
  // negative (clamped at 0) so a caller can't underflow on a boundary tick.
  function msToNextDay(d) {
    const mid = new Date(d);
    mid.setHours(24, 0, 0, 0);
    return Math.max(0, mid - d);
  }

  // ---- Letter model (feeds the deterministic deal — part of the contract) --------
  // Scrabble-ish letter point values.
  const VALUES = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };
  // full letter bag (vowel ratio ~40%), a vowel-repair pool, and a commons-heavy on-ramp bag.
  const BAG = 'eeeeeeeeeeaaaaaaaaiiiiiiiiooooooonnnnnnrrrrrrttttttllllssssuuuuddddgggbbccmmppffhhvvwwyykjxqz';
  const VOWELS = 'aaeeeeiiou';
  const FRIENDLY = 'eeeeeaaaiioonnnrrrtttlllsssuhdcmpbg';

  // Fisher-Yates shuffle driven by a seeded rng() — the finite-bag deal.
  function shuffledBag(str, rng) {
    const a = str.split('');
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // The 'q' tile is really 'Qu' (Boggle's fix): spells as "qu", shows as "Qu".
  function expandLetter(l) { return l === 'q' ? 'qu' : l; }
  function dispLetter(l) { return l === 'q' ? 'Qu' : String(l).toUpperCase(); }

  // ---- Scoring primitives --------------------------------------------------------
  // A single tile's point value including merge boosts (a stacked twin doubles it).
  function letterVal(letter, boost) { return (VALUES[letter] || 1) * (1 + (boost || 0)); }
  // Length multiplier — long words pay much harder: 4=1.5x, 5=2.5x, 6=4x, 7+=6x.
  // (A v1 curve — 4=1x/5=2x/6=3x/7+=4x, gated by a second `v2` param — existed here for
  // parity with the retired classic mode. Every caller passed v2:true or omitted the param
  // entirely; nothing ever passed false. Dead-code sweep 2026-07-22: v1 arm removed.)
  function lenMult(n) {
    return n >= 7 ? 6 : n === 6 ? 4 : n === 5 ? 2.5 : n === 4 ? 1.5 : 1;
  }
  // Streak multiplier: every 3 consecutive words +0.5x, capped at 2x.
  function streakMult(streak) { return Math.min(2, 1 + Math.floor(streak / 3) * 0.5); }

  // ---- Public-name profanity gate -------------------------------------------------
  // Word-boundary matching, not naive substring — the classic Scunthorpe problem: a plain
  // `.includes(w)` flags "SCUNTHORPE" for containing "cunt" and "ESSEX" for containing "sex".
  // Fix: require a word boundary immediately BEFORE the term (regex `\b`), but NOT after —
  // so a term must START a word, matching "Scunthorpe" (cunt mid-word, preceded by 's', no
  // boundary -> not flagged) and "Essex" (sex mid-word, preceded by 's' -> not flagged) while
  // STILL catching the list's deliberately-truncated stems against their real variants
  // ("fag" still flags "faggot" — the boundary only needs to hold at the front; nothing
  // requires the stem to be the WHOLE word). The list itself is untouched — only the matcher.
  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function containsFoulTerm(name, foulList) {
    const s = String(name == null ? '' : name);
    return (foulList || []).some(w => new RegExp('\\b' + escapeRegExp(w), 'i').test(s));
  }

  const API = { mulberry32, hashSeed, dayKey, msToNextDay,
    VALUES, BAG, VOWELS, FRIENDLY, shuffledBag,
    expandLetter, dispLetter, letterVal, lenMult, streakMult, containsFoulTerm };
  root.SworblCore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
