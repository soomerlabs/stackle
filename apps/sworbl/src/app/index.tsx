// HOME + THE PLAY SHEET. The board is not a page — it's a sheet you PULL UP
// over home (web parity): it follows the finger both directions, release
// springs it open or back down, and closing pauses the round first.
// Home is the HANDOFF REDESIGN (design_handoff_sworbl_screens 3, turns
// 20a/6a/6b): app bar (person · wordmark · settings) → date header → word
// tiles (dashed pre-play, candy after) → hint slots (blank pre-play; folded
// into the superlatives pager after) → floating stepped podium + you-block →
// swipe dock over the storm. Light + dark via the theme tokens.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
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
import { ARCHETYPE_LABEL } from '@/components/game/result-view';
import { PALETTE, INK, tileColorFor } from '@/game/palette';
import { useTheme } from '@/game/theme';
import { dealDaily, getDevDay } from '@/game/daily';
import { loadDay, saveSheetOpen, wasSheetOpen, type DayState } from '@/game/persist';
import { standingsStub, rankFor } from '@/game/standings';
import { useDayKey } from '@/game/use-day-key';
import { haptic } from '@/game/haptics';

const SHEET_SPRING = { mass: 0.7, damping: 20, stiffness: 180 };

const twistLabel = (a: string) => ARCHETYPE_LABEL[a] ?? null;

// the six blank hint slots: staggered widths, NO letter-count leak. SMALLER
// than the hero word blocks in both axes (owner: the placeholders were
// out-measuring the word of the day — the hierarchy was upside down)
const HINT_SLOT_W = [40, 36, 44, 38, 36, 42];

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const theme = useTheme();

  // DAY ROLLOVER (audit blocker fix): the deal follows the calendar, not the
  // process lifetime. Policy: never re-deal mid-round — a day flip while the
  // sheet is open HOLDS yesterday's board until the sheet closes (the round
  // finishes honestly against yesterday's keys), then the new day arrives.
  const dayKey = useDayKey();
  const [activeDayKey, setActiveDayKey] = useState(dayKey);
  // devDay: __DEV__ playtest override — reading it during render means the
  // focus-refresh after returning from /dev picks up a changed override
  const devDay = getDevDay();
  const deal = useMemo(() => dealDaily(), [activeDayKey, devDay]);

  // (rollover gate lives below the sheet state — it must see sheetOpen)

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

  // ---- UI RESTORATION (owner): killed-in-background with the board open →
  // relaunch OPENS the sheet again, paused (tap-to-resume cover). Decided
  // SYNCHRONOUSLY before first render so the sheet never animates in and the
  // arm effect never sees a fake dock edge. Next-day relaunch: wasSheetOpen
  // discards the stale flag, and the day-keyed run snapshot can't load for
  // the new day anyway — fresh home, new board.
  const bootOpen = useMemo(() => {
    if (!deal) return false;
    if (!wasSheetOpen(deal.dayKey)) return false;
    const d = loadDay(deal.dayKey);
    return d.route === 'resume' || d.route === 'finale';
  }, [deal]);

  // ---- THE SHEET: position rides the finger ----
  const sheetY = useSharedValue(bootOpen ? 0 : height); // height = closed, 0 = open
  const [sheetOpen, setSheetOpen] = useState(bootOpen); // fully open → home drag off, round armed
  const sheetRef = useRef<PlaySheetHandle>(null);

  // the rollover gate: adopt the new day only while no round is in flight
  useEffect(() => {
    if (dayKey !== activeDayKey && !sheetOpen) setActiveDayKey(dayKey);
  }, [dayKey, activeDayKey, sheetOpen]);

  // SELF-HEAL (hot-reload stranding): Reanimated PRESERVES shared values
  // across Fast Refresh while React state resets — a refresh mid-open left
  // sheetY at 0 with sheetOpen false, parking the sheet over the whole
  // screen and eating every touch ("swipe up broken", "stuck on top").
  // Whenever the sheet is logically closed, its position must agree.
  useEffect(() => {
    if (!sheetOpen) sheetY.value = height;
  }, [sheetOpen, height]);

  const finishClose = useCallback(() => {
    setSheetOpen(false);
    saveSheetOpen(null); // a closed sheet must never restore
  }, []);
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
    if (deal) saveSheetOpen(deal.dayKey); // reclaim-proof: the sheet remembers
    haptic.soft(); // the dock beat — launching the game from the bottom
  }, [deal]);
  // a CONSUMED day is closed for business (owner): the dock is just the
  // countdown — the swipe doesn't react, the sheet never opens again
  const openDrag = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!sheetOpen && !played)
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
    [height, sheetOpen, played, markOpen]
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
  // 46 was the 300px design-mock cap — real phones earn bigger blocks; the
  // word of the day is the hero and must dominate everything under it
  const tileW = Math.min(56, Math.floor((Math.min(width, 480) - 36 - (wordLen - 1) * 8) / wordLen));
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
          onPerson={() => router.push('/profile')}
          onSettings={() => router.push('/settings')}
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
          {played && deal?.archetype && twistLabel(deal.archetype) && (
            <View style={styles.twistPill}>
              <Text style={styles.twistText}>today's twist: {twistLabel(deal.archetype)}</Text>
            </View>
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

          {/* flex springs: pre-play the column is short (header + tiles +
              hints + standings) and everything pooled at the top (owner:
              "top heavy"). The springs float the standings into the leftover
              space; on full recap days they collapse to zero. */}
          <View style={styles.spring} />
          <Pressable style={styles.podiumTap} onPress={() => router.push('/leaderboard')}>
            <FloatingPodium theme={theme} entries={entries} you={you} />
          </Pressable>
          <View style={styles.springSmall} />
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
          <PlaySheet
            key={deal.dayKey}
            ref={sheetRef}
            onClose={closeSheet}
            active={sheetOpen}
            closeGesture={closeDrag}
          />
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
    paddingTop: 16,
    gap: 22,
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
  twistPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(137,113,255,0.14)',
    marginTop: -4,
  },
  twistText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#8971FF',
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  podiumTap: {
    alignSelf: 'stretch',
  },
  // gentle float: a THIRD of the leftover above the standings, the rest
  // below (owner round 2: full split was "too much space")
  spring: {
    flexGrow: 0.3,
  },
  springSmall: {
    flexGrow: 0.7,
  },
  hintSlot: {
    height: 33,
    borderRadius: 11,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});
