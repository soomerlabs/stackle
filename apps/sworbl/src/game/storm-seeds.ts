// DAILY STORM BOARDS (owner ruling: fresh boards beat rotation — "won't
// people get bored of that?"). Three NEW seeds mint every local day, pure
// day-key derivation: no authoring, no server, no repeats, and each seed's
// leaderboard persists as history after its day passes. Names come off a
// curated storm list, picked by seed hash — flavor, not intel.
import engine from '@sworbl/engine';

// storm codenames — enough that same-day triples never collide
const NAMES = [
  'skyfall', 'undertow', 'whiteout', 'squall', 'derecho', 'monsoon',
  'tempest', 'cyclone', 'haboob', 'chinook', 'mistral', 'sirocco',
  'nor-easter', 'gale', 'microburst', 'thunderhead', 'waterspout',
  'blizzard', 'downburst', 'supercell',
];

// THE INTENSITY LADDER (owner: "different intensities... a ladder, not
// an XP gate") — slot a/b/c IS the tier; rules derive from the seed so
// two clients can never disagree about a board's contract. Labels wear
// THE GRAMMAR LADDER (owner: "homonym hurricane lol thats the idea"):
//   diphthong drizzle — 3:00, friendly on-ramp, blue. the warm-up.
//   synonym squall    — 2:00, friendly bag, ice. the daily standard.
//   thesaurus thunder — 1:30, harsh bag arrives, yellow. the first real test.
//   homonym hurricane — 1:00, harsh bag, red + the warning flag. no mercy.
export interface StormIntensity {
  key: 'drizzle' | 'squall' | 'thunder' | 'hurricane';
  label: string;
  clockSecs: number;
  capSecs: number;
  friendly: boolean; // FRIENDLY bag on-ramp in the deal
  hue: { bg: string; edge: string }; // the tier's weather color (owner:
  // drizzle blue · squall ice · thunder yellow · hurricane red)
  bolts: number; // 1-3 on the card chip
  emoji: string; // the weather itself (hurricane renders the FLAG instead)
  entry: number; // points to enter (owner) — drizzle free, the on-ramp
}

export const INTENSITIES: Record<'a' | 'b' | 'c' | 'd', StormIntensity> = {
  a: { key: 'drizzle', label: 'diphthong drizzle', clockSecs: 180, capSecs: 300, friendly: true, hue: { bg: '#5BC8F5', edge: '#2E9FD0' }, bolts: 1, emoji: '🌧️', entry: 0 },
  b: { key: 'squall', label: 'synonym squall', clockSecs: 120, capSecs: 200, friendly: true, hue: { bg: '#AEE3F7', edge: '#74B9D6' }, bolts: 2, emoji: '🌨️', entry: 5 }, // snow squall (owner) — matches the ice-blue hue
  c: { key: 'thunder', label: 'thesaurus thunder', clockSecs: 90, capSecs: 150, friendly: false, hue: { bg: '#F5B84A', edge: '#CE9022' }, bolts: 3, emoji: '⛈️', entry: 10 },
  d: { key: 'hurricane', label: 'homonym hurricane', clockSecs: 60, capSecs: 100, friendly: false, hue: { bg: '#E5484D', edge: '#8C2328' }, bolts: 4, emoji: '🌀', entry: 20 },
};

// rules from the seed alone — foreign seeds (first-storm, shares) play
// as squall, the standard contract
export function stormIntensity(seed: string): StormIntensity {
  const m = seed.match(/^s-\d{8}-([abcd])$/);
  return m ? INTENSITIES[m[1] as 'a' | 'b' | 'c' | 'd'] : INTENSITIES.b;
}

export interface StormBoard {
  seed: string;
  name: string;
  intensity: StormIntensity;
}

// four boards per day: seed = s-YYYYMMDD-a/b/c/d (fits the server's
// ^[a-z0-9-]{3,24}$ law); names dealt without same-day duplicates
export function dailyStormBoards(now: Date = new Date()): StormBoard[] {
  const dk = engine.core.dayKey(now).replace(/-/g, '');
  const rng = engine.core.mulberry32(engine.core.hashSeed('storms|' + dk));
  const pool = [...NAMES];
  // THE BOARD IS THE TIER (owner: "actually call the one hurricane") —
  // names are the ladder itself; the rng stays for future codename use
  void rng;
  void pool;
  return (['a', 'b', 'c', 'd'] as const).map((slot) => ({
    seed: `s-${dk}-${slot}`,
    name: INTENSITIES[slot].label,
    intensity: INTENSITIES[slot],
  }));
}

// the name for any storm seed (deep links, the storm screen's title) —
// today's boards resolve to their dealt names; foreign seeds show as-is
export function stormName(seed: string, now: Date = new Date()): string {
  void now;
  // slot seeds wear their tier name any day (yesterday's hurricane is
  // still "hurricane" in history/deep links); foreign seeds pass through
  const m = seed.match(/^s-\d{8}-([abcd])$/);
  return m ? INTENSITIES[m[1] as 'a' | 'b' | 'c' | 'd'].label : seed;
}
