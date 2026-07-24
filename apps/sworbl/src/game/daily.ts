// The DAILY DEAL — the exact recipe the web app's newGame runs (pinned by the
// engine's round-lifecycle test): parseEntry → two-pass clue seed → letter queue.
// Determinism contract: same dayKey → byte-identical board on every client.
import engine from '@sworbl/engine';
import { COLS, ROWS, CLUE_COUNT, TileT } from './types';
import { tileColorFor } from './palette';
import { loadRemoteEntry } from '@/net/dailies-remote';

// content ships with the repo (root dailies.json — same file the frozen web app
// and the authoring pipeline use; Metro resolves across the workspace)
const dailies = require('../../../../dailies.json');

export interface DailyDeal {
  dayKey: string;
  sworb: string;
  definition: string;
  hint: string; // the day's riddle (owner book) — pre-guess flavor
  archetype: string | null; // today's twist — REVEALED ONLY POST-ROUND (owner:
  // pre-round diagnosis IS the game; the tag teaches the vocabulary after)
  clues: string[]; // the 6 realized clue words actually stamped on this board
  poolExtras: string[]; // authored theme words the seed didn't use — bonus waves
  tiles: TileT[];
  nextLetter: () => string; // deterministic finite-bag refill dealer
  getQueueIdx: () => number; // dealer position — persisted so a resumed run
  setQueueIdx: (i: number) => void; // continues the SAME letter stream
}

let nextId = 1;

// DEV-ONLY day override: playtest any authored day (archetype week etc.)
// without touching the device clock. Hard-fenced — release builds can't set
// or read it.
// __DEV__ is a bundler global — absent under the Node test runner
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const DEV_DAY_KEY = 'sworbl_rn_dev_day';
let devDayMem: string | null | undefined; // memory-first (see dev-flags.ts)

export function getDevDay(): string | null {
  if (!IS_DEV) return null;
  if (devDayMem === undefined) {
    const v = engine.store.getJSON(DEV_DAY_KEY, null) as string | null;
    devDayMem = typeof v === 'string' && v in dailies ? v : null;
  }
  return devDayMem;
}

export function setDevDay(day: string | null): void {
  if (!IS_DEV) return;
  devDayMem = day;
  if (day) engine.store.setJSON(DEV_DAY_KEY, day);
  else engine.store.remove(DEV_DAY_KEY);
}

export function authoredDays(): { day: string; sworb: string; archetype: string | null }[] {
  return Object.keys(dailies)
    .sort()
    .map((day) => ({
      day,
      sworb: dailies[day].sworb,
      archetype: typeof dailies[day].archetype === 'string' ? dailies[day].archetype : null,
    }));
}

// BONUS WAVES (owner): catch ALL current clues with time left → 3 more from
// the authored pool join the hunt. PURE function of the found set — no new
// state to persist, so kills/restores/resumes derive the same answer.
export function activeClues(core: string[], extras: string[], found: string[]): string[] {
  let act = [...core];
  let i = 0;
  while (i < extras.length && act.every((c) => found.includes(c))) {
    act = [...act, ...extras.slice(i, i + 3)];
    i += 3;
  }
  return act;
}

// REGULAR MODE (modes-spec): every round after the first deals a FRESH
// board — same day, same word, same remaining clues, new letter layout.
// round 1 keeps the day's original seed (continuity with hard + history).
export interface DealOpts {
  round?: number; // 1-based; >1 varies the letter queue + clue placement
  excludeClues?: string[]; // the day's already-found clues never re-seed
}

