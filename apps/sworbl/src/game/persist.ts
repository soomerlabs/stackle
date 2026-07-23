// Day-state persistence — the engine's key registry (K) + typed helpers, the
// same keys the web app writes (compatibility contract; shapes match the
// SWORB_PREFIX/FOUND_PREFIX/DONE_PREFIX comments in sworbl-store.js).
// Boot routing goes through engine.flow.startDailyRoute — consumed is checked
// FIRST, always (the zombie-run bug's 3-layer lesson, inherited as law).
import engine from '@sworbl/engine';

const { K } = engine.store;

export interface SworbState {
  guessesUsed: number;
  solved: boolean;
  bonus: number;
}

export interface BestWord {
  word: string;
  pts: number;
}

export interface DayState {
  route: 'consumed' | 'resume' | 'finale' | 'fresh';
  score: number;
  found: string[];
  sworb: SworbState | null;
  run: RunSnap | null;
  bestWords: BestWord[]; // top-5 by points — the home superlatives
}

export function loadDay(dayKey: string): DayState {
  const done = !!engine.store.getInt(K.DONE_PREFIX + dayKey, 0);
  const run = done ? null : loadRun(dayKey); // consumed-FIRST: a locked day never resumes
  const route = engine.flow.startDailyRoute({
    finale: false,
    onHome: false,
    consumed: done,
    dailyLive: !!run && run.phase === 'live',
    over: false,
    hasTiles: !!run && run.tiles.length > 0,
    finalePending: !!run && run.phase === 'finale',
  }) as DayState['route'];
  return {
    route,
    score: engine.store.getInt(K.DAILY_PREFIX + dayKey, 0),
    found: engine.store.getJSON(K.FOUND_PREFIX + dayKey, []) as string[],
    sworb: engine.store.getJSON(K.SWORB_PREFIX + dayKey, null) as SworbState | null,
    run,
    bestWords: (engine.store.getJSON(K.SEVEN_PREFIX + dayKey, { words: [] }) as { words: BestWord[] })
      .words,
  };
}

// live progress — cheap synchronous writes on change (MMKV/localStorage both sync)
export function saveProgress(dayKey: string, score: number, found: string[]): void {
  engine.store.set(K.DAILY_PREFIX + dayKey, score);
  engine.store.setJSON(K.FOUND_PREFIX + dayKey, found);
}

// the day ends exactly once: result + the DONE lock, in that order (a crash
// between the two leaves the day unlocked, never a locked day with no result)
export function finishDay(
  dayKey: string,
  score: number,
  found: string[],
  sworb: SworbState,
  bestWords: BestWord[] = []
): void {
  engine.store.set(K.DAILY_PREFIX + dayKey, score);
  engine.store.setJSON(K.FOUND_PREFIX + dayKey, found);
  engine.store.setJSON(K.SWORB_PREFIX + dayKey, sworb);
  // top-5 words by points (SEVEN_PREFIX carries the day's superlatives)
  engine.store.setJSON(K.SEVEN_PREFIX + dayKey, {
    words: [...bestWords].sort((a, b) => b.pts - a.pts).slice(0, 5),
  });
  engine.store.set(K.DONE_PREFIX + dayKey, 1);
  clearRun(dayKey);
}

// ---- mid-run snapshot (RUN_PREFIX). RN's own versioned shape — the web's
// serializeRun carries web-only state (rng counters, streak/mine fields); the
// RULES we inherit are the engine's: remainingSecs(roundSecs, boardElapsedMs)
// derives the clock, and a resumed run RE-ARMS the count-in (flow.resumeAction).
// Snapshots are device-local; web and RN never exchange them.

const RN_RUN_V = 1;

export interface RunTileSnap {
  id: number;
  letter: string;
  col: number;
  row: number;
  ci: number;
}

export interface RunSnap {
  client: 'rn';
  v: number;
  day: string;
  phase: 'live' | 'finale';
  tiles: RunTileSnap[];
  queueIdx: number;
  score: number;
  found: string[];
  boardElapsedMs: number;
  earnedMs: number; // time-fuel bank — rides the snapshot so resumes keep it
  // finale-phase carry (empty while live):
  guessesUsed: number;
  rows: { letters: string[]; colors: string[] }[];
  slots: string[];
  colors: (string | null)[];
}

export function saveRun(snap: RunSnap): void {
  engine.store.setJSON(K.RUN_PREFIX + snap.day, snap);
}

export function loadRun(dayKey: string): RunSnap | null {
  const s = engine.store.getJSON(K.RUN_PREFIX + dayKey, null) as RunSnap | null;
  if (!s || s.client !== 'rn' || s.v !== RN_RUN_V || s.day !== dayKey) return null;
  if (!Array.isArray(s.tiles) || !s.tiles.length) return null;
  if (s.phase !== 'live' && s.phase !== 'finale') return null;
  return { ...s, earnedMs: Number(s.earnedMs) || 0 };
}

export function clearRun(dayKey: string): void {
  engine.store.remove(K.RUN_PREFIX + dayKey);
}
