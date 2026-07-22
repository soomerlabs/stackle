// tests/seed-stress.js — STANDALONE stress harness (NOT in npm test). Proves the two-pass
// board seeder is robust for the AI-generated daily regime before content is generated at scale.
//
//   node tests/seed-stress.js [N]      (default N = 500 synthetic pools per scenario)
//
// For each scenario it builds N seeded synthetic pools (reproducible: pool i's words AND its
// board rng both derive from a fixed base seed, so a rerun is bit-identical), runs
// seedClueLettersTwoPass(target 6, 5x6) on each, and reports: exactly-6 success rate, fallback
// rate, the distribution of realized counts, the worst failing pools, and timing (ms/pool).
//
// Scenarios:
//   • uniform-4to6   — pool words drawn UNIFORMLY from the 4-6 dictionary (freq-weighted, so
//                      ~57% land at 6 letters: the pessimistic "raw draw" end of the regime).
//   • content-like   — a shorter length mix that models real themed content (weighted to 4-5,
//                      a minority of 6) — what hand/AI-authored theme pools actually look like.
//   • all-4 / all-5 / all-6 — single-length pools; all-6 is the hardest packing case
//                      (6x6 = 36 letters > 30 cells, so crossings are REQUIRED).
//   • sixSweep       — K six-letter words + (12-K) four-letter words, K = 0..12, to find the
//                      max number of 6-letter words that still pack reliably (generation-prompt
//                      constraint: "at most K six-letter words per pool").
'use strict';
const fs = require('fs');
const path = require('path');
const Core = require('../sworble-core.js');
const Seed = require('../sworble-seed.js');

const root = path.join(__dirname, '..');
const N = Math.max(1, parseInt(process.argv[2], 10) || 500);
const COLS = 5, ROWS = 6, TARGET = 6, POOL = 12;

// ---- dictionary, bucketed by length -------------------------------------------------
const allWords = fs.readFileSync(path.join(root, 'dictionary.txt'), 'utf8')
  .split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => /^[a-z]+$/.test(w));
const byLen = { 4: [], 5: [], 6: [] };
const pool46 = [];
for (const w of allWords) { if (w.length >= 4 && w.length <= 6) { byLen[w.length].push(w); pool46.push(w); } }

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

// A pool word A that is a strict prefix of pool word B breaks clueFor's longest-match banking —
// the content guardrail forbids it, so synthetic pools that model the regime must exclude it too
// (drawPool's `words.some(...)` check below inlines this same prefix-pair test per candidate).
//
// Draw `size` DISTINCT words, each length chosen by lenOf(rng), rejecting a draw that repeats a
// word or introduces a prefix-pair. rng is seeded, so the pool is reproducible.
function drawPool(size, lenOf, rng) {
  const words = [], seen = new Set();
  let guard = 0;
  while (words.length < size && guard++ < size * 200) {
    const len = lenOf(rng);
    const w = pick(byLen[len], rng);
    if (seen.has(w)) continue;
    if (words.some(x => (x.length > w.length && x.indexOf(w) === 0) || (w.length > x.length && w.indexOf(x) === 0))) continue;
    seen.add(w); words.push(w);
  }
  return words;
}

// length-picker factories
const uniform46 = () => (rng) => { const r = rng() * pool46.length; return r < byLen[4].length ? 4 : r < byLen[4].length + byLen[5].length ? 5 : 6; };
const weighted = (w4, w5, w6) => { const t = w4 + w5 + w6; return (rng) => { const r = rng() * t; return r < w4 ? 4 : r < w4 + w5 ? 5 : 6; }; };
const fixed = (n) => () => n;

