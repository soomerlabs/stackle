// HOME + THE PLAY SHEET. The board is not a page — it's a sheet you PULL UP
// over home (web parity): it follows the finger both directions, home blurs
// in proportion to how far the sheet has risen, release springs it open or
// back down, and closing pauses the round first. v18 home underneath:
// date + score, hero word (candy when done), ghost clue fan, superlatives,
// countdown dock over the brewing/resting storm, floaters.
import React, { useMemo, useRef, useState, useCallback } from 'react';
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
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

import Storm from '@/components/game/storm';
import { ClueFan } from '@/components/game/clue-fan';
import { Floaters } from '@/components/home/floaters';
import { CountdownDock } from '@/components/home/countdown-dock';
import { Superlatives } from '@/components/home/superlatives';
import { PlaySheet, type PlaySheetHandle } from '@/components/play-sheet';
import { Brand } from '@/components/brand';
import { BG_DARK, PALETTE, INK, tileColorFor } from '@/game/palette';
import { dealDaily } from '@/game/daily';
import { loadDay, type DayState } from '@/game/persist';

const SHEET_SPRING = { mass: 0.7, damping: 20, stiffness: 180 };

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const deal = useMemo(() => dealDaily(), []);

  // ---- day state (re-read on focus AND on sheet close) ----
  const [day, setDay] = useState<DayState | null>(null);
  const refreshDay = useCallback(() => {
    if (deal) setDay(loadDay(deal.dayKey));
  }, [deal]);
  useFocusEffect(refreshDay);

  const played = day?.route === 'consumed';
  const solved = played && !!day?.sworb?.solved;

  // ---- THE SHEET: position rides the finger; blur rides the position ----
  const sheetY = useSharedValue(height); // height = closed, 0 = open
  const [sheetOpen, setSheetOpen] = useState(false); // fully open → home drag off, round armed
  const sheetRef = useRef<PlaySheetHandle>(null);

  const openSheet = useCallback(() => {
    setSheetOpen(true);
    sheetY.value = withSpring(0, SHEET_SPRING);
  }, []);
  const finishClose = useCallback(() => setSheetOpen(false), []);
  const closeSheet = useCallback(() => {
    sheetRef.current?.pauseForClose();
    sheetY.value = withTiming(height, { duration: 260 }, (fin) => {
      'worklet';
      if (fin) runOnJS(finishClose)();
    });
    // day state may have changed inside the round (finish/lock)
    setTimeout(refreshDay, 300);
  }, [height, refreshDay, finishClose]);

  // pull UP from the dock: the sheet (pre-mounted, hidden) rides the finger —
  // pure transform on the UI thread, nothing mounts mid-gesture.
  const markOpen = useCallback(() => setSheetOpen(true), []);
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

  // close drag (lives HERE because home owns sheetY; the sheet's top bar wears
  // it): pauses at first movement — fairness — then the sheet rides the finger
  // down; release past 25% (or a flick) commits the close, else springs back.
  const prepClose = useCallback(() => sheetRef.current?.pauseForClose(), []);
  const closeDrag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(15)
        .onStart(() => {
          'worklet';
          runOnJS(prepClose)();
        })
        .onUpdate((e) => {
          'worklet';
          sheetY.value = Math.min(height, Math.max(0, e.translationY));
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > height * 0.25 || e.velocityY > 900) {
            sheetY.value = withTiming(height, { duration: 220 }, (fin) => {
              'worklet';
              if (fin) runOnJS(finishClose)();
            });
          } else {
            sheetY.value = withSpring(0, SHEET_SPRING);
          }
        }),
    [height, prepClose, finishClose]
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
    // soft top corners while mid-drag, square when fully open
    borderTopLeftRadius: interpolate(sheetY.value, [0, height * 0.2], [0, 22]),
    borderTopRightRadius: interpolate(sheetY.value, [0, height * 0.2], [0, 22]),
  }));
  // the background BLURS as the sheet rises (fixed-intensity blur layer whose
  // presence fades in with sheet progress — animatable at 60fps)
  const blurStyle = useAnimatedStyle(() => ({
    // input range MUST ascend (descending = undefined output — the "hazy home"
    // bug): sheet docked (0) → full blur, sheet parked below (height) → zero
    opacity: interpolate(sheetY.value, [0, height * 0.85, height], [1, 0.9, 0]),
  }));

  const dateLine = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();

  const bs = deal ? Math.min(52, Math.floor(280 / deal.sworb.length)) : 48;

  return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <Floaters width={width} height={height} />
        <View style={played ? styles.stormRest : undefined}>
          <Storm width={width} height={Math.min(280, height * 0.32)} />
        </View>

        <SafeAreaView style={styles.safe}>
          <View style={styles.top}>
            {__DEV__ && (
              <Pressable onPress={() => router.push('/dev')} style={styles.gear} hitSlop={10}>
                <Text style={styles.gearText}>⚙</Text>
              </Pressable>
            )}
            <Brand />
            <Text style={styles.date}>{dateLine}</Text>
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>{played ? 'TODAY' : 'SWORBL OF THE DAY'}</Text>
              <Text style={[styles.score, !played && styles.scoreGhost]}>
                {played ? (day?.score ?? 0).toLocaleString() : '0'}
              </Text>
            </View>
          </View>

          <View style={styles.middle}>
            {played && deal ? (
              <View style={styles.heroRow}>
                {[...deal.sworb].map((ch, i) => {
                  const pal = PALETTE[tileColorFor(ch, i)];
                  return (
                    <Animated.View
                      key={i}
                      entering={ZoomIn.delay(80 + i * 70)}
                      style={[
                        styles.heroBlock,
                        {
                          width: bs, height: bs * 1.14, borderRadius: Math.round(bs * 0.25),
                          backgroundColor: pal.bg, boxShadow: `0 3px 0 ${pal.edge}`,
                        },
                      ]}>
                      <Text style={[styles.heroText, { fontSize: Math.round(bs * 0.52) }]}>
                        {ch.toUpperCase()}
                      </Text>
                    </Animated.View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.heroRow}>
                {Array.from({ length: deal?.sworb.length ?? 5 }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.heroBlock, styles.heroGhost,
                      { width: bs, height: bs * 1.14, borderRadius: Math.round(bs * 0.25) },
                    ]}
                  />
                ))}
              </View>
            )}
            {played && !solved && (
              <Text style={styles.missLine}>not cracked — tomorrow's another sworbl</Text>
            )}

            {deal && <ClueFan clues={deal.clues} found={day?.found ?? []} />}

            <View style={styles.supWrap}>
              <Superlatives words={day?.bestWords ?? []} />
            </View>

            {/* no PLAY button — the swipe IS the way in (word-light, owner call);
                the dock's chevron + "swipe to play" is the whole affordance */}
            {played && (
              <Pressable onPress={openSheet} style={styles.resultLink}>
                <Text style={styles.resultLinkText}>see result ›</Text>
              </Pressable>
            )}
          </View>

          {/* the swipe-to-play GRAB ZONE is the dock area only (owner call) —
              a generous reach above the chevron, not the whole screen */}
          <GestureDetector gesture={openDrag}>
            <View style={styles.dockZone}>
              <CountdownDock played={played} />
            </View>
          </GestureDetector>
        </SafeAreaView>

        {/* progressive blur under the rising sheet (always mounted; opacity 0 idle) */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, blurStyle]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>

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
    backgroundColor: BG_DARK,
  },
  stormRest: {
    opacity: 0.4, // v18 resting storm after the day is played
  },
  safe: {
    flex: 1,
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
    backgroundColor: BG_DARK,
    overflow: 'hidden',
    zIndex: 20,
  },
  top: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 20,
  },
  date: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 1.4,
    color: '#5A5A66',
  },
  gear: {
    position: 'absolute',
    right: 18,
    top: 10,
    zIndex: 5,
  },
  gearText: {
    fontSize: 18,
    color: '#5A5A66',
  },
  scoreCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: 'rgba(137,113,255,0.12)',
    borderRadius: 18,
    paddingVertical: 14,
    gap: 2,
  },
  scoreLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: '#9DA2B3',
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 42,
    lineHeight: 46,
    color: '#8971FF',
    fontVariant: ['tabular-nums'],
  },
  scoreGhost: {
    color: '#33333E',
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 16,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 6,
  },
  heroBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGhost: {
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: '#2E2E38',
  },
  heroText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: INK,
    includeFontPadding: false,
  },
  missLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    color: '#9DA2B3',
  },
  supWrap: {
    marginTop: 4,
  },
  resultLink: {
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  resultLinkText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
    color: '#8971FF',
  },
});
