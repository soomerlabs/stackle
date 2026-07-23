// Type surface for the JS engine — the TS-side contract for everything the RN
// app consumes. Audit 2026-07-23 (7.6 review, weakness #3): typed the REAL
// consumed surface across all modules and fixed two drifted signatures
// (letterVal's boost param, containsFoulTerm's required foulList).
// tests/api-surface is the drift canary; keep this file honest when the
// engine's API grows.

export interface SworblCore {
  /** Seeded PRNG — DETERMINISM CONTRACT: output is frozen, tests pin values. */
  mulberry32(seed: number): () => number;
  /** Stable string → 32-bit int hash (daily/leaderboard seed derivation). */
  hashSeed(str: string): number;
  /** Local calendar day key, e.g. "2026-07-22". */
  dayKey(d: Date): string;
  msToNextDay(d: Date): number;
  VALUES: Record<string, number>;
  BAG: string;
  VOWELS: string;
  FRIENDLY: string;
  /** Fisher-Yates over a letter-bag string, driven by a seeded rng. */
  shuffledBag(bag: string, rng: () => number): string[];
  expandLetter(ch: string): string; // 'q' → 'qu'
  dispLetter(ch: string): string;
  letterVal(ch: string, boost?: number): number;
  lenMult(n: number): number;
  streakMult(streak: number): number;
  containsFoulTerm(name: string, foulList: string[]): boolean;
}

export type GuessColor = 'green' | 'yellow' | 'gray';

export interface DailyEntry {
  sworb: string;
  themeWords: string[];
  definition?: string;
  [k: string]: unknown;
}

export interface SworblDaily {
  BACKSPACE: string; // '\b' — nextSlots' backspace sentinel
  parseEntry(dailies: unknown, dayKey: string): DailyEntry | null;
  clueFor(word: string, entry: DailyEntry): string | null;
  isClue(word: string, entry: DailyEntry): boolean;
  checkGuess(input: string, entry: DailyEntry): boolean;
  guessReward(cluesFound: number, total: number): number;
  scoreGuess(guess: string, answer: string): GuessColor[];
  bankClue(found: string[], clue: string | null): string[];
  resolveCatch(args: {
    word: string;
    found: string[];
    entry?: DailyEntry;
    targets?: string[];
  }): { clue: string | null; banked: string[]; isNew: boolean };
  applySworbGuess(args: {
    entry: DailyEntry | { sworb: string };
    input: string;
    guessesUsed: number;
    solved: boolean;
    foundCount?: number;
    total?: number;
  }): {
    ok: boolean;
    lockedOut?: boolean;
    correct?: boolean;
    newGuessesUsed?: number;
    nowSolved?: boolean;
    bonus?: number;
  };
  nextSlots(args: {
    slots: string[];
    colors: (string | null)[];
    ch: string;
    len: number;
  }): { slots: string[]; colors: (string | null)[] | null } | null;
  hintTokenEvents(args: {
    wordsSpelledThisRound: number;
    cluesFound: number;
    cluesTotal: number;
    tokensEarnedAlready: number;
  }): { grant: boolean };
  firstUnfoundClue(themeWords: string[], found: string[]): string | null;
  mercyPulseShouldFire(args: {
    alreadyFired: boolean;
    prevSecsLeft: number;
    secsLeft: number;
    cluesFound: number;
    thresholdSecs?: number;
  }): boolean;
  HINT_TOKEN_WORD_THRESHOLD: number;
  MAX_HINT_GRANTS_PER_ROUND: number;
  MERCY_THRESHOLD_SECS: number;
  MERCY_MAX_CLUES_FOUND: number;
  REWARD: Record<string, number>;
}

export interface SworblRun {
  RUN_VERSION: number;
  serializeRun(src: unknown): unknown | null;
  validateRun(raw: unknown, day: string): unknown | null;
  remainingSecs(roundSecs: number, boardElapsedMs: number): number;
  COUNT_IN_MS: { STEP2: number; STEP1: number; GO: number; RELEASE: number; UNMOUNT: number };
  countInStepAt(
    ms: number,
    ctx: { activeModal?: unknown; countIn?: unknown }
  ): { countIn: number | string | null; paused?: boolean } | null;
  TIME_FUEL: {
    BASE_SECS: number;
    CAP_SECS: number;
    CLUE_BONUS_MS: number;
    perLen: Record<number, number>;
    sevenPlusMs: number;
  };
  timeForWord(args: {
    len: number;
    isClue?: boolean;
    earnedMs: number;
    baseSecs?: number;
    capSecs?: number;
    fuel?: unknown;
  }): number;
}

export interface SworblFlow {
  liveHunt(ctx: unknown): boolean;
  startDailyRoute(ctx: {
    finale?: boolean;
    onHome?: boolean;
    consumed?: boolean;
    dailyLive?: boolean;
    over?: boolean;
    hasTiles?: boolean;
    finalePending?: boolean;
  }): 'home-finale-guard' | 'consumed' | 'resume' | 'finale' | 'fresh';
  endRoundRoute(ctx: unknown): string;
  finaleResolveRoute(ctx: unknown): string;
  pauseAction(ctx: unknown): 'pause' | 'noop';
  resumeAction(ctx: unknown): string;
  fairPauseAction(ctx: unknown): 'pause' | 'noop';
  flipStepperAction(ctx: unknown): 'flip' | 'noop';
}

export interface SworblSeed {
  seedClueLettersTwoPass(args: {
    clues: string[];
    cols: number;
    rows: number;
    rngFactory: () => () => number;
    target: number;
  }): {
    letters: Record<string, string>; // "row,col" → letter
    realized: string[];
    usedFallback?: boolean;
  };
  reseedBroken(args: {
    tiles: { row: number; col: number }[];
    unfound: string[];
    isFindable: (word: string) => boolean;
    rng: () => number;
    reserve: Set<string>;
  }): { r: number; c: number; letter: string }[];
}

export interface SworblSolver {
  /** DFS for one word; returns the tile-id path or null. */
  findWord(
    tiles: { id: number; letter: string; row: number; col: number }[],
    o: { word: string; expand: (ch: string) => string; diag: boolean }
  ): number[] | null;
  findFirstWord(...args: unknown[]): unknown;
  solveLongest(...args: unknown[]): unknown;
  topWords(...args: unknown[]): unknown;
  findAllWords(...args: unknown[]): unknown;
}

export interface StorageBacking {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key?(i: number): string | null;
  readonly length?: number;
}

export interface SworblStore {
  LS: Required<StorageBacking>;
  K: Record<string, string>;
  getInt(k: string, dflt: number): number;
  getJSON(k: string, dflt: unknown): unknown;
  set(k: string, v: unknown): void;
  setJSON(k: string, v: unknown): void;
  remove(k: string): void;
  keys(prefixes?: string[]): string[];
  setBacking(b: StorageBacking): void;
  AGE_GC_MAX_DAYS: number;
}

declare const engine: {
  core: SworblCore;
  seed: SworblSeed;
  solver: SworblSolver;
  daily: SworblDaily;
  status: any; // typed when the app consumes it (leaderboard era)
  flow: SworblFlow;
  run: SworblRun;
  store: SworblStore;
  net: any; // typed when the app consumes it (Supabase era)
  words: { FALLBACK_WORDS: string };
};

export = engine;
