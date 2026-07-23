// The play screen — the ONE game's full arc:
//   count-in (3·2·1·GO) → live round (7:00 hunt) → finale (6 guesses) → reveal.
// Phase 2 increment 2. Persistence/one-shot-per-day lands with the MMKV seam.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { GameBoard } from '@/components/game/game-board';
import { CountIn } from '@/components/game/count-in';
import { Finale } from '@/components/game/finale';
import { ResultView } from '@/components/game/result-view';
import Storm from '@/components/game/storm';
import { BG_DARK } from '@/game/palette';
import { dealDaily } from '@/game/daily';
import { CLUE_COUNT } from '@/game/types';

const ROUND_SECS = 420; // "the Seven" — dev knob arrives with the settings screen

type Phase = 'countin' | 'live' | 'finale' | 'done';

export default function PlayScreen() {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('countin');
  const [countInMounted, setCountInMounted] = useState(true);
  const [score, setScore] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(ROUND_SECS);
  const [result, setResult] = useState<{ solved: boolean; guessesUsed: number; bonus: number } | null>(null);
  const endAtRef = useRef<number>(0);

  // deal info for the finale/result (the board deals identically off the same day)
  const deal = useMemo(() => dealDaily(), []);

  // clock: anchored at GO, ticks while live, 0:00 → finale
  useEffect(() => {
    if (phase !== 'live') return;
    const h = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setPhase('finale');
    }, 250);
    return () => clearInterval(h);
  }, [phase]);

  const onRelease = useCallback(() => {
    endAtRef.current = Date.now() + ROUND_SECS * 1000;
    setRemaining(ROUND_SECS);
    setPhase('live');
  }, []);

  const onFinaleDone = useCallback(
    (r: { solved: boolean; guessesUsed: number; bonus: number }) => {
      setResult(r);
      if (r.bonus > 0) setScore((s) => s + r.bonus);
      setPhase('done');
    },
    []
  );

  const tile = Math.min(64, Math.floor((Math.min(width, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Storm width={width} height={Math.min(280, height * 0.32)} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <Text style={styles.brand}>sworbl</Text>
          {(phase === 'live' || phase === 'countin') && (
            // dev shortcut: long-press the clock → straight to the finale
            <Pressable onLongPress={() => setPhase('finale')} delayLongPress={600}>
              <Text style={[styles.clock, remaining <= 60 && styles.clockLow]}>{clock}</Text>
            </Pressable>
          )}
          <Text style={styles.score}>{score.toLocaleString()}</Text>
        </View>

        <View style={styles.center}>
          {(phase === 'countin' || phase === 'live') && (
            <View pointerEvents={phase === 'live' ? 'auto' : 'none'}>
              <GameBoard size={tile} gap={gap} onScore={setScore} onClues={setFound} />
              {countInMounted && phase === 'countin' && (
                <CountIn onRelease={onRelease} onUnmount={() => setCountInMounted(false)} />
              )}
            </View>
          )}
          {phase === 'finale' && deal && (
            <Finale
              entry={{ sworb: deal.sworb }}
              foundCount={found.length}
              clueTotal={CLUE_COUNT}
              size={tile}
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
