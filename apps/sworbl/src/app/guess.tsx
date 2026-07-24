// THE GUESS SCREEN (owner: "make a new screen and don't even involve the
// gamesheet") — the sworb guess on its own route with the native push.
// Fully sheet-free: intel loads from the day's persisted state, every
// guess parks (kill-safe), done banks and slides home. The sheet's old
// board→keyboard morph is gone from this path entirely.
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GuessStage } from '@/components/game/guess-stage';
import { ScreenBar } from '@/components/screen-bar';
import { ScreenHeader } from '@/components/screen-header';
import { applySwaps, loadSwaps } from '@/game/clue-swaps';
import { activeClues, dealDaily } from '@/game/daily';
import { loadLadder, saveLadder, FINALE_FLOOR } from '@/game/hints';
import { gameSurface } from '@/game/palette';
import {
  loadDay, loadDayWords, saveProgress, recordSworb,
  saveFinaleProgress, loadFinaleProgress, clearFinaleProgress,
} from '@/game/persist';
import { useTheme } from '@/game/theme';
import { enqueueSubmission } from '@/net/standings-remote';

export default function GuessScreen() {
  const theme = useTheme();
  const gs = gameSurface(theme.mode);
  const { width } = useWindowDimensions();

  // ---- day intel, loaded once at entry (the screen is short-lived) ----
  const deal = useMemo(() => dealDaily(), []);
  const boot = useMemo(() => (deal ? loadDay(deal.dayKey) : null), [deal]);
  const [found, setFound] = useState<string[]>(boot?.found ?? []);
  const ctx = useMemo(() => {
    if (!deal) return null;
    return {
      rounds: Math.max(1, boot?.rounds.played ?? 0),
      swapped: applySwaps(deal.clues, loadSwaps(deal.dayKey)),
      nudged: loadLadder(deal.dayKey).nudged,
      restore: loadFinaleProgress(deal.dayKey) ?? undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal]);

  // THE GUESSING FLOOR: entering with fewer than FINALE_FLOOR clues
  // grants up to the floor — once per day, persisted immediately
  const flooredRef = useRef(false);
  if (deal && ctx && !flooredRef.current) {
    flooredRef.current = true;
    const l = loadLadder(deal.dayKey);
    if (!l.floorGiven) {
      saveLadder(deal.dayKey, { ...l, floorGiven: true });
      const need = FINALE_FLOOR - found.length;
      if (need > 0) {
        const grants = ctx.swapped.filter((c) => !found.includes(c)).slice(0, need);
        if (grants.length) {
          const next = [...found, ...grants];
          setFound(next);
          saveProgress(deal.dayKey, boot?.score ?? 0, next);
        }
      }
    }
  }

  const onMiss = useCallback(
    (usedNow: number) => {
      if (usedNow !== 3 || !deal || !ctx) return;
      const l = loadLadder(deal.dayKey);
      if (l.guess3Given) return;
      const clue = ctx.swapped.find((c) => !found.includes(c));
      if (clue) {
        saveLadder(deal.dayKey, { ...l, guess3Given: true });
        setFound((cur) => {
          const next = cur.includes(clue) ? cur : [...cur, clue];
          saveProgress(deal.dayKey, boot?.score ?? 0, next);
          return next;
        });
      }
    },
    [deal, ctx, found, boot]
  );

  const onProgress = useCallback(
    (s: { rows: { letters: string[]; colors: string[] }[]; slots: string[]; colors: (string | null)[]; guessesUsed: number }) => {
      if (deal) saveFinaleProgress(deal.dayKey, s);
    },
    [deal]
  );

  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDone = useCallback(
    (r: { solved: boolean; guessesUsed: number; bonus: number }) => {
      if (!deal) return;
      // bank FIRST (kill-window law) — the celebration is theater over a
      // committed result; home's focus refresh does the reveal
      const sworb = { guessesUsed: r.guessesUsed, solved: r.solved, bonus: r.bonus };
      const dayScore = recordSworb(deal.dayKey, sworb);
      clearFinaleProgress(deal.dayKey);
      enqueueSubmission(
        deal.dayKey, dayScore, sworb, loadDayWords(deal.dayKey),
        Math.max(1, loadDay(deal.dayKey).rounds.played)
      );
      doneTimer.current = setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }, r.solved ? 1600 : 900);
    },
    [deal]
  );

  const tile = Math.min(64, Math.floor((Math.min(width, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe}>
        <ScreenBar theme={theme} />
        <ScreenHeader
          theme={theme}
          eyebrow={`${6 - (boot?.sworb?.guessesUsed ?? 0)} GUESSES LEFT · BONUS SHRINKS EVERY ROUND`}
          title="crack"
          titleAccent="the word"
        />
        <View style={styles.stageWrap}>
          {deal && ctx && (
            <GuessStage
              sworb={deal.sworb}
              archetype={deal.archetype}
              rounds={ctx.rounds}
              restore={ctx.restore}
              found={found}
              clues={activeClues(
                ctx.swapped,
                deal.poolExtras.filter((w) => !ctx.swapped.includes(w)),
                found
              )}
              clueTotal={deal.clues.length}
              nudged={ctx.nudged}
              size={tile}
              gap={gap}
              gs={gs}
              onProgress={onProgress}
              onMiss={onMiss}
              onDone={onDone}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 0 },
  stageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
