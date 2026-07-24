// PAUSED STORM RUNS (owner: "i hit the X — shouldn't the card be in the
// list since it's active? i open it up, it's paused, we resume") — the
// registry of boards left mid-run. The BOARD state rides the same
// RunSnap store as the daily (keyed by seed); this module keeps the
// LAUNCH CONTEXT (post/stake/sealed/callout) so a resumed showdown
// still posts as one, plus the list the home card reads.
import engine from '@sworbl/engine';
import { loadRun } from '@/game/persist';

const KEY = 'sworbl_rn_storm_ctx';

export interface StormCtx {
  seed: string;
  post: boolean; // this run was a showdown create (PLAY & POST)
  stake?: number;
  sealed?: boolean;
  callout?: string;
  savedAt: number;
}

type CtxMap = Record<string, StormCtx>;

function readAll(): CtxMap {
  return engine.store.getJSON(KEY, {}) as CtxMap;
}

export function saveStormCtx(ctx: StormCtx): void {
  engine.store.setJSON(KEY, { ...readAll(), [ctx.seed]: ctx });
}

export function clearStormCtx(seed: string): void {
  const all = { ...readAll() };
  delete all[seed];
  engine.store.setJSON(KEY, all);
}

// paused runs that still have a live snapshot — stale ctx rows (snapshot
// gone or >36h old, the board's day has passed) self-clean on read.
// The snapshot's score rides along for the resume row's copy.
export type PausedRun = StormCtx & { score: number };

export function listPausedRuns(): PausedRun[] {
  const all = readAll();
  const out: PausedRun[] = [];
  let dirty = false;
  for (const seed of Object.keys(all)) {
    const ctx = all[seed];
    const fresh = Date.now() - ctx.savedAt < 36 * 3600 * 1000;
    const snap = fresh ? loadRun(seed) : null;
    if (snap) {
      out.push({ ...ctx, score: snap.score });
    } else {
      delete all[seed];
      dirty = true;
    }
  }
  if (dirty) engine.store.setJSON(KEY, all);
  return out.sort((a, b) => b.savedAt - a.savedAt);
}
