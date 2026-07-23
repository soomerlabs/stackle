// The play screen — the ONE game's full arc with persistence:
//   count-in → live hunt (pause/auto-pause, snapshot on every change) →
//   finale (snapshot per guess) → reveal (day locked, one shot).
// Boot routes through the engine (consumed → resume → finale → fresh).
// Clock model: accumulated boardElapsedMs (engine.run.remainingSecs derives the
// display) — resume RE-ARMS the count-in, never jumps to a running clock.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppState, StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import engine from '@sworbl/engine';

import { GameBoard } from '@/components/game/game-board';
import { CountIn } from '@/components/game/count-in';
import { Finale, type FinaleRestore } from '@/components/game/finale';
import { ResultView } from '@/components/game/result-view';
import { PauseCover } from '@/components/game/pause-cover';
import Storm from '@/components/game/storm';
import { BG_DARK } from '@/game/palette';
import { dealDaily } from '@/game/daily';
import { CLUE_COUNT, type TileT } from '@/game/types';
import { loadDay, saveProgress, finishDay, saveRun, type RunSnap } from '@/game/persist';

const ROUND_SECS = 420; // "the Seven" — dev knob arrives with the settings screen

type Phase = 'countin' | 'live' | 'paused' | 'finale' | 'done';

export default function PlayScreen() {
  const { width, height } = useWindowDimensions();

  const deal = useMemo(() => dealDaily(), []);
  const boot = useMemo(() => (deal ? loadDay(deal.dayKey) : null), [deal]);
  const route = boot?.route ?? 'fresh';

  // a resumed run re-enters through the pause cover; a killed finale re-enters the finale
  const [phase, setPhase] = useState<Phase>(
    route === 'consumed' ? 'done' : route === 'resume' ? 'paused' : route === 'finale' ? 'finale' : 'countin'
  );
  const [countInMounted, setCountInMounted] = useState(route === 'fresh');
  const bootedFromKill = useRef(route === 'resume');
  const [score, setScore] = useState(boot?.run ? boot.run.score : route === 'consumed' ? boot!.score : 0);
  const [found, setFound] = useState<string[]>(boot?.run ? boot.run.found : boot ? boot.found : []);
  const [result, setResult] = useState<{ solved: boolean; guessesUsed: number; bonus: number } | null>(
    route === 'consumed' ? (boot!.sworb ?? { solved: false, guessesUsed: 0, bonus: 0 }) : null
  );
  const finaleRestore = useRef<FinaleRestore | undefined>(
    boot?.run && boot.run.phase === 'finale'
      ? { rows: boot.run.rows, slots: boot.run.slots, colors: boot.run.colors, guessesUsed: boot.run.guessesUsed }
      : undefined
  );

  // restored board state (resume route) — injected into GameBoard once
  const initialTiles = useMemo<TileT[] | undefined>(() => {
    if (!boot?.run || boot.run.phase !== 'live') return undefined;
    if (deal) deal.setQueueIdx(boot.run.queueIdx); // the SAME letter stream continues
    return boot.run.tiles.map((t) => ({ ...t, spawnDrop: 0, bornAt: Date.now() }));
  }, [boot, deal]);

  // ---- clock: accumulated elapsed ms; live time measured from liveStart ----
  const elapsedBaseRef = useRef(boot?.run ? boot.run.boardElapsedMs : 0);
  const liveStartRef = useRef(0);
  const elapsedNow = () =>
    elapsedBaseRef.current + (liveStartRef.current ? Date.now() - liveStartRef.current : 0);
  const [remaining, setRemaining] = useState(() =>
    engine.run.remainingSecs(ROUND_SECS, elapsedBaseRef.current)
  );

  useEffect(() => {
    if (phase !== 'live') return;
    const h = setInterval(() => {
      const left = engine.run.remainingSecs(ROUND_SECS, elapsedNow());
      setRemaining(left);
      if (left <= 0) {
        liveStartRef.current = 0;
        setPhase('finale');
      }
    }, 250);
    return () => clearInterval(h);
  }, [phase]);

  // ---- run snapshots ----
  const boardTilesRef = useRef<TileT[]>(initialTiles ?? deal?.tiles ?? []);
  const queueIdxRef = useRef(boot?.run?.queueIdx ?? 0);
  const snapLive = useCallback(() => {
    if (!deal) return;
    const snap: RunSnap = {
      client: 'rn', v: 1, day: deal.dayKey, phase: 'live',
      tiles: boardTilesRef.current.map(({ id, letter, col, row, ci }) => ({ id, letter, col, row, ci })),
      queueIdx: queueIdxRef.current,
      score, found, boardElapsedMs: elapsedNow(),
      guessesUsed: 0, rows: [], slots: [], colors: [],
    };
    saveRun(snap);
  }, [deal, score, found]);

  const onTiles = useCallback((tiles: TileT[], queueIdx: number) => {
    boardTilesRef.current = tiles;
    queueIdxRef.current = queueIdx;
  }, []);

  // persist progress + live snapshot on every meaningful change
  useEffect(() => {
    if (!deal || phase === 'done') return;
    saveProgress(deal.dayKey, score, found);
    if (phase === 'live') snapLive();
  }, [deal, phase, score, found]);

  const onFinaleProgress = useCallback(
    (s: FinaleRestore) => {
      if (!deal) return;
      finaleRestore.current = s;
      const snap: RunSnap = {
        client: 'rn', v: 1, day: deal.dayKey, phase: 'finale',
        tiles: boardTilesRef.current.map(({ id, letter, col, row, ci }) => ({ id, letter, col, row, ci })),
        queueIdx: queueIdxRef.current,
        score, found, boardElapsedMs: ROUND_SECS * 1000,
        guessesUsed: s.guessesUsed, rows: s.rows, slots: s.slots, colors: s.colors,
      };
      saveRun(snap);
    },
    [deal, score, found]
  );

  // entering the finale marks the snapshot phase (a kill during guessing re-enters here)
  useEffect(() => {
    if (phase === 'finale' && deal) {
      onFinaleProgress(
        finaleRestore.current ?? { rows: [], slots: [], colors: [], guessesUsed: 0 }
      );
    }
  }, [phase]);

  // ---- pause / resume (engine rule: resume re-arms the count-in) ----
  const pause = useCallback(() => {
    if (phase !== 'live') return;
    elapsedBaseRef.current = elapsedNow();
    liveStartRef.current = 0;
    snapLive();
    setPhase('paused');
  }, [phase, snapLive]);

  const resumeTap = useCallback(() => {
    bootedFromKill.current = false;
    setCountInMounted(true);
    setPhase('countin');
  }, []);

  const onRelease = useCallback(() => {
    liveStartRef.current = Date.now();
    setRemaining(engine.run.remainingSecs(ROUND_SECS, elapsedBaseRef.current));
    setPhase('live');
  }, []);

  // auto-pause: backgrounding mid-hunt pauses and snapshots (fairness + safety)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') pause();
    });
    return () => sub.remove();
  }, [pause]);

  const onFinaleDone = useCallback(
    (r: { solved: boolean; guessesUsed: number; bonus: number }) => {
      setResult(r);
      const finalScore = score + (r.bonus > 0 ? r.bonus : 0);
      if (r.bonus > 0) setScore(finalScore);
      // the day ends exactly once: result written, then the DONE lock (clears the run)
      if (deal) {
        finishDay(deal.dayKey, finalScore, found, {
          guessesUsed: r.guessesUsed,
          solved: r.solved,
          bonus: r.bonus,
        });
      }
      setPhase('done');
    },
    [deal, score, found]
  );

  const tile = Math.min(64, Math.floor((Math.min(width, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const onBoard = phase === 'countin' || phase === 'live' || phase === 'paused';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Storm width={width} height={Math.min(280, height * 0.32)} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <Text style={styles.brand}>sworbl</Text>
          {onBoard && (
            // tap = pause · dev shortcut: long-press → straight to the finale
            <Pressable onPress={pause} onLongPress={() => setPhase('finale')} delayLongPress={600}>
              <Text style={[styles.clock, remaining <= 60 && styles.clockLow]}>{clock}</Text>
            </Pressable>
          )}
          <Text style={styles.score}>{score.toLocaleString()}</Text>
        </View>

        <View style={styles.center}>
          {onBoard && deal && (
            <View pointerEvents={phase === 'live' ? 'auto' : 'none'}>
              <GameBoard
                deal={deal}
                size={tile}
                gap={gap}
                initialTiles={initialTiles}
                initialFound={boot?.run?.found}
                initialScore={boot?.run?.score}
                onScore={setScore}
                onClues={setFound}
                onTiles={onTiles}
              />
              {countInMounted && phase === 'countin' && (
                <CountIn onRelease={onRelease} onUnmount={() => setCountInMounted(false)} />
              )}
              {phase === 'paused' && (
                <PauseCover clock={clock} fresh={bootedFromKill.current} onResume={resumeTap} />
              )}
            </View>
          )}
          {phase === 'finale' && deal && (
            <Finale
              entry={{ sworb: deal.sworb }}
              foundCount={found.length}
              clueTotal={CLUE_COUNT}
              size={tile}
              restore={finaleRestore.current}
              onProgress={onFinaleProgress}
              onDone={onFinaleDone}
            />
          )}
          {phase === 'done' && deal && result && (
            <ResultView
              word={deal.sworb}
              definition={deal.definition}
              solved={result.solved}
              guessesUsed={result.guessesUsed}
              score={score}
              bonus={result.bonus}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  safe: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  brand: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#A78BFA',
  },
  clock: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#EDEFF7',
    fontVariant: ['tabular-nums'],
  },
  clockLow: {
    color: '#FF8A8E',
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#EDEFF7',
    fontVariant: ['tabular-nums'],
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
