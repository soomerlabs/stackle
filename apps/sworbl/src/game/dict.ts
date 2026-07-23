// Word validation + scoring, all through the engine. Starter dictionary now;
// the 135k dictionary.txt upgrade path lands with the content pipeline work.
import engine from '@sworbl/engine';

let dictCache: Set<string> | null = null;
export function dict(): Set<string> {
  if (!dictCache) {
    dictCache = new Set(
      engine.words.FALLBACK_WORDS.split(/\s+/).filter((w: string) => w.length >= 3)
    );
  }
  return dictCache;
}

// ≤6-char prefixes as a PLAIN OBJECT — worklet-copyable via shared value
// (PHASE2-REQUIREMENTS #3: never capture big objects in worklet closures)
let prefixCache: Record<string, 1> | null = null;
export function prefixMap(): Record<string, 1> {
  if (!prefixCache) {
    prefixCache = {};
    for (const w of dict()) {
      const n = Math.min(w.length, 6);
      for (let i = 1; i <= n; i++) prefixCache[w.slice(0, i)] = 1;
    }
  }
  return prefixCache;
}

export function scoreWord(word: string): number {
  const base = [...word].reduce((s, ch) => s + engine.core.letterVal(ch), 0);
  return Math.round(base * 10 * engine.core.lenMult(word.length));
}
