// The DAILY DEAL — the exact recipe the web app's newGame runs (pinned by the
// engine's round-lifecycle test): parseEntry → two-pass clue seed → letter queue.
// Determinism contract: same dayKey → byte-identical board on every client.
import engine from '@sworbl/engine';
import { COLS, ROWS, CLUE_COUNT, TileT } from './types';
import { tileColorFor } from './palette';

// content ships with the repo (root dailies.json — same file the frozen web app
// and the authoring pipeline use; Metro resolves across the workspace)
const dailies = require('../../../../dailies.json');

export interface DailyDeal {
  dayKey: string;
  sworb: string;
  definition: string;
  clues: string[]; // the 6 realized clue words actually stamped on this board
  tiles: TileT[];
  nextLetter: () => string; // deterministic finite-bag refill dealer
}

let nextId = 1;

export function dealDaily(now = new Date()): DailyDeal | null {
  const dayKey = engine.core.dayKey(now);
  const entry = engine.daily.parseEntry(dailies, dayKey);
  if (!entry) return null;

  // two-pass clue seed, seeded from the day (web newGame's exact call)
  const rngFactory = () => engine.core.mulberry32(engine.core.hashSeed(dayKey + '|sworb'));
  const cand = engine.seed.seedClueLettersTwoPass({
    clues: entry.themeWords,
    cols: COLS,
    rows: ROWS,
    rngFactory,
    target: CLUE_COUNT,
  });

  const tiles: TileT[] = Object.keys(cand.letters).map((k: string) => {
    const [row, col] = k.split(',').map(Number);
    const letter = cand.letters[k];
    const id = nextId++;
    return { id, letter, col, row, ci: tileColorFor(letter, id), spawnDrop: 0, bornAt: Date.now() };
  });

  // deterministic letter queue for refills (FRIENDLY on-ramp + 3 full bags)
  const qr = engine.core.mulberry32(engine.core.hashSeed(dayKey) ^ 0x51ac1e);
  const queue: string[] = engine.core
    .shuffledBag(engine.core.FRIENDLY, qr)
    .concat(
      engine.core.shuffledBag(engine.core.BAG, qr),
      engine.core.shuffledBag(engine.core.BAG, qr),
      engine.core.shuffledBag(engine.core.BAG, qr)
    );
  let qi = 0;
  const nextLetter = () => queue[qi++ % queue.length];

  return {
    dayKey,
    sworb: entry.sworb,
    definition: entry.definition || '',
    clues: cand.realized,
    tiles,
    nextLetter,
  };
}

export function makeTile(letter: string, col: number, row: number, spawnDrop: number): TileT {
  const id = nextId++;
  return { id, letter, col, row, ci: tileColorFor(letter, id), spawnDrop, bornAt: Date.now() };
}

// airborne window for a spawned tile (GameTile: spawnDrop*40ms stagger + spring)
export function landsInMs(t: TileT): number {
  return t.spawnDrop ? t.spawnDrop * 40 + 380 : 0;
}

// collapse columns and rain in refills from the queue — returns a NEW array
export function settle(tiles: TileT[], nextLetter: () => string): TileT[] {
  const out: TileT[] = [];
  for (let c = 0; c < COLS; c++) {
    const colTiles = tiles.filter((t) => t.col === c).sort((a, b) => b.row - a.row);
    let row = ROWS - 1;
    for (const t of colTiles) {
      out.push(t.row === row ? t : { ...t, row });
      row--;
    }
    let drop = 1;
    while (row >= 0) {
      out.push(makeTile(nextLetter(), c, row, drop));
      row--;
      drop++;
    }
  }
  return out;
}
