// Shared game types for the RN client. The ENGINE owns the rules; these are
// the client-side shapes screens and worklets pass around.

export interface TileT {
  id: number;
  letter: string;
  col: number;
  row: number;
  ci: number; // PALETTE index
  spawnDrop: number; // 0 = dealt in place; >0 = rains in from N rows above
  bornAt: number; // ms epoch — mid-air tiles are not selectable until landed
}

// what the trace worklets need per tile (a slim copy that lives in shared values)
export interface TraceTile {
  id: number;
  letter: string;
  col: number;
  row: number;
  ci: number;
}

export const COLS = 5;
export const ROWS = 6;
export const CLUE_COUNT = 6;
