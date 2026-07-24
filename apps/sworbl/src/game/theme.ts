// THEME TOKENS — the design handoff's exact light/dark pairs (HANDOFF.md
// "Tokens"): light bg #EDEFF7 / ink #1F1442 / sub #8A8FA3, dark bg #101014 /
// ink #EDEFF7 / sub #9DA2B3. Candy block colors are theme-INVARIANT (the
// palette reads on both grounds); only surfaces, ink, and hairlines swap.
import { useColorScheme } from 'react-native';
import { useSyncExternalStore } from 'react';
import engine from '@sworbl/engine';

export interface Theme {
  mode: 'light' | 'dark';
  bg: string;
  ink: string; // primary text
  sub: string; // secondary text
  faint: string; // tertiary labels (eyebrows, section tails)
  hairline: string;
  dashed: string; // dashed ghost borders (empty tiles, got-away pills)
  icon: string;
  pill: string; // flat pill fill (non-candy word pills)
  card: string; // raised row/card surface (lb rows, stat cards, settings rows)
  blockShadow: string; // ambient drop under floating candy blocks
}

export const ACCENT = '#8971FF'; // indigo — you / action (both modes)
export const ACCENT_EDGE = '#6A54D8';
export const CLUE_GREEN = '#5FD6A8';
export const CLUE_GREEN_EDGE = '#38AD7F';

const DARK: Theme = {
  mode: 'dark',
  bg: '#101014',
  ink: '#EDEFF7',
  sub: '#9DA2B3',
  faint: '#8B8B97', // AA-adjacent on #101014 (audit: 3.5:1 was sub-AA at 10pt)
  hairline: 'rgba(255,255,255,0.08)',
  dashed: 'rgba(255,255,255,0.22)',
  icon: '#9DA2B3',
  pill: 'rgba(255,255,255,0.05)',
  card: '#16151c',
  blockShadow: '0 5px 12px rgba(0,0,0,0.4)',
};

const LIGHT: Theme = {
  mode: 'light',
  bg: '#EDEFF7',
  ink: '#1F1442',
  sub: '#8A8FA3',
  faint: '#6E6E7A',
  hairline: 'rgba(31,20,66,0.08)',
  dashed: '#C4C2CE',
  icon: '#6A6F82',
  pill: 'rgba(31,20,66,0.05)',
  card: '#FFFFFF',
  blockShadow: '0 5px 12px rgba(31,20,66,0.16)',
};

// ---- user override (settings): system | light | dark ----
export type ThemeMode = 'system' | 'light' | 'dark';
const THEME_KEY = 'sworbl_rn_theme';
let listeners: (() => void)[] = [];
let cached: ThemeMode | null = null;

export function getThemeMode(): ThemeMode {
  if (cached === null) {
    const v = engine.store.getJSON(THEME_KEY, 'system');
    cached = v === 'light' || v === 'dark' ? v : 'system';
  }
  return cached;
}

export function setThemeMode(mode: ThemeMode): void {
  cached = mode;
  engine.store.setJSON(THEME_KEY, mode);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode);
}

export function useTheme(): Theme {
  const system = useColorScheme();
  const mode = useThemeMode();
  const effective = mode === 'system' ? system : mode;
  return effective === 'light' ? LIGHT : DARK;
}
