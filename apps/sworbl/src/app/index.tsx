// HOME + THE PLAY SHEET. The board is not a page — it's a sheet you PULL UP
// over home (web parity): it follows the finger both directions, release
// springs it open or back down, and closing pauses the round first.
// Home is the HANDOFF REDESIGN (design_handoff_sworbl_screens 3, turns
// 20a/6a/6b): app bar (person · wordmark · settings) → date header → word
// tiles (dashed pre-play, candy after) → hint slots (blank pre-play; folded
// into the superlatives pager after) → floating stepped podium + you-block →
// swipe dock over the storm. Light + dark via the theme tokens.
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';

import Storm from '@/components/game/storm';
import { Floaters } from '@/components/home/floaters';
import { CountdownDock } from '@/components/home/countdown-dock';
import { AppBar } from '@/components/home/app-bar';
import { DateHeader } from '@/components/home/date-header';
import { FloatingPodium } from '@/components/home/floating-podium';
import { SuperlativesPager } from '@/components/home/superlatives-pager';
import { PlaySheet, type PlaySheetHandle } from '@/components/play-sheet';
import { PALETTE, INK, tileColorFor } from '@/game/palette';
import { useTheme } from '@/game/theme';
import { dealDaily } from '@/game/daily';
import { loadDay, type DayState } from '@/game/persist';
import { standingsStub, rankFor } from '@/game/standings';
import { haptic } from '@/game/haptics';

const SHEET_SPRING = { mass: 0.7, damping: 20, stiffness: 180 };