export function dealDaily(now = new Date(), opts: DealOpts = {}): DailyDeal | null {
  const dayKey = getDevDay() ?? engine.core.dayKey(now);
  // SERVER-DRIVEN DAILIES (owner): a cached remote spec WINS for its day;
  // the bundle is the offline fallback — parseEntry sees one merged map
  const remote = loadRemoteEntry(dayKey);
  const source = remote ? { ...dailies, [dayKey]: remote } : dailies;
  const entry = engine.daily.parseEntry(source, dayKey);
  if (!entry) return null;

  const round = Math.max(1, opts.round ?? 1);
  const rTag = round > 1 ? '|r' + round : '';
  const exclude = new Set(opts.excludeClues ?? []);
  const clueSource = entry.themeWords.filter((w: string) => !exclude.has(w));

  // two-pass clue seed, seeded from the day+round (web newGame's exact call)
  const rngFactory = () => engine.core.mulberry32(engine.core.hashSeed(dayKey + rTag + '|sworb'));
  const cand = engine.seed.seedClueLettersTwoPass({
    clues: clueSource.length ? clueSource : entry.themeWords,
    cols: COLS,
    rows: ROWS,
    rngFactory,
    target: CLUE_COUNT,
  });

  // deterministic letter queue: fills the non-clue cells at deal time, then
  // feeds refills for the whole round (FRIENDLY on-ramp + 3 full bags)
  const qr = engine.core.mulberry32(engine.core.hashSeed(dayKey + rTag) ^ 0x51ac1e);
  const queue: string[] = engine.core
    .shuffledBag(engine.core.FRIENDLY, qr)
    .concat(
      engine.core.shuffledBag(engine.core.BAG, qr),
      engine.core.shuffledBag(engine.core.BAG, qr),
      engine.core.shuffledBag(engine.core.BAG, qr)
    );
  let qi = 0;
  const nextLetter = () => queue[qi++ % queue.length];

  // the FULL 5×6 board: stamped clue letters where the two-pass seed placed
  // them, queue letters everywhere else (the web newGame's fill step — its
  // omission shipped an 18-tile board; pinned by tests/daily.test.ts)
  const tiles: TileT[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const letter: string = cand.letters[row + ',' + col] ?? nextLetter();
      const id = nextId++;
      tiles.push({ id, letter, col, row, ci: tileColorFor(letter, id), spawnDrop: 0, bornAt: Date.now() });
    }
  }

  return {
    dayKey,
    sworb: entry.sworb,
    definition: entry.definition || '',
    hint: entry.hint || '',
    archetype: typeof entry.archetype === 'string' ? entry.archetype : null,
    clues: cand.realized,
    poolExtras: entry.themeWords.filter((w: string) => !cand.realized.includes(w)),
    tiles,
    nextLetter,
    getQueueIdx: () => qi,
    setQueueIdx: (i: number) => {
      qi = i;
    },
  };
}

// PRACTICE / DUEL BOARDS (modes-spec "ghost duels"): a pure seed-string
// deal — no day entry, no sworb, no clues; the board is the whole game.
// Deterministic: the same seed is the same board for every player, which
// is the entire premise of per-seed leaderboards and ghost races.
export function dealPractice(seed: string): DailyDeal {
  const qr = engine.core.mulberry32(engine.core.hashSeed('storm|' + seed) ^ 0x51ac1e);
  // INTENSITY IS IN THE SEED (owner ladder): hurricanes get no FRIENDLY
  // on-ramp — pure bag, same for every player on this board
  // (require: deliberate lazy load)
  const { stormIntensity } = require('./storm-seeds') as typeof import('./storm-seeds');
  const onRamp = stormIntensity(seed).friendly ? engine.core.FRIENDLY : engine.core.BAG;
  const queue: string[] = engine.core
    .shuffledBag(onRamp, qr)
    .concat(
      engine.core.shuffledBag(engine.core.BAG, qr),
      engine.core.shuffledBag(engine.core.BAG, qr),
      engine.core.shuffledBag(engine.core.BAG, qr)
    );
  let qi = 0;
  const nextLetter = () => queue[qi++ % queue.length];
  const tiles: TileT[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const letter = nextLetter();
      const id = nextId++;
      tiles.push({ id, letter, col, row, ci: tileColorFor(letter, id), spawnDrop: 0, bornAt: Date.now() });
    }
  }
  return {
    dayKey: 'storm:' + seed, // namespaced — never collides with a real day
    sworb: '',
    definition: '',
    hint: '',
    archetype: null,
    clues: [],
    poolExtras: [],
    tiles,
    nextLetter,
    getQueueIdx: () => qi,
    setQueueIdx: (i: number) => {
      qi = i;
    },
  };
}

export function makeTile(letter: string, col: number, row: number, spawnDrop: number): TileT {
  const id = nextId++;
  return { id, letter, col, row, ci: tileColorFor(letter, id), spawnDrop, bornAt: Date.now() };
}

// a restored run carries tile ids from a previous process — the fresh counter
// must clear them or new refills collide with restored ids (React keys, trace identity)
export function bumpNextId(minExclusive: number): void {
  if (nextId <= minExclusive) nextId = minExclusive + 1;
}

