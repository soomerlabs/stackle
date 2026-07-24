// THE GUESS SCREEN (owner: "make a new screen and don't even involve the
// gamesheet") — the sworb guess on its own route with the native push.
// Fully sheet-free: intel loads from the day's persisted state, every
// guess parks (kill-safe), done banks and slides home. The sheet's old
// board→keyboard morph is gone from this path entirely.
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GuessStage } from '@/components/game/guess-stage';
import { applySwaps, loadSwaps } from '@/game/clue-swaps';
import { activeClues, dealDaily } from '@/game/daily';
import { loadLadder, saveLadder, FINALE_FLOOR } from '@/game/hints';
import { gameSurface } from '@/game/palette';
import {
  loadDay, loadDayWords, saveProgress, recordSworb,
  saveFinaleProgress, loadFinaleProgress, clearFinaleProgress,
} from '@/game/persist';
import { useTheme } from '@/game/theme';
import { spendPoints } from '@/net/duels';
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
  // grants up to the floor — once per day. In an EFFECT (audit: storage
  // writes + setState in the render body hitched the sheet's present).
  const flooredRef = useRef(false);
  useEffect(() => {
    if (!deal || !ctx || flooredRef.current) return;
    flooredRef.current = true;
    const l = loadLadder(deal.dayKey);
    if (l.floorGiven) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal, ctx]);

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

  // THE PAID HINT: 25 ✦ reveals one clue — and the ENGINE charges it
  // again (foundCount rises → the reward tier drops). Fair by design.
  const [hintState, setHintState] = useState<'idle' | 'busy' | 'poor' | 'done'>('idle');
  const unfound = ctx ? ctx.swapped.filter((c) => !found.includes(c)) : [];
  const buyHint = useCallback(async () => {
    if (!deal || !ctx || hintState === 'busy' || !unfound.length) return;
    setHintState('busy');
    const r = await spendPoints('hint');
    if (r === 'poor') {
      setHintState('poor');
      return;
    }
    if (r === 'error') {
      setHintState('idle');
      return;
    }
    const clue = unfound[0];
    setFound((cur) => {
      const next = cur.includes(clue) ? cur : [...cur, clue];
      saveProgress(deal.dayKey, boot?.score ?? 0, next);
      return next;
    });
    setHintState('done');
    setTimeout(() => setHintState('idle'), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal, ctx, hintState, unfound, boot]);

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
        {/* nothing above the stepper (owner) — the stage IS the sheet */}
        <View style={styles.stageWrap}>
          {deal && ctx && (
            <GuessStage
              sworb={deal.sworb}
              hint={deal.hint}
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
        {/* THE PAID HINT (owner economy): one clue for 25 ✦ — the tier
            drop is the second half of the price */}
        {unfound.length > 0 && (
          <Pressable
            onPress={buyHint}
            disabled={hintState === 'busy'}
            style={[styles.hintBtn, { backgroundColor: theme.card }]}>
            <Text style={[styles.hintBtnText, { color: hintState === 'poor' ? '#F58A66' : theme.ink }]}>
              {hintState === 'busy'
                ? 'revealing…'
                : hintState === 'poor'
                  ? 'not enough points'
                  : hintState === 'done'
                    ? 'clue revealed ✦'
                    : 'reveal a clue · 25 ✦ (lowers the bonus)'}
            </Text>
          </Pressable>
        )}
        {/* the decay truth, where the choice is live (audit: it vanished
            with the in-sheet finale) */}
        <Text style={[styles.bailLine, { color: theme.faint }]}>
          swipe down to bail — guesses keep, but the bonus shrinks every round
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hintBtn: {
    alignSelf: 'center',
    borderRadius: 12, borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginBottom: 8,
  },
  hintBtnText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    letterSpacing: 0.3,
  },
  bailLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    textAlign: 'center',
    paddingBottom: 10,
    paddingHorizontal: 24,
  },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 0 },
  stageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
