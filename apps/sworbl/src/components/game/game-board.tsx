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
import { loadTokens, saveTokens, type TokenState } from '@/game/hints';
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

  // ---- HINT AIDS: token bank + sonar ping (engine decides, board acts) ----
  const [tokens, setTokens] = useState<TokenState>(() => loadTokens(deal.dayKey));
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
    saveTokens(deal.dayKey, tokens);
  }, [deal.dayKey, tokens]);

  // fire the ping at a clue's STARTING tile (compass, not answer)
  const firePing = useCallback(
    (clue: string, slot: number) => {
      const live = tilesMirror.current.filter((t: TileT) => !clearingMirror.current.has(t.id));
      const path = engine.solver.findWord(live, {
        word: clue,
        expand: engine.core.expandLetter,
        diag: true,
      });
      // fallback: clue path broken by cascades (re-stamp port pending) — ping
      // any tile carrying the clue's first letter rather than staying silent
      const startId: number | undefined = path ? path[0] : live.find((t: TileT) => t.letter === clue[0])?.id;
      const t = startId != null ? live.find((x: TileT) => x.id === startId) : undefined;
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

  // spend: tap a ghost pill while a token is banked
  const onGhostTap = useCallback(
    (clue: string, slot: number) => {
      if (tokens.count <= 0) return;
      if (firePing(clue, slot)) setTokens((t) => ({ ...t, count: t.count - 1 }));
    },
    [tokens.count, firePing]
  );

  // mercy pulse: crossing 2:00 with ≤2 clues found auto-pings, token-free
  const prevSecsRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (secsLeft === undefined) return;
    const prev = prevSecsRef.current;
    prevSecsRef.current = secsLeft;
    if (prev === undefined) return;
    if (
      engine.daily.mercyPulseShouldFire({
        alreadyFired: tokens.mercyFired,
        prevSecsLeft: prev,
        secsLeft,
        cluesFound: found.length,
        thresholdSecs: mercySecs,
      })
    ) {
      const clue = engine.daily.firstUnfoundClue(deal.clues, found);
      if (clue) {
        firePing(clue, deal.clues.indexOf(clue));
        setTokens((t) => ({ ...t, mercyFired: true }));
      }
    }
  }, [secsLeft]);

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
      for (let i = 0; i < p.length; i++) w += p[i].letter;
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
      // token earn (engine one-per-round + threshold rules)
      setTokens((tk) => {
        const words = tk.words + 1;
        const ev = engine.daily.hintTokenEvents({
          wordsSpelledThisRound: words,
          cluesFound: res.banked.length,
          cluesTotal: deal.clues.length,
          tokensEarnedAlready: tk.granted,
        });
        return ev.grant
          ? { ...tk, words, count: tk.count + 1, granted: tk.granted + 1 }
          : { ...tk, words };
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
            word += p[i].letter;
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
      <GestureDetector gesture={pan}>
        <View
          style={[
            styles.card,
            {
              width: boardW + 24,
              paddingBottom: 12 + Math.max(3, Math.round(size * 0.08)),
            },
          ]}>
        {/* overflow hidden: refills fall in from ABOVE the board and must stay
            masked until they enter (web boardCard clip) */}
        <View style={{ width: boardW, height: boardH, overflow: 'hidden' }}>
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
          <TraceConnector
            sPath={sPath}
            jsPath={jsPath}
            size={size}
            gap={gap}
            width={boardW}
            height={boardH}
          />
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
        </View>
      </GestureDetector>

      {tokens.count > 0 && (
        <Text style={styles.tokenLine}>✦ hint ready — tap a dashed clue</Text>
      )}
      <ClueFan clues={deal.clues} found={found} tokenReady={tokens.count > 0} onGhostTap={onGhostTap} />
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
    // sunken read (web: inset 0 3px 5px black) — top-edge shade approximation
    borderTopWidth: 3,
    borderTopColor: 'rgba(0,0,0,0.35)',
  },
  tokenLine: {
    marginTop: 12,
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    letterSpacing: 0.4,
    color: '#F5B84A',
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
