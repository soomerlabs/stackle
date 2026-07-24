// THE HOCKEY-STICK FAB (owner, modes-spec: "PL across—no, P then LAY
// going UP... the gameboard already coming up, fluid") — the corner
// launcher. P sits at the corner, L·A·Y climb the edge; tracing past P
// turns the corner and the finger's rise SCRUBS the sheet directly.
// Release past the commit line = open; short of it = spring home.
// Radiance (owner): aurora candy glow breathes off the blocks — the
// only affordance. All motion is UI-thread shared values.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, useAnimatedReaction,
  withSpring, withTiming, runOnJS, interpolate, interpolateColor, Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';

import { haptic } from '@/game/haptics';
import { PALETTE, INK, gameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';

const TILE = 56; // bigger (owner)
const GAP = 9;
const CELL = TILE + GAP;
// THE TRUE STICK (owner): bottom row reads PL, the column reads LAY —
// the L IS the corner, shared by both strokes. Trace right, then up.
const LETTERS = ['p', 'l', 'a', 'y'] as const;
const PALS = [0, 1, 2, 3]; // violet · cyan · mint · pink
// tile positions in stack coords (left, bottom):
const POS = [
  { left: 0, bottom: 0 }, // P — the foot
  { left: CELL, bottom: 0 }, // L — the corner
  { left: CELL, bottom: CELL }, // A
  { left: CELL, bottom: CELL * 2 }, // Y
];

interface Props {
  sheetY: SharedValue<number>;
  closedY: number;
  commitFrac?: number; // fraction of travel that commits the open
  onCommit: () => void; // openToPlay — spring the rest + markOpen
  enabled: boolean; // a consumed day never launches
}

function FabTile({ i, sLit, mono }: {
  i: number;
  sLit: SharedValue<number>;
  mono: { bg: string; edge: string; ink: string };
}) {
  const pal = PALETTE[PALS[i]];
  // GRAY AT REST (owner: "gray blocks that change as you swipe") — the
  // board's own mono→candy law: color is the trace's reward
  const prog = useDerivedValue(() =>
    withTiming(sLit.value > i ? 1 : 0, { duration: 130 })
  );
  const pose = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + prog.value * 0.08 }],
    backgroundColor: interpolateColor(prog.value, [0, 1], [mono.bg, pal.bg]),
    // the ledge swaps at the blend's midpoint — two recomputes total,
    // never per-frame (the wave-no lesson)
    boxShadow: prog.value > 0.5 ? `0 3px 0 ${pal.edge}` : `0 3px 0 ${mono.edge}`,
  }));
  const inkPose = useAnimatedStyle(() => ({
    color: interpolateColor(prog.value, [0, 1], [mono.ink, INK]),
  }));
  return (
    <Animated.View
      style={[
        styles.tile,
        pose,
        { left: POS[i].left, bottom: POS[i].bottom },
      ]}>
      <Animated.Text style={[styles.letter, inkPose]}>
        {LETTERS[i].toUpperCase()}
      </Animated.Text>
    </Animated.View>
  );
}

export function PlayFab({ sheetY, closedY, commitFrac = 0.34, onCommit, enabled }: Props) {
  const gs = gameSurface(useTheme().mode);
  const mono = { bg: gs.mono.bg, edge: gs.mono.edge, ink: gs.monoInk };

  // sLit: how many tiles the trace has passed (0-4). UI-thread only.
  const sLit = useSharedValue(0);
  const sTracing = useSharedValue(0);


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
      // two strokes: RIGHT across the foot (P→L), then UP the column
      // (L→A→Y). The climb scrubs the sheet under the finger.
      const across = e.translationX;
      const rise = -e.translationY;
      let lit = 1; // on P
      if (across > CELL * 0.45 || rise > CELL * 0.4) lit = 2; // reached L
      if (lit >= 2 && rise > CELL * 0.55) lit = 3; // A
      if (lit >= 3 && rise > CELL * 1.5) lit = 4; // Y
      sLit.value = lit;
      // THE SCRUB (owner: "the gameboard will be coming up already") —
      // the vertical leg past the corner maps 1:1.6 onto the sheet
      const scrub = lit >= 2 ? Math.max(0, rise - CELL * 0.3) * 1.6 : 0;
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
          {[0, 1, 2, 3].map((i) => (
            <FabTile key={i} i={i} sLit={sLit} mono={mono} />
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
    bottom: 46, // the old dock blocks' y (owner) — foot row sits where they sat
  },
  stack: {
    width: CELL + TILE, // two wide: the foot
    height: CELL * 2 + TILE, // three tall: the column
  },
  tile: {
    position: 'absolute',
    left: 0,
    width: TILE,
    height: TILE,
    borderRadius: 15, // 0.26 × 56 — the tile squircle law
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 22,
    includeFontPadding: false,
  },
});
