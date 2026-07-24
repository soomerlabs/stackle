// TRACE-TO-LAUNCH (owner: "bring back the swipe-play idea on the bottom
// sheets, on brand") — the horizontal P·L·A·Y row as a commit control.
// Gray at rest, candy under the finger, all four lit + release = go.
// The signature gesture is the button.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, useAnimatedReaction,
  withTiming, runOnJS, interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';

import { haptic } from '@/game/haptics';
import { PALETTE, INK, gameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';

const TILE = 52;
const GAP = 9;
const CELL = TILE + GAP;
const LETTERS = ['p', 'l', 'a', 'y'] as const;
const PALS = [0, 1, 2, 3];

function LaunchTile({ i, sLit, mono }: {
  i: number;
  sLit: SharedValue<number>;
  mono: { bg: string; edge: string; ink: string };
}) {
  const pal = PALETTE[PALS[i]];
  const prog = useDerivedValue(() => withTiming(sLit.value > i ? 1 : 0, { duration: 120 }));
  const pose = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + prog.value * 0.08 }],
    backgroundColor: interpolateColor(prog.value, [0, 1], [mono.bg, pal.bg]),
    boxShadow: prog.value > 0.5 ? `0 3px 0 ${pal.edge}` : `0 3px 0 ${mono.edge}`,
  }));
  const inkPose = useAnimatedStyle(() => ({
    color: interpolateColor(prog.value, [0, 1], [mono.ink, INK]),
  }));
  return (
    <Animated.View style={[styles.tile, pose, { left: i * CELL }]}>
      <Animated.Text style={[styles.letter, inkPose]}>
        {LETTERS[i].toUpperCase()}
      </Animated.Text>
    </Animated.View>
  );
}

export function TraceLaunch({ onCommit, disabled, caption }: {
  onCommit: () => void;
  disabled?: boolean;
  caption?: string;
}) {
  const theme = useTheme();
  const gs = gameSurface(theme.mode);
  const mono = { bg: gs.mono.bg, edge: gs.mono.edge, ink: gs.monoInk };
  const sLit = useSharedValue(0);

  useAnimatedReaction(
    () => sLit.value,
    (cur, prev) => {
      if (prev !== null && cur > prev && cur >= 1 && cur <= 4) {
        runOnJS(tick)(cur);
      }
    }
  );

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .minDistance(0)
    .maxPointers(1)
    .onBegin(() => {
      'worklet';
      sLit.value = 1;
    })
    .onUpdate((e) => {
      'worklet';
      sLit.value = 1 + Math.max(0, Math.min(3, Math.floor((e.translationX + CELL * 0.45) / CELL)));
    })
    .onEnd(() => {
      'worklet';
      const done = sLit.value >= 4;
      sLit.value = 0;
      if (done) runOnJS(onCommit)();
    })
    .onFinalize(() => {
      'worklet';
      if (sLit.value !== 0) sLit.value = 0;
    });

  return (
    <View style={[styles.wrap, disabled && { opacity: 0.45 }]}>
      <GestureDetector gesture={pan}>
        <View style={styles.row} collapsable={false}>
          {[0, 1, 2, 3].map((i) => (
            <LaunchTile key={i} i={i} sLit={sLit} mono={mono} />
          ))}
        </View>
      </GestureDetector>
      {!!caption && (
        <Text style={[styles.caption, { color: theme.faint }]}>{caption}</Text>
      )}
    </View>
  );
}

function tick(n: number) {
  haptic.tick(n);
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 8,
  },
  row: {
    width: CELL * 4 - GAP,
    height: TILE + 6,
  },
  tile: {
    position: 'absolute',
    top: 0,
    width: TILE,
    height: TILE,
    borderRadius: 14, // 0.26 × 52 — the squircle law
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 21,
    includeFontPadding: false,
  },
  caption: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.4,
  },
});
