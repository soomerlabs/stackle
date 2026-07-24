// THE POINT PACKS (owner: mock "pay for more") — one source of truth for
// the wallet screen AND the lobby's inline "want some?" offer. Stickers
// wear mock $ prices; nothing charges in the proof phase — the tap trail
// in the ledger is the experiment.
export interface PointPack {
  key: 'splash' | 'surge' | 'deluge';
  points: number;
  sticker: string; // the mock price tag
  pal: number; // PALETTE index — candy identity per pack
}

export const POINT_PACKS: PointPack[] = [
  { key: 'splash', points: 100, sticker: '$0.99', pal: 2 },
  { key: 'surge', points: 300, sticker: '$1.99', pal: 0 },
  { key: 'deluge', points: 800, sticker: '$4.99', pal: 4 },
];
