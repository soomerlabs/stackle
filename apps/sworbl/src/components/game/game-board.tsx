// The daily board — engine-dealt, tier-2 traced (PHASE2 #1-#6).
// The ENGINE decides (deal, validation targets, clue banking); this component acts.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { useSharedValue, useAnimatedReaction, runOnJS, runOnUI } from 'react-native-reanimated';
import engine from '@sworbl/engine';
import { GameTile } from './game-tile';
import TraceConnector from './trace-connector';
import { ClueFan } from './clue-fan';
import { COLS, ROWS, type TileT, type TraceTile } from '@/game/types';
import { PALETTE, CARD } from '@/game/palette';
import { settle, restampBroken, landsInMs, type DailyDeal } from '@/game/daily';
import { dict, prefixMap, scoreWord } from '@/game/dict';
import { beginW, moveW, type TraceCtx } from '@/game/trace';
import { haptic } from '@/game/haptics';
import { loadLadder, saveLadder, NUDGE_AT_WORDS, FREE_CLUE_AT_WORDS, FINALE_FLOOR, type HintLadder } from '@/game/hints';
import { PingRings } from './ping-rings';
import { StepperCard } from './stepper-card';

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
}

export function GameBoard({
  deal, size, gap, initialTiles, initialFound, initialScore, secsLeft, onScore, onClues, onTiles, onWordSpelled, mercySecs, gestureRef,
}: Props) {
  const cell = size + gap;
  const boardW = COLS * cell - gap;
  const boardH = ROWS * cell - gap;

  const [tiles, setTiles] = useState<TileT[]>(() => initialTiles ?? deal.tiles);
  // id → position-in-swipe (pop stagger rides the seq; web clearSeq)
  const [clearingIds, setClearingIds] = useState<Map<number, number>>(new Map());
  const [verdict, setVerdict] = useState<{ word: string; pts?: number; ok: boolean; clue?: string } | null>(null);
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
    for (const clue of deal.clues) {
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
    firePing(clue, deal.clues.indexOf(clue));
    setVerdict({ word: clue.toUpperCase(), ok: true, clue });
    setTimeout(() => setVerdict(null), 1400);
    haptic.good();
    return true;
  }, [findableUnfound, firePing, deal]);

  // FINALE FLOOR: the clock is dying — enter the guess round with at least 2
  useEffect(() => {
    if (secsLeft === undefined || secsLeft > 0) return;
    if (ladder.floorGiven) return;
    setLadder((l) => ({ ...l, floorGiven: true }));
    let need = FINALE_FLOOR - foundRef.current.length;
    while (need > 0 && grantFreeClue()) need--;
  }, [secsLeft, ladder.floorGiven, grantFreeClue]);

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
      if (!deal || ids.length < 3) return;
      if (!dict().has(word)) {
        setVerdict({ word: word.toUpperCase(), ok: false });
        // the WAVE-NO: seq = position in the swipe (drain sweeps head→back)
        setNope((n) => ({
          key: n.key + 1,
          seqs: new Map(ids.map((id, i) => [id, i])),
          total: ids.length,
        }));
        setTimeout(() => setVerdict(null), 900);
        haptic.bad();
        return;
      }
      const pts = scoreWord(word);
      // the ENGINE decides whether this word banks a clue ("trims" banks "trim")
      const res = engine.daily.resolveCatch({ found: foundRef.current, word, targets: deal.clues });
      setVerdict(
        res.isNew
          ? { word: word.toUpperCase(), pts, ok: true, clue: res.clue ?? undefined }
          : { word: word.toUpperCase(), pts, ok: true }
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
            firePing(clue, deal.clues.indexOf(clue));
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
        setTiles((cur) => {
          const { tiles: settled, added } = settle(cur.filter((t) => !gone.has(t.id)), deal.nextLetter);
          // web parity: broken un-found clues ride back in on the refill
          const unfound = deal.clues.filter(
            (c) => !foundRef.current.includes(c) && !playedRef.current.has(c)
          );
          return restampBroken({ deal, tiles: settled, added, unfound });
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
      {/* THE STEPPER (web hopperCard) — ABOVE the board, like the web */}
      <StepperCard width={boardW + 24} traceWord={trace.word} verdict={verdict} />

      {/* THE BOARD CARD (web boardCardStyle): tiles live ON a card with sunken
          cell wells — not floating on the screen background */}
        <View
          style={[
            styles.card,
            {
              width: boardW + 24,
              paddingBottom: 12 + Math.max(3, Math.round(size * 0.08)),
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
              nope={nope.seqs.has(t.id) ? nope.key : 0}
              nopeSeq={nope.seqs.get(t.id) ?? 0}
              nopeTotal={nope.total}
            />
          ))}
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
        </View>
        </GestureDetector>
        </View>
        </View>

      <ClueFan clues={deal.clues} found={found} nudged={ladder.nudged} />
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
