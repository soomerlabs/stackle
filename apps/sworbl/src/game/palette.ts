// Candy palette + letter→hue mapping — verbatim from the web app (index.html).
import engine from '@sworbl/engine';

export interface Pal {
  bg: string;
  hi: string;
  edge: string;
}

export const PALETTE: Pal[] = [
  { bg: '#A78BFA', hi: '#BBA5FC', edge: '#7C5CE0' }, // brand violet
  { bg: '#5BC8F5', hi: '#7DD6F8', edge: '#2E9FD0' }, // brand cyan
  { bg: '#5FD6A8', hi: '#80E1BB', edge: '#38AD7F' }, // mint
  { bg: '#F58FB8', hi: '#F8ABC9', edge: '#D06090' }, // pink
  { bg: '#F5B84A', hi: '#F8CA74', edge: '#CE9022' }, // amber
  { bg: '#F58A66', hi: '#F8A588', edge: '#CC5F3D' }, // coral
];

export const INK = '#1F1442';
export const BG_DARK = '#101014';

// same families as the web tileColorFor: vowels amber/coral, premium pink,
// mid-value violet, commons cyan/mint
export function tileColorFor(letter: string, id: number | null = null): number {
  const pick = ((id != null ? id : 0) * 7 + letter.charCodeAt(0)) % 2;
  if ('aeiou'.includes(letter)) return pick ? 4 : 5;
  const v = engine.core.VALUES[letter] || 1;
  if (v >= 5) return 3;
  if (v >= 2) return 0;
  return pick ? 1 : 2;
}