// ---- run one scenario ---------------------------------------------------------------
function runScenario(name, lenOf, count) {
  const dist = {};           // realized-count -> pools
  let success = 0, fallback = 0;
  const worst = [];          // pools that realized < TARGET (kept small)
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < count; i++) {
    // pool words + board rng both derive from one reproducible seed string
    const seedStr = 'stress|' + name + '|' + i;
    const pool = drawPool(POOL, lenOf, Core.mulberry32(Core.hashSeed(seedStr + '|draw')));
    const rngFactory = () => Core.mulberry32(Core.hashSeed(seedStr + '|board'));
    const out = Seed.seedClueLettersTwoPass({ clues: pool, cols: COLS, rows: ROWS, rngFactory, target: TARGET });
    const r = out.realized.length;
    dist[r] = (dist[r] || 0) + 1;
    if (!out.usedFallback && r === TARGET) success++; else { fallback++; if (worst.length < 8) worst.push({ pool, realized: r }); }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const rate = (success / count) * 100;
  const distStr = Object.keys(dist).map(Number).sort((a, b) => a - b).map(k => k + ':' + dist[k]).join('  ');
  console.log('\n### ' + name + '  (n=' + count + ')');
  console.log('  exactly-6 success : ' + success + '/' + count + '  = ' + rate.toFixed(2) + '%');
  console.log('  fallback (thin)   : ' + fallback + '/' + count + '  = ' + (100 - rate).toFixed(2) + '%');
  console.log('  realized-count dist: ' + distStr);
  console.log('  timing            : ' + (ms / count).toFixed(3) + ' ms/pool  (' + ms.toFixed(0) + ' ms total)');
  if (worst.length) {
    console.log('  worst cases (realized<' + TARGET + '):');
    for (const w of worst) console.log('    [' + w.realized + '] ' + w.pool.join(' '));
  }
  return { name, count, success, rate, fallback };
}

console.log('seed-stress: ' + N + ' pools/scenario, target ' + TARGET + ' on ' + COLS + 'x' + ROWS +
  ' (30 cells). dict 4-6 buckets: 4=' + byLen[4].length + ' 5=' + byLen[5].length + ' 6=' + byLen[6].length);

const results = [];
results.push(runScenario('uniform-4to6', uniform46(), N));
results.push(runScenario('content-like(4:5:6 = 40:40:20)', weighted(40, 40, 20), N));
results.push(runScenario('all-4', fixed(4), N));
results.push(runScenario('all-5', fixed(5), N));
results.push(runScenario('all-6 (hardest: 36>30)', fixed(6), N));

// ---- 6-letter feasibility sweep -----------------------------------------------------
// K six-letter words + (POOL-K) four-letter words. Find the largest K whose pool still locks 6.
console.log('\n### sixSweep — K six-letter words + ' + (POOL) + '-K four-letter words (n=' + N + ' each)');
console.log('  K : success%  (max reliable K becomes the "at most K 6-letter words" prompt rule)');
const sweep = [];
for (let K = 0; K <= POOL; K++) {
  let success = 0;
  for (let i = 0; i < N; i++) {
    const seedStr = 'stress|six' + K + '|' + i;
    // build pool: K sixes then (POOL-K) fours, distinct + no prefix-pairs
    const rng = Core.mulberry32(Core.hashSeed(seedStr + '|draw'));
    const words = [], seen = new Set();
    let guard = 0;
    while (words.length < POOL && guard++ < POOL * 300) {
      const len = words.length < K ? 6 : 4;
      const w = pick(byLen[len], rng);
      if (seen.has(w)) continue;
      if (words.some(x => (x.length > w.length && x.indexOf(w) === 0) || (w.length > x.length && w.indexOf(x) === 0))) continue;
      seen.add(w); words.push(w);
    }
    const rngFactory = () => Core.mulberry32(Core.hashSeed(seedStr + '|board'));
    const out = Seed.seedClueLettersTwoPass({ clues: words, cols: COLS, rows: ROWS, rngFactory, target: TARGET });
    if (!out.usedFallback && out.realized.length === TARGET) success++;
  }
  const rate = (success / N) * 100;
  sweep.push({ K, rate });
  console.log('  ' + String(K).padStart(2) + ' : ' + rate.toFixed(2) + '%');
}

// ---- summary ------------------------------------------------------------------------
console.log('\n=== SUMMARY ===');
for (const r of results) console.log('  ' + r.name.padEnd(34) + ' ' + r.rate.toFixed(2) + '% exactly-6');
const maxReliable = sweep.filter(s => s.rate >= 99.5).reduce((m, s) => Math.max(m, s.K), -1);
console.log('  sixSweep: max K with >=99.5% success = ' + (maxReliable < 0 ? 'none (even K=0 below bar)' : maxReliable));
