// The bottom dock: unplayed → bobbing chevron + "swipe to play" over the brewing
// storm; played → the next-puzzle countdown (engine msToNextDay, H:MM:SS).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSpring, withDelay, Easing,
} from 'react-native-reanimated';
import engine from '@sworbl/engine';
import { type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/game/theme';
import { TracePlay } from './trace-play';

function nextIn(): string {
  const ms = engine.core.msToNextDay(new Date());
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function CountdownDock({ played, sLit, sPoke, armed, tile, gap }: {
  played: boolean;
  sLit?: SharedValue<number>;
  sPoke?: SharedValue<number>; // out-of-sequence tap → that tile shakes its head
  armed?: boolean; // PLAY traced → the chevron takes over (swipe unlocked)
  tile?: number;
  gap?: number;
}) {
  const theme = useTheme();
  const [clock, setClock] = useState(nextIn);
  useEffect(() => {
    if (!played) return;
    const h = setInterval(() => setClock(nextIn()), 1000);
    return () => clearInterval(h);
  }, [played]);

  // the ARM POSE: 0 = PLAY tiles · 1 = chevron. A sprung crossfade (shared
  // values, never layout animations) — tiles drift up and give way as the
  // chevron springs in from below; the reverse plays on disarm.
  const sPose = useSharedValue(armed ? 1 : 0);
  useEffect(() => {
    // arm: the chevron arrives AFTER the word has flown (the tiles own their
    // exit); disarm: it leaves at once so the rain lands on a clear stage
    sPose.value = armed
      ? withDelay(320, withSpring(1, { mass: 0.6, damping: 15, stiffness: 240 }))
      : withSpring(0, { mass: 0.6, damping: 18, stiffness: 260 });
  }, [armed]);
  const chevPose = useAnimatedStyle(() => ({
    opacity: sPose.value,
    transform: [{ translateY: (1 - sPose.value) * 16 }, { scale: 0.85 + sPose.value * 0.15 }],
  }));
  // FIRST-RUN COACH (audit: bare P·L·A·Y tiles carried zero instruction
  // until AFTER a successful trace) — the un-armed pose wears the hint,
  // inverse of the chevron so exactly one caption ever shows
  const hintPose = useAnimatedStyle(() => ({
    opacity: (1 - sPose.value) * 0.85,
  }));

  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value * -7 }],
    opacity: 0.55 + bob.value * 0.45,
  }));

  return (
    <View pointerEvents="none" style={styles.wrap}>
      {played ? (
        <View key="count" style={styles.face}>
          {/* just the clock (owner) — the countdown IS the message */}
          <Text style={[styles.nextClock, { color: theme.ink }]}>{clock}</Text>
        </View>
      ) : (
        <View key="trace" style={[styles.face, { height: (tile ?? 48) + 32 }]}>
          {/* BOTH faces stay mounted — the pose crossfades them (gratifying
              morph both directions, owner) */}
          {sLit && (
            <View style={styles.pose}>
              <TracePlay
                sLit={sLit} sPoke={sPoke} theme={theme} tile={tile ?? 48} gap={gap ?? 8}
                armed={!!armed}
              />
            </View>
          )}
          <Animated.View style={[styles.pose, chevPose]} pointerEvents="none">
            <Animated.Text style={[styles.chev, bobStyle]}>︿</Animated.Text>
            <Text style={[styles.swipeLabel, { color: theme.ink }]}>swipe up to start</Text>
          </Animated.View>
          <Animated.View style={[styles.hintPose, hintPose]} pointerEvents="none">
            <Text style={[styles.hintLabel, { color: theme.ink }]}>swipe to play</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hintPose: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -12, // below the tiles, off the screen edge (owner: -24 sat too low)
    alignItems: 'center',
  },
  // the brand's own face (owner: "swipe to play in the sworbl font")
  hintLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  wrap: {
    alignItems: 'center',
    gap: 2,
  },
  // stretched: with BOTH poses absolute, an auto-width face collapses to
  // zero and takes the children's geometry with it
  face: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  // pinned on BOTH axes — absolute placement without full insets diverges
  // between yoga-native and web (the chevron face vanished / the label
  // crunched); fully determinate = identical everywhere
  pose: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chev: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    color: '#8971FF',
    lineHeight: 30,
  },
  swipeLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#9DA2B3',
  },
  nextClock: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    color: '#EDEFF7',
    fontVariant: ['tabular-nums'],
  },
});
