// SWIPE TO PLAY (owner naming: sworbl's verb is swiping, not tracing) —
// the door handle teaches the game.
// The P·L·A·Y tiles are REAL BOARD TILES (owner round 2): the mono
// face-on-ledge candy construction at mini scale — gray like a masked board,
// igniting to candy exactly like tracing on the real thing. Pure display:
// home owns the gesture and drives sLit (0-4).
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withTiming, withSequence, Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { PALETTE, INK, tileColorFor, gameSurface } from '@/game/palette';
import { type Theme } from '@/game/theme';

export const PLAY_WORD = ['p', 'l', 'a', 'y'] as const;

// BOARD-SIZE tiles (owner): the door previews the game — same sizing rule
// as the real board (play-sheet's tile formula)
export function playMetrics(width: number) {
  // slightly under board scale (owner round 2) — same proportions
  const tile = Math.min(52, Math.floor((Math.min(width, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);
  const rowW = tile * 4 + gap * 3;
  return { tile, gap, rowW, left: (width - rowW) / 2 };
}

const FLY_EASE = Easing.bezier(0.5, 0, 0.8, 0.5); // the word-flight curve
const FALL_EASE = Easing.bezier(0.45, 0.02, 0.7, 0.5); // the board's gravity

function PlayTile({ ch, i, sLit, theme, tile, armed }: {
  ch: string; i: number; sLit: SharedValue<number>; theme: Theme; tile: number; armed: boolean;
}) {
  const pal = PALETTE[tileColorFor(ch, i)];
  const gs = gameSurface(theme.mode);
  const LIFT = Math.max(3, Math.round(tile * 0.08));
  const RAD = Math.round(tile * 0.2);

  // ARM: the lit word FLIES upward in swipe order (the game's own commit
  // move). DISARM: gray tiles RAIN BACK IN like a refill.
  const flyY = useSharedValue(0);
  const flyO = useSharedValue(1);
  const flyS = useSharedValue(1);
  useEffect(() => {
    if (armed) {
      const d = i * 55;
      flyY.value = withDelay(d, withTiming(-44, { duration: 260, easing: FLY_EASE }));
      flyS.value = withDelay(d, withTiming(0.45, { duration: 260, easing: FLY_EASE }));
      flyO.value = withDelay(d + 170, withTiming(0, { duration: 90 }));
    } else {
      const d = 120 + i * 55;
      flyY.value = -1.6 * tile;
      flyS.value = 1;
      flyO.value = withDelay(d, withTiming(1, { duration: 40 }));
      flyY.value = withDelay(
        d,
        withTiming(0, { duration: 300, easing: FALL_EASE }, (fin) => {
          'worklet';
          if (fin) {
            flyS.value = withSequence(
              withTiming(0.94, { duration: 60 }),
              withTiming(1, { duration: 110 })
            );
          }
        })
      );
    }
  }, [armed]);
  const flight = useAnimatedStyle(() => ({
    opacity: flyO.value,
    transform: [{ translateY: flyY.value }, { scale: flyS.value }],
  }));
  const ledgeStyle = useAnimatedStyle(() => ({
    backgroundColor: sLit.value > i ? pal.edge : gs.mono.edge,
  }));
  const faceStyle = useAnimatedStyle(() => ({
    backgroundColor: sLit.value > i ? pal.bg : gs.mono.bg,
    transform: [{ translateY: sLit.value > i ? -1 : 0 }], // the board's press-lift
  }));
  const inkStyle = useAnimatedStyle(() => ({
    color: sLit.value > i ? INK : gs.monoInk,
  }));
  return (
    <Animated.View style={[{ width: tile, height: tile + LIFT + 1 }, flight]}>
      <Animated.View
        style={[styles.ledge, ledgeStyle, { top: LIFT, width: tile, height: tile, borderRadius: RAD }]}
      />
      <Animated.View
        style={[
          styles.face,
          faceStyle,
          { width: tile, height: tile, borderRadius: RAD, boxShadow: gs.tileBevel },
        ]}>
        <Animated.Text style={[styles.letter, inkStyle, { fontSize: Math.round(tile * 0.5) }]}>
          {ch.toUpperCase()}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

export function TracePlay({ sLit, theme, tile, gap, armed = false }: {
  sLit: SharedValue<number>; theme: Theme; tile: number; gap: number; armed?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { gap }]}>
        {PLAY_WORD.map((ch, i) => (
          <PlayTile key={ch} ch={ch} i={i} sLit={sLit} theme={theme} tile={tile} armed={armed} />
        ))}
      </View>
      {/* no label — the tiles SAY play, and two swipe messages was one too
          many (owner); the chevron's 'swipe up to start' is the only caption */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 7,
  },
  row: {
    flexDirection: 'row',
  },
  ledge: {
    position: 'absolute',
    left: 0,
  },
  face: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    includeFontPadding: false,
  },
});
