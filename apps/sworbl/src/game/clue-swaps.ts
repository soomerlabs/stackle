// CLUE SWAPS (owner: "if you can't form one clue, another opens up") — the
// availability guarantee's last resort. The re-stamp can only write into
// REFILL tiles (the stable board never changes under the player), so a long
// broken clue can starve. After STARVE_REFILLS consecutive refills where a
// clue is solver-unfindable, it's swapped for an authored pool extra — the
// pills are blank, so the set change is invisible; the re-stamp machinery
// inherits the newcomer and weaves it in on the next refill.
// Day-keyed and persisted: a resumed run keeps its swapped identity.
import engine from '@sworbl/engine';

const SWAPS_KEY = 'sworbl_rn_clue_swaps_';

export const STARVE_REFILLS = 3;

export type SwapMap = Record<string, string>; // original clue → replacement

export function loadSwaps(dayKey: string): SwapMap {
  const v = engine.store.getJSON(SWAPS_KEY + dayKey, null) as SwapMap | null;
  return v && typeof v === 'object' ? v : {};
}

export function saveSwaps(dayKey: string, swaps: SwapMap): void {
  engine.store.setJSON(SWAPS_KEY + dayKey, swaps);
}

// the EFFECTIVE core: deal.clues with swaps applied (chains resolve — a
// replacement that itself got swapped follows through)
export function applySwaps(clues: string[], swaps: SwapMap): string[] {
  // COLLISION GUARD (owner: duplicate 'gusty'/'foggy' pills): swaps persist
  // per DAY, but every round deals a fresh clue set — a round-1 swap's
  // replacement can reappear as a NATURAL clue in a later round's deal.
  // A swap that would duplicate an existing entry is skipped (the original
  // clue stays); a final unique-pass is the absolute floor, because the
  // fan keys pills by clue.
  const out: string[] = [];
  for (const c of clues) {
    let cur = c;
    let guard = 0;
    while (swaps[cur] && guard++ < 8) cur = swaps[cur];
    if (cur !== c && (clues.includes(cur) || out.includes(cur))) cur = c;
    if (!out.includes(cur)) out.push(cur);
  }
  return out;
}
