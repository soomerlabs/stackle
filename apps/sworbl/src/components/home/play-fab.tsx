// THE HOCKEY-STICK FAB (owner, modes-spec: "PL across—no, P then LAY
// going UP... the gameboard already coming up, fluid") — the corner
// launcher. P sits at the corner, L·A·Y climb the edge; tracing past P
// turns the corner and the finger's rise SCRUBS the sheet directly.
// Release past the commit line = open; short of it = spring home.
// Radiance (owner): aurora candy glow breathes off the blocks — the
// only affordance. All motion is UI-thread shared values.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, useAnimatedReaction,
  withSpring, withTiming, withRepeat, Easing, runOnJS, interpolate, Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';

import { haptic } from '@/game/haptics';
import { PALETTE, INK } from '@/game/palette';

const TILE = 42;
const GAP = 7;
const CELL = TILE + GAP;
const LETTERS = ['p', 'l', 'a', 'y'] as const; // p at the BOTTOM — the word rises
const PALS = [0, 1, 2, 3]; // violet · cyan · mint · pink

interface Props {
  sheetY: SharedValue<number>;
  closedY: number;
  commitFrac?: number; // fraction of travel that commits the open
  onCommit: () => void; // openToPlay — spring the rest + markOpen
  enabled: boolean; // a consumed day never launches
}

function FabTile({ i, sLit }: { i: number; sLit: SharedValue<number> }) {
  const pal = PALETTE[PALS[i]];
  // lit = the trace has reached this tile (sLit counts tiles passed)
  const pose = useAnimatedStyle(() => {
    const lit = sLit.value > i ? 1 : 0;
    return {
      transform: [{ scale: withTiming(lit ? 1.08 : 1, { duration: 110 }) }],
      opacity: withTiming(lit ? 1 : 0.88, { duration: 110 }),
    };
  });
  return (
    <Animated.View
      style={[
        styles.tile,
        pose,
        {
          backgroundColor: pal.bg,
          boxShadow: `0 3px 0 ${pal.edge}`,
          // p is the corner foot; l·a·y stack upward from it
          bottom: i * CELL,
        },
      ]}>
      <Text style={styles.letter}>{LETTERS[i].toUpperCase()}</Text>
    </Animated.View>
  );
}

export function PlayFab({ sheetY, closedY, commitFrac = 0.34, onCommit, enabled }: Props) {
  // sLit: how many tiles the trace has passed (0-4). UI-thread only.
  const sLit = useSharedValue(0);
  const sTracing = useSharedValue(0);

  // THE RADIANCE — a slow aurora breath under the stack, opacity-only
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const radiance = useAnimatedStyle(() => ({
    opacity: enabled ? 0.34 + breath.value * 0.3 + sTracing.value * 0.25 : 0,
  }));

  // haptic ladder: one tick per tile, ascending (the trace grammar)
  useAnimatedReaction(
    () => sLit.value,
    (cur, prev) => {
      if (prev !== null && cur > prev && cur >= 1 && cur <= 4) {
        runOnJS(hapticTick)(cur);
      }
    }
  );

  const pan = Gesture.Pan()
    .enabled(enabled)
    .minDistance(0)
    .maxPointers(1)
    .onBegin(() => {
      'worklet';
      sTracing.value = 1;
      sLit.value = 1; // the finger is ON p
    })
    .onUpdate((e) => {
      'worklet';
      // rise above the corner: negative translationY. Tiles light as the
      // finger climbs their zones; past L the sheet rides the finger.
      const rise = -e.translationY;
      const tilesPassed = 1 + Math.max(0, Math.min(3, Math.floor((rise + CELL * 0.45) / CELL)));
      sLit.value = tilesPassed;
      // THE SCRUB (owner: "the gameboard will be coming up already") —
      // finger travel past the first cell maps 1:1.6 onto the sheet
      const scrub = Math.max(0, rise - CELL * 0.6) * 1.6;
      sheetY.value = Math.max(0, Math.min(closedY, closedY - scrub));
    })
    .onEnd(() => {
      'worklet';
      const traveled = closedY - sheetY.value;
      const commit = sLit.value >= 4 || traveled > closedY * commitFrac;
      sTracing.value = 0;
      sLit.value = 0;
      if (commit) {
        runOnJS(onCommit)(); // springs the rest + marks open
      } else {
        sheetY.value = withSpring(closedY, { mass: 0.7, damping: 18, stiffness: 220 });
      }
    })
    .onFinalize(() => {
      'worklet';
      sTracing.value = 0;
      if (sLit.value !== 0) sLit.value = 0;
    });

  // the whole FAB recedes once the sheet is up (it lives over home)
  const fabPose = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [closedY * 0.45, closedY * 0.9], [0, 1], Extrapolation.CLAMP),
  }));

  if (!enabled) return null;
  return (
    <Animated.View style={[styles.wrap, fabPose]} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <View style={styles.stack} collapsable={false}>
          <Animated.View style={[styles.radiance, radiance]} pointerEvents="none" />
          {[0, 1, 2, 3].map((i) => (
            <FabTile key={i} i={i} sLit={sLit} />
          ))}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

function hapticTick(n: number) {
  haptic.tick(n);
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 130,
  },
  stack: {
    width: TILE,
    height: CELL * 4 - GAP,
  },
  // the aurora bleed — three candy shadows on one static layer, breathing
  radiance: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: 2,
    bottom: 2,
    borderRadius: 14,
    boxShadow:
      '0 0 22px 4px rgba(167,139,250,0.55), 0 -14px 26px 2px rgba(95,214,168,0.35), 0 14px 26px 2px rgba(91,200,245,0.35)',
  },
  tile: {
    position: 'absolute',
    left: 0,
    width: TILE,
    height: TILE,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 19,
    color: INK,
    includeFontPadding: false,
  },
});
