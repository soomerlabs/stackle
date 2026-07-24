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
  t?: number; // ms from round start — the ghost replay's heartbeat
}

export interface DayRounds {
  played: number; // rounds finished today
  bestRound: number; // the single best round's word points (THE score base)
}

export interface DayState {
  route: 'consumed' | 'resume' | 'finale' | 'fresh';
  score: number;
  found: string[];
  sworb: SworbState | null;
  run: RunSnap | null;
  bestWords: BestWord[]; // top-5 by points — the home superlatives
  rounds: DayRounds; // replayable rounds (modes-spec: ONE mode now)
}

const ROUNDS_KEY = 'sworbl_rn_rounds_'; // + dayKey
const MODE_KEY = 'sworbl_rn_mode_'; // legacy hard-mode fork key — wiped only

export function loadRounds(dayKey: string): DayRounds {
  const v = engine.store.getJSON(ROUNDS_KEY + dayKey, null) as DayRounds | null;
  return v && typeof v.played === 'number'
    ? { played: v.played, bestRound: Number(v.bestRound) || 0 }
    : { played: 0, bestRound: 0 };
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
    rounds: loadRounds(dayKey),
  };
}

// REGULAR MODE (modes-spec, owner rulings): a round ENDS but the day does
// NOT — clues accumulate, words merge, and the day's score derives as
// bestRound + solve bonus. Never sets the DONE lock (that's hard's law).
// Returns the derived day score.
export function finishRound(
  dayKey: string,
  roundScore: number,
  found: string[],
  roundWords: BestWord[]
): number {
  const r = loadRounds(dayKey);
  const rounds: DayRounds = {
    played: r.played + 1,
    bestRound: Math.max(r.bestRound, roundScore),
  };
  engine.store.setJSON(ROUNDS_KEY + dayKey, rounds);
  engine.store.setJSON(K.FOUND_PREFIX + dayKey, found);
  // merge the round's words into the day's full list (best pts per word)
  const all = new Map<string, number>();
  for (const w of loadDayWords(dayKey)) all.set(w.word, w.pts);
  for (const w of roundWords) all.set(w.word, Math.max(all.get(w.word) ?? 0, w.pts));
  const merged: BestWord[] = [...all.entries()].map(([word, pts]) => ({ word, pts }));
  engine.store.setJSON(DAY_WORDS_KEY + dayKey, merged);
  engine.store.setJSON(K.SEVEN_PREFIX + dayKey, {
    words: [...merged].sort((a, b) => b.pts - a.pts).slice(0, 5),
  });
  const sworb = engine.store.getJSON(K.SWORB_PREFIX + dayKey, null) as SworbState | null;
  const dayScore = rounds.bestRound + (sworb?.solved ? sworb.bonus : 0);
  engine.store.set(K.DAILY_PREFIX + dayKey, dayScore);
  clearRun(dayKey);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./stats').recordDay(dayKey, dayScore, merged.length, merged);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./lexicon').recordWords(roundWords);
  return dayScore;
}

// the sworb outcome lands (solve or final miss) OUTSIDE a round's end —
// re-derives the day score with the bonus locked in. Returns it.
export function recordSworb(dayKey: string, sworb: SworbState): number {
  engine.store.setJSON(K.SWORB_PREFIX + dayKey, sworb);
  const rounds = loadRounds(dayKey);
  const dayScore = rounds.bestRound + (sworb.solved ? sworb.bonus : 0);
  engine.store.set(K.DAILY_PREFIX + dayKey, dayScore);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./stats').recordDay(dayKey, dayScore, loadDayWords(dayKey).length, loadDayWords(dayKey));
  return dayScore;
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
  bestWords: BestWord[] = [],
  wordsPlayed: number = bestWords.length
): void {
  engine.store.set(K.DAILY_PREFIX + dayKey, score);
  engine.store.setJSON(K.FOUND_PREFIX + dayKey, found);
  engine.store.setJSON(K.SWORB_PREFIX + dayKey, sworb);
  // top-5 words by points (SEVEN_PREFIX carries the day's superlatives)
  engine.store.setJSON(K.SEVEN_PREFIX + dayKey, {
    words: [...bestWords].sort((a, b) => b.pts - a.pts).slice(0, 5),
  });
  // the FULL word list (the explorer's "every word") — top-5 alone can't
  // tell the day's story
  engine.store.setJSON(DAY_WORDS_KEY + dayKey, bestWords);
  engine.store.set(K.DONE_PREFIX + dayKey, 1);
  clearRun(dayKey);
  // lifetime stats append (profile screen) — idempotent by day, lazy import
  // avoids a persist↔stats require cycle at module load
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./stats').recordDay(dayKey, score, wordsPlayed, bestWords);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./lexicon').recordWords(bestWords);
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
  boost?: number; // Threes-stack count survives kills
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
  words?: BestWord[]; // spelled-word history — superlatives survive kills
  boardElapsedMs: number;
  earnedMs: number; // time-fuel bank — rides the snapshot so resumes keep it
  round?: number; // REGULAR mode: which round this snapshot belongs to
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
  return { ...s, earnedMs: Number(s.earnedMs) || 0, words: Array.isArray(s.words) ? s.words : [] };
}

