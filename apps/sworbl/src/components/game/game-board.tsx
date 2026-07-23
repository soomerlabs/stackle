// The daily board — engine-dealt, tier-2 traced (PHASE2 #1-#6).
// The ENGINE decides (deal, validation targets, clue banking); this component acts.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import engine from '@sworbl/engine';
import { GameTile } from './game-tile';
import TraceConnector from './trace-connector';
import { ClueFan } from './clue-fan';
import { COLS, ROWS, type TileT, type TraceTile } from '@/game/types';
import { PALETTE } from '@/game/palette';
import { dealDaily, settle, landsInMs, type DailyDeal } from '@/game/daily';
import { dict, prefixMap, scoreWord } from '@/game/dict';
import { beginW, moveW, type TraceCtx } from '@/game/trace';
import { haptic } from '@/game/haptics';

interface Props {
  size: number;
  gap: number;
  onScore?: (total: number) => void;
}

export function GameBoard({ size, gap, onScore }: Props) {
  const cell = size + gap;
  const boardW = COLS * cell - gap;
  const boardH = ROWS * cell - gap;

  const deal: DailyDeal | null = useMemo(() => dealDaily(), []);
  const [tiles, setTiles] = useState<TileT[]>(() => (deal ? deal.tiles : []));
  const [clearingIds, setClearingIds] = useState<Set<number>>(new Set());
  const [verdict, setVerdict] = useState<{ word: string; pts?: number; ok: boolean; clue?: string } | null>(null);
  const [trace, setTrace] = useState({ word: '', ci: 0 });
  const [jsPath, setJsPath] = useState<TraceTile[]>([]); // web connector mirror
  const [found, setFound] = useState<string[]>([]);
  const scoreRef = useRef(0);

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
        setTimeout(() => setVerdict(null), 900);
        haptic.bad();
        return;
      }
      const pts = scoreWord(word);
      // the ENGINE decides whether this word banks a clue ("trims" banks "trim")
      setFound((cur) => {
        const res = engine.daily.resolveCatch({ found: cur, word, targets: deal.clues });
        if (res.isNew) {
          setVerdict({ word: word.toUpperCase(), pts, ok: true, clue: res.clue });
        } else {
          setVerdict({ word: word.toUpperCase(), pts, ok: true });
        }
        return res.banked;
      });
      setTimeout(() => setVerdict(null), 1200);
      haptic.good();
      scoreRef.current += pts;
      onScore && onScore(scoreRef.current);
      const gone = new Set(ids);
      setClearingIds(gone);
      setTimeout(() => {
        setClearingIds(new Set());
        setTiles((cur) => settle(cur.filter((t) => !gone.has(t.id)), deal.nextLetter));
      }, 240);
    },
    [deal, onScore]
  );

  // ---- the gesture: pure worklets in the hot path (PHASE2 #1/#6) ----
  const pan = useMemo(
    () =>
      Gesture.Pan()
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
        }),
    [ctx, commitWord]
  );

  if (!deal) {
    return (
      <View style={styles.noDay}>
        <Text style={styles.noDayText}>no puzzle for today — content runway empty</Text>
      </View>
    );
  }

  const tracePal = PALETTE[trace.ci] || PALETTE[0];

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.readout}>
        {verdict ? (
          <Text style={[styles.readoutText, { color: verdict.ok ? '#5FD6A8' : '#FF8A8E' }]}>
            {verdict.ok ? `${verdict.word}  +${verdict.pts}` : verdict.word}
            {verdict.clue ? '  ✦ CLUE' : ''}
          </Text>
        ) : trace.word ? (
          <Text style={[styles.readoutText, { color: tracePal.bg }]}>{trace.word.toUpperCase()}</Text>
        ) : (
          <Text style={[styles.readoutText, { color: '#3A3A44' }]}>swipe to spell</Text>
        )}
      </View>

      <GestureDetector gesture={pan}>
        <View style={{ width: boardW, height: boardH }}>
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <View
              key={`bgc${i}`}
              style={[
                styles.cellGhost,
                {
                  width: size,
                  height: size,
                  borderRadius: Math.round(size * 0.27),
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
              clearing={clearingIds.has(t.id)}
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
        </View>
      </GestureDetector>

      <ClueFan clues={deal.clues} found={found} />
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    height: 44,
    justifyContent: 'center',
    marginBottom: 10,
  },
  readoutText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    letterSpacing: 2,
  },
  cellGhost: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#26262E',
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
