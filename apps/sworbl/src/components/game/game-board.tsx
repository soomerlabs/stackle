// The daily board — engine-dealt, tier-2 traced (PHASE2 #1-#6).
// The ENGINE decides (deal, validation targets, clue banking); this component acts.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn, useSharedValue, useAnimatedReaction, useAnimatedStyle, runOnJS, runOnUI,
  withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import engine from '@sworbl/engine';
import { GameTile } from './game-tile';
import TraceConnector from './trace-connector';
import { ClueFan } from './clue-fan';
import { COLS, ROWS, type TileT, type TraceTile } from '@/game/types';
import { PALETTE, CARD, gameSurface, type GameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';
import { settle, restampBroken, landsInMs, activeClues, type DailyDeal } from '@/game/daily';
import { dict, prefixMap, scoreWord } from '@/game/dict';
import { beginW, moveW, type TraceCtx } from '@/game/trace';
import { haptic } from '@/game/haptics';
import { loadLadder, saveLadder, NUDGE_AT_WORDS, FREE_CLUE_AT_WORDS, FINALE_FLOOR, type HintLadder } from '@/game/hints';
import { PingRings } from './ping-rings';
import { StepperCard, type SworbFace } from './stepper-card';
import { BoardKeyboard } from './board-keyboard';
import { applyGuess } from '@/game/finale-logic';
import { getClueAudit } from '@/game/dev-flags';
import { loadSwaps, saveSwaps, applySwaps, STARVE_REFILLS, type SwapMap } from '@/game/clue-swaps';
import { FlightGhosts, type FlightGhostT } from './flight-ghosts';
import { DevClueAudit, DevFlash } from './dev-clue-audit';
import type { FinaleRestore } from './finale';

interface Props {
  deal: DailyDeal; // the screen owns the deal — resume injects restored state
  size: number;
  gap: number;
  initialTiles?: TileT[];
  initialFound?: string[];
  initialScore?: number;
  secsLeft?: number; // live clock feed — the mercy pulse watches the 2:00 crossing
  onScore?: (total: number) => void;
  onClues?: (found: string[]) => void;
  onTiles?: (tiles: TileT[], queueIdx: number) => void; // run-snapshot feed
  onWordSpelled?: (word: string, pts: number, caughtClue: boolean) => void; // superlatives + time-fuel feed
  mercySecs?: number; // mercy threshold override (time-fuel rounds fire later)
  gestureRef?: React.MutableRefObject<PanGesture | undefined>; // the sheet's close-drag yields to this
  concealed?: boolean; // pre-GO / paused: blocks render, letters DON'T (anti-stare)
  countIn?: string | null; // the stepper speaks the 3·2·1 (no overlay)
  // THE IN-PLACE FINALE (owner loop): at 0:00 the BOARD becomes the keyboard,
  // the STEPPER hosts the guess — the player never leaves the gameboard
  finale?: {
    sworb: string;
    restore?: FinaleRestore;
    onProgress: (s: FinaleRestore) => void;
    onDone: (r: { solved: boolean; guessesUsed: number; bonus: number }) => void;
  } | null;
}

export function GameBoard({
  deal, size, gap, initialTiles, initialFound, initialScore, secsLeft, onScore, onClues, onTiles, onWordSpelled, mercySecs, gestureRef, finale, concealed, countIn,
}: Props) {
  // LIGHT MODE (owner): one stable surface object per scheme — memo-safe props
  const gs = gameSurface(useTheme().mode);
  const inFinale = !!finale;
  const cell = size + gap;
  const boardW = COLS * cell - gap;
  const boardH = ROWS * cell - gap;

  const [tiles, setTiles] = useState<TileT[]>(() => initialTiles ?? deal.tiles);
  // id → position-in-swipe (pop stagger rides the seq; web clearSeq)
  const [clearingIds, setClearingIds] = useState<Map<number, number>>(new Map());
  const [flights, setFlights] = useState<Map<number, { dx: number; dy: number }>>(new Map());
  const [ghosts, setGhosts] = useState<FlightGhostT[]>([]);
  const ghostKeyRef = useRef(0);
  const [verdict, setVerdict] = useState<{ word: string; pts?: number; ok: boolean; clue?: string; mult?: number; fly?: boolean } | null>(null);
  const [trace, setTrace] = useState({ word: '', ci: 0 });
  const [jsPath, setJsPath] = useState<TraceTile[]>([]); // web connector mirror
  const [found, setFound] = useState<string[]>(initialFound ?? []);
  const foundRef = useRef(found);
  foundRef.current = found;
  const scoreRef = useRef(initialScore ?? 0);
  // every word spelled this run — the re-stamp's roundWords guard (a clue you
  // JUST spelled must never rain back onto the board)
  const playedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    onClues && onClues(found);
  }, [found]);
  useEffect(() => {
    onTiles && onTiles(tiles, deal.getQueueIdx());
  }, [tiles]);

  // ---- CLUE SWAPS: the availability guarantee. Starved clues (unfindable
  // for STARVE_REFILLS consecutive refills) swap for pool extras — blank
  // pills make the change invisible. Persisted per day; resumes keep it.
  const [swaps, setSwaps] = useState<SwapMap>(() => loadSwaps(deal.dayKey));
  const swapsRef = useRef(swaps);
  swapsRef.current = swaps;
  const starveRef = useRef<Record<string, number>>({});
  useEffect(() => {
    saveSwaps(deal.dayKey, swaps);
  }, [deal.dayKey, swaps]);
  const core = applySwaps(deal.clues, swaps);
  // extras: authored pool minus everything already in play or already used
  const freeExtras = deal.poolExtras.filter(
    (w) => !core.includes(w) && !Object.values(swaps).includes(w)
  );

  // ---- BONUS WAVES (owner): all current clues caught + time left → 3 more
  // from the authored pool join the hunt. Pure function of `found` — resumes
  // and kills re-derive the same set. The fan grows; catches still pay fuel.
  const act = activeClues(core, freeExtras, found);
  const actRef = useRef(act);
  actRef.current = act;
  const prevActLen = useRef(act.length);
  useEffect(() => {
    if (act.length > prevActLen.current) {
      setVerdict({ word: 'bonus', ok: true });
      setTimeout(() => setVerdict(null), 1200);
      haptic.good();
    }
    prevActLen.current = act.length;
  }, [act.length]);

  // ---- HINT LADDER (owner 2026-07-23): blank pills; earned, validated grants ----
  const [ladder, setLadder] = useState<HintLadder>(() => loadLadder(deal.dayKey));
  const [ping, setPing] = useState<{ key: number; x: number; y: number; color: string } | null>(null);
  // NOPE (web nopeTiles): the rejected word's tiles shake it off red in place
  const [nope, setNope] = useState<{ key: number; seqs: Map<number, number>; total: number }>({
    key: 0, seqs: new Map(), total: 0,
  });
  const pingKeyRef = useRef(0);
  const tilesMirror = useRef(tiles);
  tilesMirror.current = tiles;
  const clearingMirror = useRef(clearingIds);
  clearingMirror.current = clearingIds;
  useEffect(() => {
    saveLadder(deal.dayKey, ladder);
  }, [deal.dayKey, ladder]);

  // after every refill settles: count consecutive-broken refills per unfound
  // clue; at the threshold, swap it for a pool extra (owner availability rule)
  const auditStarvation = useCallback(
    (board: TileT[]) => {
      const activeNow = applySwaps(deal.clues, swapsRef.current);
      for (const clue of activeNow) {
        if (foundRef.current.includes(clue) || playedRef.current.has(clue)) continue;
        const findable = !!engine.solver.findWord(board, {
          word: clue, expand: engine.core.expandLetter, diag: true,
        });
        if (findable) {
          starveRef.current[clue] = 0;
          continue;
        }
        const n = (starveRef.current[clue] = (starveRef.current[clue] ?? 0) + 1);
        if (n >= STARVE_REFILLS) {
          const replacement = deal.poolExtras.find(
            (w) =>
              !activeNow.includes(w) &&
              !Object.values(swapsRef.current).includes(w) &&
              !foundRef.current.includes(w) &&
              !playedRef.current.has(w)
          );
          if (replacement) {
            starveRef.current[clue] = 0;
            setSwaps((cur) => ({ ...cur, [clue]: replacement }));
          }
        }
      }
    },
    [deal]
  );

  // fire the ping at a clue's STARTING tile (compass, not answer).
  // VALIDATED AT GIVE-TIME (owner bug catch): a clue's path can be temporarily
  // broken between refills (re-stamp waits for cells) — a hint must NEVER point
  // at a location it can't prove. No path now = no ping, token kept.
  const firePing = useCallback(
    (clue: string, slot: number) => {
      const live = tilesMirror.current.filter((t: TileT) => !clearingMirror.current.has(t.id));
      const path = engine.solver.findWord(live, {
        word: clue,
        expand: engine.core.expandLetter,
        diag: true,
      });
      if (!path) return false; // unprovable location — refuse, honestly
      const t = live.find((x: TileT) => x.id === path[0]);
      if (!t) return false;
      setPing({
        key: ++pingKeyRef.current,
        x: t.col * cell + size / 2,
        y: t.row * cell + size / 2,
        color: PALETTE[slot % PALETTE.length].bg,
      });
      haptic.good();
      return true;
    },
    [cell, size]
  );

  // a clue is grantable only if the solver proves it on the LIVE board
  const findableUnfound = useCallback((): string | null => {
    const live = tilesMirror.current.filter((t: TileT) => !clearingMirror.current.has(t.id));
    for (const clue of applySwaps(deal.clues, swapsRef.current)) {
      if (foundRef.current.includes(clue)) continue;
      if (engine.solver.findWord(live, { word: clue, expand: engine.core.expandLetter, diag: true }))
        return clue;
    }
    return null;
  }, [deal]);

  // free-clue grant: bank a provably-findable clue outright (full intel)
  const grantFreeClue = useCallback((): boolean => {
    const clue = findableUnfound();
    if (!clue) return false;
    setFound((cur) => (cur.includes(clue) ? cur : [...cur, clue]));
    firePing(clue, Math.max(0, applySwaps(deal.clues, swapsRef.current).indexOf(clue)));
    setVerdict({ word: clue.toUpperCase(), ok: true, clue });
    setTimeout(() => setVerdict(null), 1400);
    haptic.good();
    return true;
  }, [findableUnfound, firePing, deal]);

  // DEV CLUE AUDIT (owner fairness lens): tap a revealed chip → the solver
  // must prove the path on the live board NOW; flash it or refuse red.
  const audit = __DEV__ && getClueAudit();
  const [devFlash, setDevFlash] = useState<{ key: number; cells: { col: number; row: number }[] } | null>(null);
  const devFlashKey = useRef(0);
  // the AVAILABILITY meter (owner: "always a couple clues available or it's
  // a needle in a haystack") — solver-counted per board change, dev only
  const devFindable = useMemo(() => {
    if (!audit) return 0;
    const live = tiles.filter((t) => !clearingIds.has(t.id));
    return act.filter(
      (c) =>
        !found.includes(c) &&
        !!engine.solver.findWord(live, { word: c, expand: engine.core.expandLetter, diag: true })
    ).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit, tiles, clearingIds, act, found]);

  const devProve = useCallback((clue: string): boolean => {
    const live = tilesMirror.current.filter((t: TileT) => !clearingMirror.current.has(t.id));
    const path = engine.solver.findWord(live, {
      word: clue, expand: engine.core.expandLetter, diag: true,
    });
    if (!path) return false;
    const cells = (path as number[])
      .map((id) => live.find((t: TileT) => t.id === id))
      .filter(Boolean)
      .map((t) => ({ col: (t as TileT).col, row: (t as TileT).row }));
    setDevFlash({ key: ++devFlashKey.current, cells });
    return true;
  }, []);

  // THE WAKE: concealment lifting = the board turning ON. The ring shockwave
  // was owner-rejected ("don't like it, something subtle") — the announcement
  // is the radial letter stamp-in plus one soft BREATH of the whole board.
  const prevConcealed = useRef(!!concealed);
  const sBreath = useSharedValue(1);
  useEffect(() => {
    if (prevConcealed.current && !concealed) {
      sBreath.value = withSequence(
        withTiming(1.012, { duration: 130, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 240, easing: Easing.inOut(Easing.quad) })
      );
      haptic.good();
    }
    prevConcealed.current = !!concealed;
  }, [concealed]);
  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: sBreath.value }] }));

  // the tile layer ACTUALLY crossfades under the finale keyboard now — the
  // comment always said crossfade; the style was an instant opacity swap
  const sTiles = useSharedValue(inFinale ? 0 : 1);
  useEffect(() => {
    sTiles.value = withTiming(inFinale ? 0 : 1, { duration: 320 });
  }, [inFinale]);
  const tilesStyle = useAnimatedStyle(() => ({ opacity: sTiles.value }));

  // FINALE FLOOR: enter the guess round with at least 2 clues banked. Keyed on
  // the finale prop ARRIVING — the old secsLeft<=0 trigger never fired (the
  // sheet flips remaining=0 and phase='finale' in ONE batched update, so the
  // board never renders secsLeft===0; owner's zero-word game got no hints).
  // No findability gate here: the hunt is over, these are pure guessing intel.
  useEffect(() => {
    if (!finale || ladder.floorGiven) return;
    setLadder((l) => ({ ...l, floorGiven: true }));
    const need = FINALE_FLOOR - foundRef.current.length;
    if (need <= 0) return;
    const grants = applySwaps(deal.clues, swapsRef.current)
      .filter((c) => !foundRef.current.includes(c))
      .slice(0, need);
    if (grants.length) {
      setFound((cur) => [...cur, ...grants.filter((c) => !cur.includes(c))]);
      haptic.good();
    }
  }, [finale, ladder.floorGiven, deal]);

  // ---- UI-thread state (tier-2) ----
  const sGrid = useSharedValue<(TraceTile | null)[][]>([]);
  const sPath = useSharedValue<TraceTile[]>([]);
  const sLastPt = useSharedValue<{ x: number; y: number } | null>(null);
  const sHx = useSharedValue(0);
  const sHy = useSharedValue(0);
  const sDepth = useSharedValue<Record<number, number>>({});
  const sAddAt = useSharedValue<Record<number, number>>({});
  const sDragging = useSharedValue(false);
  // big map rides a shared value populated AFTER first paint (PHASE2 #3)
  const sPrefixes = useSharedValue<Record<string, 1>>({});
  useEffect(() => {
    const h = setTimeout(() => {
      sPrefixes.value = prefixMap();
    }, 0);
    return () => clearTimeout(h);
  }, []);

  // live-board lookup; mid-air tiles join on landing (PHASE2 #5)
  const [landTick, setLandTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    let maxWait = 0;
    const g: (TraceTile | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (const t of tiles) {
      if (clearingIds.has(t.id) || t.row < 0 || t.row >= ROWS || t.col < 0 || t.col >= COLS) continue;
      const wait = t.bornAt + landsInMs(t) - now;
      if (wait > 0) {
        maxWait = Math.max(maxWait, wait);
        continue;
      }
      g[t.row][t.col] = { id: t.id, letter: t.letter, col: t.col, row: t.row, ci: t.ci };
    }
    sGrid.value = g;
    if (maxWait > 0) {
      const h = setTimeout(() => setLandTick((n) => n + 1), maxWait + 20);
      return () => clearTimeout(h);
    }
  }, [tiles, clearingIds, landTick]);

  // ---- IN-PLACE FINALE state (fossil sworb face; engine decides) ----
  const fin = finale;
  const fLen = fin ? fin.sworb.length : 0;
  const [fRows, setFRows] = useState<{ letters: string[]; colors: string[] }[]>(
    fin?.restore?.rows ?? []
  );
  const [fSlots, setFSlots] = useState<string[]>(
    fin?.restore?.slots?.length === fLen ? fin.restore.slots : Array(fLen).fill('')
  );
  const [fColors, setFColors] = useState<(string | null)[]>(
    fin?.restore?.colors?.length === fLen ? fin.restore.colors : Array(fLen).fill(null)
  );
  const [fUsed, setFUsed] = useState(fin?.restore?.guessesUsed ?? 0);
  const [fLocked, setFLocked] = useState(false);
  const [fShake, setFShake] = useState(0);
  const [fBurst, setFBurst] = useState(0);

  useEffect(() => {
    if (!fin) return;
    if (fSlots.length !== fLen) {
      setFRows(fin.restore?.rows ?? []);
      setFSlots(fin.restore?.slots?.length === fLen ? fin.restore.slots : Array(fLen).fill(''));
      setFColors(fin.restore?.colors?.length === fLen ? fin.restore.colors : Array(fLen).fill(null));
      setFUsed(fin.restore?.guessesUsed ?? 0);
    }
  }, [fin, fLen, fSlots.length]);

  const fKey = useCallback(
    (ch: string) => {
      if (!fin || fLocked) return;
      const next = engine.daily.nextSlots({ slots: fSlots, colors: fColors, ch, len: fLen });
      if (!next) return;
      setFSlots(next.slots);
      setFColors(next.colors || Array(fLen).fill(null));
      haptic.soft();
    },
    [fin, fLocked, fSlots, fColors, fLen]
  );
  const fSubmit = useCallback(() => {
    if (!fin || fLocked) return;
    const out = applyGuess({
      slots: fSlots, rows: fRows, guessesUsed: fUsed,
      sworb: fin.sworb, foundCount: foundRef.current.length, clueTotal: deal.clues.length,
    });
    if (out.kind === 'reject') {
      haptic.bad();
      setFShake((k) => k + 1);
      return;
    }
    setFRows(out.rows);
    setFUsed(out.usedNow);
    if (out.kind === 'solved' || out.kind === 'lockout') {
      const solved = out.kind === 'solved';
      setFLocked(true);
      if (solved) {
        // LOTS of confetti (owner) — the win pops in the stepper
        setFColors(Array(fLen).fill('green'));
        setFSlots([...fin.sworb]);
        setFBurst((k) => k + 1);
        haptic.good();
      } else {
        haptic.bad();
      }
      // BANK IMMEDIATELY (kill-window fix): the result is committed the
      // instant it's decided — the celebration that follows is pure theater
      // over an already-locked day. The sheet owns the close delay.
      fin.onDone({ solved, guessesUsed: out.usedNow, bonus: solved ? out.bonus : 0 });
      return;
    }
    setFSlots(out.slots);
    setFColors(out.colors);
    fin.onProgress({ rows: out.rows, slots: out.slots, colors: out.colors, guessesUsed: out.usedNow });
    setFShake((k) => k + 1);
    haptic.bad();
    // the 3rd-miss FREEBIE (owner): another clue releases mid-guessing —
    // banked as intel (no location claim, so no findability requirement)
    if (out.usedNow === 3 && !ladder.guess3Given) {
      const clue = applySwaps(deal.clues, swapsRef.current).find(
        (c) => !foundRef.current.includes(c)
      );
      if (clue) {
        setFound((cur) => (cur.includes(clue) ? cur : [...cur, clue]));
        setLadder((l) => ({ ...l, guess3Given: true }));
        haptic.good();
      }
    }
  }, [fin, fLocked, fSlots, fRows, fUsed, deal, ladder.guess3Given]);

  const sworbFace: SworbFace | null = fin
    ? { slots: fSlots, colors: fColors, guessesUsed: fUsed, shakeKey: fShake, burstKey: fBurst }
    : null;

  const ctx: TraceCtx = useMemo(
    () => ({
      size, gap, cols: COLS, rows: ROWS,
      grid: sGrid, path: sPath, lastPt: sLastPt, hx: sHx, hy: sHy,
      depth: sDepth, addAt: sAddAt, prefixes: sPrefixes,
    }),
    [size, gap]
  );

  // FIRST-TOUCH WARMUP: worklets compile lazily on first invocation — running
  // them once with dead coordinates at mount means the first real finger never
  // pays the compile cost (the "board slow to respond on first load" report)
  useEffect(() => {
    runOnUI(() => {
      'worklet';
      beginW({ x: -9999, y: -9999 }, ctx);
      moveW({ x: -9999, y: -9999 }, ctx);
      ctx.lastPt.value = null;
    })();
  }, []);

  // ---- discrete JS-side events ----
  const onTraceChange = useCallback((len: number, word: string, ci: number, grew: boolean, p: TraceTile[]) => {
    setTrace({ word, ci });
    setJsPath(p);
    if (len === 0) return;
    if (grew) haptic.tick(len);
    else haptic.soft();
  }, []);

  useAnimatedReaction(
    () => {
      const p = sPath.value;
      let w = '';
      for (let i = 0; i < p.length; i++) {
        const l = p[i].letter;
        w += l === 'q' ? 'qu' : l;
      }
      return { len: p.length, word: w, ci: p.length ? p[p.length - 1].ci : 0, p };
    },
    (cur, prev) => {
      if (prev === null || cur.len !== prev.len) {
        runOnJS(onTraceChange)(cur.len, cur.word, cur.ci, cur.len > (prev ? prev.len : 0), cur.p);
      }
    }
  );

  const commitWord = useCallback(
    (ids: number[], word: string) => {
      if (!deal) return;
      // THE STACK (web mergeTiles / Threes): a 2-tile pair of the SAME letter
      // merges — survivor is the LAST tile of the swipe, takes the first's
      // color, boost accumulates (a+b+1); ×mult shows on the tile and the
      // stacked value pays out when the tile is finally spelled.
      if (ids.length === 2) {
        const a = tilesMirror.current.find((t) => t.id === ids[0]);
        const b = tilesMirror.current.find((t) => t.id === ids[1]);
        if (a && b && a.letter === b.letter) {
          const boost = (a.boost || 0) + (b.boost || 0) + 1;
          setVerdict({ word: b.letter, ok: true, mult: boost + 1 });
          setTimeout(() => setVerdict(null), 1100);
          haptic.good();
          // survivor stacks NOW (badge + impact pop); the twin exits through
          // the standard clearing pop, then the column settles — one motion
          setTiles((cur) => cur.map((t) => (t.id === b.id ? { ...t, boost, ci: a.ci } : t)));
          setClearingIds((cur) => new Map([...cur, [a.id, 0]]));
          setTimeout(() => {
            setClearingIds((cur) => {
              const next = new Map(cur);
              next.delete(a.id);
              return next;
            });
            setTiles((cur) => {
              const { tiles: settled, added } = settle(cur.filter((t) => t.id !== a.id), deal.nextLetter);
              const unfound = actRef.current.filter(
                (c) => !foundRef.current.includes(c) && !playedRef.current.has(c)
              );
              const caught = actRef.current.filter(
                (c) => foundRef.current.includes(c) || playedRef.current.has(c)
              );
              const out = restampBroken({ deal, tiles: settled, added, unfound, caught });
              auditStarvation(out);
              return out;
            });
          }, 285);
        } else if (a && b) {
          // non-identical pair: too short for a word — shake it off (web)
          setNope((n) => ({ key: n.key + 1, seqs: new Map(ids.map((id, i) => [id, i])), total: 2 }));
          haptic.bad();
        }
        return;
      }
      if (ids.length < 3) return;
      if (!dict().has(word)) {
        setVerdict({ word: word.toUpperCase(), ok: false });
        // the WAVE-NO: seq = position in the swipe (drain sweeps head→back)
        setNope((n) => ({
          key: n.key + 1,
          seqs: new Map(ids.map((id, i) => [id, i])),
          total: ids.length,
        }));
        setTimeout(() => setVerdict(null), 600);
        haptic.bad();
        return;
      }
      // stacked tiles pay their multiplier (web tileVal): score from the PATH
      const pathTiles = ids
        .map((id) => tilesMirror.current.find((t) => t.id === id))
        .filter(Boolean) as TileT[];
      const base = pathTiles.reduce(
        (sum, t) => sum + engine.core.letterVal(t.letter, t.boost),
        0
      );
      const pts = Math.round(base * 10 * engine.core.lenMult(word.length));
      // the ENGINE decides whether this word banks a clue ("trims" banks "trim")
      const res = engine.daily.resolveCatch({ found: foundRef.current, word, targets: actRef.current });
      setVerdict(
        res.isNew
          ? { word: word.toUpperCase(), pts, ok: true, clue: res.clue ?? undefined, fly: true }
          : { word: word.toUpperCase(), pts, ok: true, fly: true }
      );
      if (res.isNew) setFound(res.banked);
      // HINT LADDER steps (validated at give-time):
      setLadder((l) => {
        const words = l.words + 1;
        let next = { ...l, words };
        // starter nudge: 3 words, still clueless → one first letter + ping
        if (!l.nudged && words >= NUDGE_AT_WORDS && res.banked.length === 0) {
          const clue = findableUnfound();
          if (clue) {
            next = { ...next, nudged: clue };
            firePing(clue, Math.max(0, applySwaps(deal.clues, swapsRef.current).indexOf(clue)));
          }
        }
        // the 7-word free clue: full intel for the guess round
        if (!l.freeGiven && words >= FREE_CLUE_AT_WORDS && res.banked.length < deal.clues.length) {
          if (grantFreeClue()) next = { ...next, freeGiven: true };
        }
        return next;
      });
      setTimeout(() => setVerdict(null), 1200);
      haptic.good();
      scoreRef.current += pts;
      onWordSpelled && onWordSpelled(word, pts, res.isNew);
      onScore && onScore(scoreRef.current);
      playedRef.current.add(word);
      const gone = new Map(ids.map((id, i) => [id, i]));
      // 5f flight vectors (web stepperFly): from each tile's center to its
      // chip slot on the stepper — center-spread, chip width min(32, strip/n)
      const stripW = boardW + 24;
      const cw = Math.min(32, (stripW - 20) / ids.length);
      // stepper center in tile coordinates: card pad 12 + stepper margin 12 +
      // half the fixed 80 card = 64px above the inner board origin
      const flights = new Map(
        ids.map((id, i) => {
          const t = tilesMirror.current.find((x) => x.id === id);
          if (!t) return [id, { dx: 0, dy: 0 }] as const;
          const tx = t.col * cell + size / 2;
          const ty = t.row * cell + size / 2;
          return [
            id,
            {
              dx: Math.round(boardW / 2 + (i - (ids.length - 1) / 2) * cw - tx),
              dy: Math.round(-64 - ty),
            },
          ] as const;
        })
      );
      setFlights((cur) => new Map([...cur, ...flights]));
      // GHOST launch: the visible flight happens OUTSIDE the clip (the mask
      // was decapitating letters at its edge — owner). Real tiles hide at
      // launch (the flight prop drives that); ghosts fly the full route.
      const batch: FlightGhostT[] = ids
        .map((id, i) => {
          const t = tilesMirror.current.find((x) => x.id === id);
          if (!t) return null;
          const v = flights.get(id)!;
          return {
            key: ++ghostKeyRef.current,
            letter: t.letter,
            seq: i,
            x: t.col * cell,
            y: t.row * cell,
            dx: v.dx,
            dy: v.dy,
            size,
          };
        })
        .filter(Boolean) as FlightGhostT[];
      setGhosts((cur) => [...cur, ...batch]);
      const lastKey = ghostKeyRef.current;
      setTimeout(
        () => setGhosts((cur) => cur.filter((g) => g.key > lastKey)),
        ids.length * 40 + 450
      );
      // additive/subtractive ops (audit weakness #4b): overlapping commits must
      // not wipe each other's clearing state
      setClearingIds((cur) => new Map([...cur, ...gone]));
      // settle AFTER the last tile's staggered pop (45ms/tile, web clearSeq)
      setTimeout(() => {
        setClearingIds((cur) => {
          const next = new Map(cur);
          gone.forEach((_v, id) => next.delete(id));
          return next;
        });
        setFlights((cur) => {
          const next = new Map(cur);
          gone.forEach((_v, id) => next.delete(id));
          return next;
        });
        setTiles((cur) => {
          const { tiles: settled, added } = settle(cur.filter((t) => !gone.has(t.id)), deal.nextLetter);
          // web parity: broken un-found clues ride back in on the refill
          const unfound = actRef.current.filter(
            (c) => !foundRef.current.includes(c) && !playedRef.current.has(c)
          );
          const caught = actRef.current.filter(
            (c) => foundRef.current.includes(c) || playedRef.current.has(c)
          );
          const out = restampBroken({ deal, tiles: settled, added, unfound, caught });
          auditStarvation(out);
          return out;
        });
      }, 240 + ids.length * 45);
    },
    [deal, onScore]
  );

  // ---- the gesture: pure worklets in the hot path (PHASE2 #1/#6) ----
  const pan = useMemo(
    () => {
      const g = Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .onBegin((e) => {
          'worklet';
          sDragging.value = beginW({ x: e.x, y: e.y }, ctx);
        })
        .onUpdate((e) => {
          'worklet';
          if (!sDragging.value || sPath.value.length === 0) return;
          moveW({ x: e.x, y: e.y, vx: e.velocityX, vy: e.velocityY }, ctx);
        })
        // commit on clean finish only; a stolen touch must never submit
        .onEnd(() => {
          'worklet';
          const p = sPath.value;
          const ids: number[] = [];
          let word = '';
          for (let i = 0; i < p.length; i++) {
            ids.push(p[i].id);
            const l = p[i].letter;
            word += l === 'q' ? 'qu' : l; // the q tile IS "qu"
          }
          if (ids.length) runOnJS(commitWord)(ids, word);
        })
        .onFinalize(() => {
          'worklet';
          sDragging.value = false;
          sPath.value = [];
        });
      if (gestureRef) g.withRef(gestureRef);
      return g;
    },
    [ctx, commitWord, gestureRef]
  );

  if (!deal) {
    return (
      <View style={styles.noDay}>
        <Text style={styles.noDayText}>no puzzle for today — content runway empty</Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center' }}>
      {/* THE STEPPER (web hopperCard) — ABOVE the board; hosts the GUESS in the finale */}
      <StepperCard
        width={boardW + 24}
        traceWord={trace.word}
        verdict={verdict}
        sworb={sworbFace}
        countIn={countIn}
        gs={gs}
      />

      {/* THE BOARD CARD (web boardCardStyle): tiles live ON a card with sunken
          cell wells — not floating on the screen background. breathStyle:
          the one soft pulse when the board turns on at GO. */}
        <Animated.View
          style={[
            styles.card,
            breathStyle,
            {
              width: boardW + 24,
              paddingBottom: 12 + Math.max(3, Math.round(size * 0.08)),
              backgroundColor: gs.card,
              boxShadow: `0 6px 0 ${gs.cardEdge}`,
            },
          ]}>
        {/* clip window: masks refills falling from above, PADDED 12px on ALL
            sides so nothing legitimate ever gets sliced — top: press-lift,
            bottom: the ledges (they extend below the grid), sides: the
            nope-shake and head-scale on edge columns (owner audit) */}
        <View
          style={{
            width: boardW + 24,
            height: boardH + 24,
            overflow: 'hidden',
            marginTop: -12,
            marginLeft: -12,
            marginRight: -12,
          }}>
        <GestureDetector gesture={pan}>
        <View style={{ width: boardW, height: boardH, marginTop: 12, marginLeft: 12 }}>
          {/* the tile layer fades under the incoming keyboard (fossil crossfade) */}
          <Animated.View style={tilesStyle} pointerEvents={inFinale ? 'none' : 'auto'}>
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <View
              key={`bgc${i}`}
              style={[
                styles.cellWell,
                {
                  width: size,
                  height: size,
                  borderRadius: Math.round(size * 0.2),
                  left: (i % COLS) * cell,
                  top: Math.floor(i / COLS) * cell,
                  backgroundColor: gs.well,
                },
              ]}
            />
          ))}
          {/* web z-order: the dotted links run UNDER the blocks */}
          <TraceConnector
            sPath={sPath}
            jsPath={jsPath}
            size={size}
            gap={gap}
            width={boardW}
            height={boardH}
          />
          {tiles.map((t) => (
            <GameTile
              key={t.id}
              tile={t}
              size={size}
              gap={gap}
              sPath={sPath}
              clearingSeq={clearingIds.get(t.id)}
              flight={flights.get(t.id)}
              nope={nope.seqs.has(t.id) ? nope.key : 0}
              nopeSeq={nope.seqs.get(t.id) ?? 0}
              nopeTotal={nope.total}
              concealed={!!concealed}
              gs={gs}
            />
          ))}
          {devFlash && (
            <DevFlash
              key={devFlash.key}
              cells={devFlash.cells}
              size={size}
              cell={cell}
              onDone={() => setDevFlash(null)}
            />
          )}
          {ping && (
            <PingRings
              key={ping.key}
              x={ping.x}
              y={ping.y}
              size={size}
              color={ping.color}
              onFinish={() => setPing(null)}
            />
          )}
          </Animated.View>
          {inFinale && fin && (
            <Animated.View entering={FadeIn.duration(320)} style={StyleSheet.absoluteFill}>
            <BoardKeyboard
              gs={gs}
              size={size}
              gap={gap}
              full={fSlots.length > 0 && fSlots.every(Boolean)}
              onKey={fKey}
              onBackspace={() => fKey(engine.daily.BACKSPACE)}
              onSubmit={fSubmit}
            />
            </Animated.View>
          )}
        </View>
        </GestureDetector>
        </View>
          <FlightGhosts ghosts={ghosts} />
        </Animated.View>

      <ClueFan clues={act} found={found} nudged={ladder.nudged} gs={gs} />
      {audit && (
        // UNSOLVED only (owner): the fan above already shows the caught ones
        // in candy — the audit strip is for placement of what's still hiding
        <DevClueAudit
          clues={act.filter((c) => !found.includes(c))}
          found={found}
          findableNow={devFindable}
          onTap={devProve}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD.bg,
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    // the card's own candy ledge (web: 0 6px 0 --card-edge)
    boxShadow: `0 6px 0 ${CARD.edge}`,
  },
  cellWell: {
    position: 'absolute',
    backgroundColor: CARD.well,
    // flat — the border 'inset' approximation drew 30 hard dark lines
  },
  tilesFaded: {
    opacity: 0, // the keyboard layer owns the card during the finale
  },
  noDay: {
    padding: 32,
    alignItems: 'center',
  },
  noDayText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#9DA2B3',
  },
});
