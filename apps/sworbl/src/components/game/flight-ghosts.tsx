// FLIGHT GHOSTS — the 5f letter flight, UNCLIPPED. The board's overflow mask
// (which exists to hide refill drops) decapitated flying letters at its edge
// (owner: "dying after leaving the gameboard"). The real tile hides at
// launch; these ghosts fly the full route to the stepper, candy-colored to
// MATCH the verdict chips they land as.
import React, { useEffect } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing,
} from 'react-native-reanimated';
import { PALETTE, tileColorFor } from '@/game/palette';

export interface FlightGhostT {
  key: number;
  letter: string;
  seq: number; // position in the word (stagger + chip color parity)
  x: number; // launch position (board coords)
  y: number;
  dx: number; // vector to the chip slot
  dy: number;
  size: number;
}

const FLY = { duration: 300, easing: Easing.bezier(0.5, 0, 0.8, 0.5) };

function Ghost({ g }: { g: FlightGhostT }) {
  const t = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    const d = g.seq * 40;
    t.value = withDelay(d, withTiming(1, FLY));
    // fade STARTS at arrival and overlaps the chip's pop — the ghost
    // dissolves INTO the chip it becomes (the web landing read)
    o.value = withDelay(d + 250, withTiming(0, { duration: 90 }));
  }, []);
  const chipScale = Math.max(0.35, Math.min(0.6, 28 / g.size));
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateX: g.x + t.value * g.dx },
      { translateY: g.y + t.value * g.dy },
      { scale: 1 + t.value * (chipScale - 1) },
    ],
    opacity: o.value,
  }));
  const pal = PALETTE[tileColorFor(g.letter, g.seq)];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        st,
        styles.ghost,
        {
          width: g.size,
          height: g.size,
          borderRadius: Math.round(g.size * 0.2),
          backgroundColor: pal.bg,
          boxShadow: `0 3px 0 ${pal.edge}`,
        },
      ]}>
      <Text style={[styles.letter, { fontSize: Math.round(g.size * 0.5) }]}>
        {g.letter === 'q' ? 'Qu' : g.letter.toUpperCase()}
      </Text>
    </Animated.View>
  );
}

export function FlightGhosts({ ghosts }: { ghosts: FlightGhostT[] }) {
  if (!ghosts.length) return null;
  return (
    <View pointerEvents="none" style={styles.layer}>
      {ghosts.map((g) => (
        <Ghost key={g.key} g={g} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 12, // the card's padding — layer origin matches the inner board
    top: 12,
    right: 12,
    bottom: 12,
    zIndex: 30,
  },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#1F1442',
    includeFontPadding: false,
  },
});