export function clearRun(dayKey: string): void {
  engine.store.remove(K.RUN_PREFIX + dayKey);
}

const DAY_WORDS_KEY = 'sworbl_rn_daywords_';

export function loadDayWords(dayKey: string): BestWord[] {
  const v = engine.store.getJSON(DAY_WORDS_KEY + dayKey, null) as BestWord[] | null;
  if (!Array.isArray(v)) return [];
  // DEDUPE ON READ (owner: duplicate-key crash on 'gusty') — pre-pivot days
  // wrote the RAW spelled list, so a word respelled in one round appears
  // twice in storage. Best pts per word wins; every renderer keys by word.
  const best = new Map<string, BestWord>();
  for (const w of v) {
    const cur = best.get(w.word);
    if (!cur || w.pts > cur.pts) best.set(w.word, w);
  }
  return [...best.values()];
}

// ---- UI restoration: "the sheet was open when the OS reclaimed us" ----
// Day-keyed on purpose: a flag from yesterday must never reopen a board —
// the new day boots fresh and the stale flag is discarded at read time.
const SHEET_OPEN_KEY = 'sworbl_rn_sheet_open';

export function saveSheetOpen(dayKey: string | null): void {
  if (dayKey) engine.store.setJSON(SHEET_OPEN_KEY, dayKey);
  else engine.store.remove(SHEET_OPEN_KEY);
}

// returns true only if the flag belongs to TODAY; stale flags self-clean
export function wasSheetOpen(dayKey: string): boolean {
  const stored = engine.store.getJSON(SHEET_OPEN_KEY, null) as string | null;
  if (!stored) return false;
  if (stored !== dayKey) {
    engine.store.remove(SHEET_OPEN_KEY); // yesterday's flag — dead on arrival
    return false;
  }
  return true;
}

// RESET NONCE: bumped whenever dev tooling wipes day data — the mounted
// PlaySheet keys on it, so a wiped day can never leave a ZOMBIE sheet living
// in its old in-memory phase (owner hit: restart-today → board still in
// keyboard/finale mode from the pre-wipe run)
const RESET_NONCE_KEY = 'sworbl_rn_reset_nonce';

export function getResetNonce(): number {
  return Number(engine.store.getJSON(RESET_NONCE_KEY, 0)) || 0;
}

export function bumpResetNonce(): void {
  engine.store.setJSON(RESET_NONCE_KEY, getResetNonce() + 1);
}

// DEV: wipe every per-day key for a day — "restart today's contest" without
// reinstalling. The K registry is the single source of per-day prefixes.
export function resetDay(dayKey: string): void {
  const prefixes = [
    K.DAILY_PREFIX, K.FOUND_PREFIX, K.DONE_PREFIX, K.RUN_PREFIX, K.SWORB_PREFIX,
    K.HINT_TOKENS_PREFIX, K.SEVEN_PREFIX, K.THEME_PREFIX, K.TIME_PREFIX, K.ATT_PREFIX,
  ].filter(Boolean);
  for (const p of prefixes) engine.store.remove(p + dayKey);
  engine.store.remove(ROUNDS_KEY + dayKey);
  engine.store.remove(MODE_KEY + dayKey);
  engine.store.remove(DAY_WORDS_KEY + dayKey);
  bumpResetNonce(); // the mounted sheet must remount — no zombie phases
}