// the six blank hint slots (20a): staggered widths, NO letter-count leak
const HINT_SLOT_W = [62, 58, 64, 60, 58, 62];

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const theme = useTheme();
  const deal = useMemo(() => dealDaily(), []);

  // ---- day state (re-read on focus AND on sheet close) ----
  const [day, setDay] = useState<DayState | null>(null);
  const refreshDay = useCallback(() => {
    if (deal) setDay(loadDay(deal.dayKey));
  }, [deal]);
  useFocusEffect(refreshDay);

  const played = day?.route === 'consumed';
  const solved = played && !!day?.sworb?.solved;
  const inProgress = day?.route === 'resume' || day?.route === 'finale';

  // standings: deterministic day-seeded stub until Supabase lands
  const entries = useMemo(() => (deal ? standingsStub(deal.dayKey) : []), [deal]);
  const myScore = played ? (day?.score ?? 0) : inProgress ? (day?.run?.score ?? 0) : 0;
  const you = played || (inProgress && myScore > 0)
    ? { score: myScore, rank: rankFor(entries, myScore) }
    : null;

  // ---- THE SHEET: position rides the finger ----
  const sheetY = useSharedValue(height); // height = closed, 0 = open
  const [sheetOpen, setSheetOpen] = useState(false); // fully open → home drag off, round armed
  const sheetRef = useRef<PlaySheetHandle>(null);

  const finishClose = useCallback(() => setSheetOpen(false), []);
  const closeSheet = useCallback(() => {
    sheetRef.current?.pauseForClose();
    // AUDIT BLOCKER #1: sheetOpen must flip false SYNCHRONOUSLY at close-start —
    // if it waits for the animation, the arm effect re-fires and the count-in
    // restarts invisibly behind the closed sheet, burning the round
    setSheetOpen(false);
    sheetY.value = withTiming(height, { duration: 260 }, (fin) => {
      'worklet';
      if (fin) runOnJS(finishClose)();
    });
    // day state may have changed inside the round (finish/lock)
    setTimeout(refreshDay, 300);
  }, [height, refreshDay, finishClose]);

  // pull UP from the dock: the sheet (pre-mounted, hidden) rides the finger —
  // pure transform on the UI thread, nothing mounts mid-gesture.
  const markOpen = useCallback(() => {
    setSheetOpen(true);
    haptic.soft(); // the dock beat — launching the game from the bottom
  }, []);
  const openDrag = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!sheetOpen)
        .minDistance(12)
        .onUpdate((e) => {
          'worklet';
          // the sheet's TOP EDGE rides the finger itself (absoluteY), not the
          // translation — otherwise the sheet trails far below the thumb
          sheetY.value = Math.min(height, Math.max(0, e.absoluteY));
        })
        .onEnd((e) => {
          'worklet';
          const risen = height - sheetY.value;
          if (risen > height * 0.22 || e.velocityY < -900) {
            sheetY.value = withSpring(0, SHEET_SPRING);
            runOnJS(markOpen)();
          } else {
            sheetY.value = withTiming(height, { duration: 200 });
          }
        }),
    [height, sheetOpen, markOpen]
  );

  // close drag (home owns sheetY): the round pauses ONLY when the close
  // COMMITS (owner: an aborted swipe-down must not restart the count-in —
  // the round simply never stopped). A mid-drag glimpse can't be traced, so
  // fairness holds.
  const commitClose = useCallback(() => {
    sheetRef.current?.pauseForClose();
    finishClose();
    setTimeout(refreshDay, 300);
  }, [finishClose, refreshDay]);
  const closeDrag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(15)
        .onUpdate((e) => {
          'worklet';
          sheetY.value = Math.min(height, Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > height * 0.25 || e.velocityY > 900) {
            // commit: deactivate NOW (blocker #1 — never let the arm effect
            // re-fire while the sheet slides away)
            runOnJS(commitClose)();
            sheetY.value = withTiming(height, { duration: 220 });
          } else {
            // abort: the round never paused — the sheet just springs back
            sheetY.value = withSpring(0, SHEET_SPRING);
          }
        }),
    [height, commitClose]
  );

  // PERF: transform ONLY — animating border radius on a clipped full-screen
  // view re-clips the whole game subtree every frame (the pull jank). The
  // radius is a constant 22: invisible at dock (dark-on-dark, notch region).
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  // NO BLUR (owner: drag jank — "just delete it"). A plain dark scrim fades
  // with the pull instead: one opacity on one solid view, compositing-only.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, height], [0.55, 0], Extrapolation.CLAMP),
  }));

  const wordLen = deal?.sworb.length ?? 5;
  const tileW = Math.min(46, Math.floor((Math.min(width, 480) - 36 - (wordLen - 1) * 8) / wordLen));
  const tileH = Math.round(tileW * (50 / 46));
  const tileR = Math.round(tileW * (13 / 46));

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {/* fully occluded at dock — stop paying for goo + floaters under an
          opaque sheet */}
      {!sheetOpen && <Floaters width={width} height={height} />}
      {!sheetOpen && (
        <View
          pointerEvents="none"
          style={[
            styles.stormWrap,
            { height: Math.min(280, height * 0.32) },
            played && styles.stormRest,
          ]}>
          <Storm width={width} height={Math.min(280, height * 0.32)} />
        </View>
      )}

      <SafeAreaView style={styles.safe}>
        <AppBar
          theme={theme}
          onSettings={__DEV__ ? () => router.push('/dev') : undefined}
        />

        <View style={styles.content}>
          {deal && <DateHeader theme={theme} dayKey={deal.dayKey} />}

          {/* word of the day: candy bloom when the day is done, dashed
              blanks before (the answer is hidden — no spoilers) */}
          <View style={styles.heroRow}>
            {played && deal
              ? [...deal.sworb].map((ch, i) => {
                  const pal = PALETTE[tileColorFor(ch, i)];
                  return (
                    <Animated.View
                      key={i}
                      entering={ZoomIn.delay(80 + i * 70)}
                      style={[
                        styles.heroBlock,
                        {
                          width: tileW, height: tileH, borderRadius: tileR,
                          backgroundColor: pal.bg,
                          boxShadow: `inset 0 -5px 0 ${pal.edge}, 0 2px 3px rgba(0,0,0,0.3)`,
                        },
                      ]}>
                      <Text style={[styles.heroText, { fontSize: Math.round(tileW * 0.57) }]}>
                        {ch.toUpperCase()}
                      </Text>
                    </Animated.View>
                  );
                })
              : Array.from({ length: wordLen }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.heroBlock,
                      {
                        width: tileW, height: tileH, borderRadius: tileR,
                        borderWidth: 2, borderStyle: 'dashed', borderColor: theme.dashed,
                      },
                    ]}
                  />
                ))}
          </View>
          {played && !solved && (
            <Text style={[styles.missLine, { color: theme.sub }]}>
              not cracked — tomorrow's another sworbl
            </Text>
          )}

          {/* pre-play: six BLANK hint slots (no letter counts, no spoilers).
              post-play the clue intel lives inside the superlatives pager. */}
          {!played && (
            <View style={styles.hintRow}>
              {HINT_SLOT_W.map((w, i) => (
                <View
                  key={i}
                  style={[styles.hintSlot, { width: w, borderColor: theme.dashed }]}
                />
              ))}
            </View>
          )}

          {played && deal && (
            <SuperlativesPager
              theme={theme}
              bestWords={day?.bestWords ?? []}
              foundClues={day?.found ?? []}
              clues={deal.clues}
            />
          )}

          <FloatingPodium theme={theme} entries={entries} you={you} />
        </View>

        {/* the swipe-to-play GRAB ZONE is the dock area only (owner call) —
            a generous reach above the chevron, not the whole screen */}
        <GestureDetector gesture={openDrag}>
          <View style={styles.dockZone}>
            <CountdownDock played={played} />
          </View>
        </GestureDetector>
      </SafeAreaView>

      {/* dark scrim under the rising sheet (blur deleted — owner call) */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
      />

      {/* THE SHEET — pre-mounted hidden below the screen; drags are pure transform */}
      {deal && (
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <PlaySheet ref={sheetRef} onClose={closeSheet} active={sheetOpen} closeGesture={closeDrag} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: '#000000',
  },
  stormWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  stormRest: {
    opacity: 0.4, // resting storm after the day is played
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
    gap: 16,
    alignItems: 'center',
  },
  dockZone: {
    paddingTop: 90, // generous grab reach above the chevron
    marginTop: -90,
  },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#101014',
    overflow: 'hidden',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    zIndex: 20,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  heroBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: INK,
    includeFontPadding: false,
  },
  missLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    marginTop: -6,
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  hintSlot: {
    height: 33,
    borderRadius: 11,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});