// airborne window for a spawned tile (GameTile: spawnDrop*40ms stagger + spring)
export function landsInMs(t: TileT): number {
  return t.spawnDrop ? t.spawnDrop * 40 + 380 : 0;
}

// collapse columns and rain in refills from the queue — returns NEW arrays;
// `added` is the incoming rain (the only tiles a clue re-stamp may touch)
export function settle(
  tiles: TileT[],
  nextLetter: () => string
): { tiles: TileT[]; added: TileT[] } {
  const out: TileT[] = [];
  const added: TileT[] = [];
  for (let c = 0; c < COLS; c++) {
    const colTiles = tiles.filter((t) => t.col === c).sort((a, b) => b.row - a.row);
    let row = ROWS - 1;
    for (const t of colTiles) {
      out.push(t.row === row ? t : { ...t, row });
      row--;
    }
    let drop = 1;
    while (row >= 0) {
      const nt = makeTile(nextLetter(), c, row, drop);
      out.push(nt);
      added.push(nt);
      row--;
      drop++;
    }
  }
  return { tiles: out, added };
}

// RE-STAMP (web _placeCluesInRefill, ported): as the board refills, place any
// un-found clue that play has BROKEN into the incoming tiles — never touching
// settled tiles. Deterministic per (day, refill position); re-stamped tiles are
// recolored to their letter's own family (no color "tell"). A clue that doesn't
// fit this refill is restored on a later one. Returns the tiles array with the
// changes applied (new objects — no mutation).
export function restampBroken(args: {
  deal: DailyDeal;
  tiles: TileT[]; // post-settle full board
  added: TileT[]; // this refill's incoming tiles
  unfound: string[]; // clues minus found minus playedThisRun (the roundWords guard)
  caught?: string[]; // DO-NOT-SEED (owner): clues already banked — if a refill
  // organically re-forms one THROUGH a fresh tile, break the path
}): TileT[] {
  const { deal, tiles, added, unfound, caught = [] } = args;
  if ((!unfound.length && !caught.length) || !added.length) return tiles;
  const addedIds = new Set(added.map((t) => t.id));
  const survivors = tiles.filter((t) => !addedIds.has(t.id));
  const isFindable = (w: string) =>
    !!engine.solver.findWord(survivors, { word: w, expand: engine.core.expandLetter, diag: true });
  const rng = engine.core.mulberry32(
    (engine.core.hashSeed(deal.dayKey + '|refill') ^ (deal.getQueueIdx() * 2654435761)) >>> 0
  );
  const changes: { r: number; c: number; letter: string }[] = unfound.length
    ? engine.seed.reseedBroken({
        tiles: added,
        unfound,
        isFindable,
        rng,
        reserve: new Set(),
      })
    : [];
  const byCell = new Map(changes.map((ch) => [ch.r + ',' + ch.c, ch.letter]));
  let out = tiles.map((t) => {
    if (!addedIds.has(t.id)) return t;
    const letter = byCell.get(t.row + ',' + t.col);
    if (!letter) return t;
    return { ...t, letter, ci: tileColorFor(letter, t.id) };
  });
  // the DO-NOT-SEED breaker: a banked clue must not quietly rebuild itself on
  // a refill. Only FRESH tiles may be altered (never the stable board), and
  // never a cell the unfound re-stamp just claimed.
  const stamped = new Set(changes.map((ch) => ch.r + ',' + ch.c));
  const ALT = 'bcdfghklmnprst';
  for (const w of caught) {
    for (let guard = 0; guard < 4; guard++) {
      const path = engine.solver.findWord(out, {
        word: w, expand: engine.core.expandLetter, diag: true,
      }) as number[] | null;
      if (!path) break;
      const victim = out.find(
        (t) => path.includes(t.id) && addedIds.has(t.id) && !stamped.has(t.row + ',' + t.col)
      );
      if (!victim) break; // path lives on stable tiles — the board is honest, leave it
      const alt = ALT[Math.floor(rng() * ALT.length)];
      if (alt === victim.letter) continue;
      out = out.map((t) =>
        t.id === victim.id ? { ...t, letter: alt, ci: tileColorFor(alt, t.id) } : t
      );
    }
  }
  return out;
}
