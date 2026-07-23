// SWIPE TO PLAY (owner naming: sworbl's verb is swiping, not tracing) —
// the door handle teaches the game.
// The P·L·A·Y tiles are REAL BOARD TILES (owner round 2): the mono
// face-on-ledge candy construction at mini scale — gray like a masked board,
// igniting to candy exactly like tracing on the real thing. Pure display:
// home owns the gesture and drives sLit (0-4).
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle, useAnimatedReaction, useSharedValue, withDelay, withTiming, withSequence,
  Easing, type SharedValue,
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

function PlayTile({ ch, i, sLit, sPoke, theme, tile, armed }: {
  ch: string; i: number; sLit: SharedValue<number>; sPoke?: SharedValue<number>;
  theme: Theme; tile: number; armed: boolean;
}) {
  const pal = PALETTE[tileColorFor(ch, i)];
  const gs = gameSurface(theme.mode);
  const LIFT = Math.max(3, Math.round(tile * 0.08));
  const RAD = Math.round(tile * 0.26); // squircle territory (owner)

  // ARM: the lit word FLIES upward in swipe order (the game's own commit
  // move). DISARM: gray tiles RAIN BACK IN like a refill.
  const flyY = useSharedValue(0);
  const flyO = useSharedValue(1);
  const flyS = useSharedValue(1);
  // the rain is a DISARM ceremony, not a boot animation (owner audit: at
  // cold launch the tiles spawned above the band, clipped, then fell) —
  // on first mount unarmed tiles simply ARE there
  const booted = useRef(false);
  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      if (!armed) return;
    }
    if (armed) {
      const d = i * 55;
      flyY.value = withDelay(d, withTiming(-44, { duration: 260, easing: FLY_EASE }));
      flyS.value = withDelay(d, withTiming(0.45, { duration: 260, easing: FLY_EASE }));
      flyO.value = withDelay(d + 170, withTiming(0, { duration: 90 }));
    } else {
      // RETURN: the tiles GROW back in from the row's center outward
      // (owner: no more falling from above) — L·A bloom first, then P·Y,
      // each with a soft overshoot pop
      const centerDist = Math.abs(i - 1.5); // 0.5 inner pair · 1.5 outer pair
      const d = 120 + Math.round(centerDist * 150) + (i > 1 ? 40 : 0);
      flyY.value = 0;
      flyS.value = 0;
      flyO.value = withDelay(d, withTiming(1, { duration: 60 }));
      flyS.value = withDelay(
        d,
        withSequence(
          withTiming(1.08, { duration: 170, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 110 })
        )
      );
    }
  }, [armed]);
  // OUT-OF-SEQUENCE TAP (owner: "if i just hit LA i'd expect to see it
  // react") — the tapped tile shakes its head: seen, but the door starts
  // at P. sPoke encodes (counter*4 + tileIndex); only the named tile moves.
  const nudgeX = useSharedValue(0);
  useAnimatedReaction(
    () => sPoke?.value ?? -1,
    (cur, prev) => {
      if (cur < 0 || cur === prev || cur % 4 !== i) return;
      nudgeX.value = withSequence(
        withTiming(-4, { duration: 50 }),
        withTiming(4, { duration: 70 }),
        withTiming(-2.5, { duration: 60 }),
        withTiming(0, { duration: 70 })
      );
    }
  );
  const flight = useAnimatedStyle(() => ({
    opacity: flyO.value,
    transform: [
      { translateY: flyY.value },
      { translateX: nudgeX.value },
      { scale: flyS.value },
    ],
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

export function TracePlay({ sLit, sPoke, theme, tile, gap, armed = false }: {
  sLit: SharedValue<number>; sPoke?: SharedValue<number>; theme: Theme;
  tile: number; gap: number; armed?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { gap }]}>
        {PLAY_WORD.map((ch, i) => (
          <PlayTile
            key={ch} ch={ch} i={i} sLit={sLit} sPoke={sPoke} theme={theme} tile={tile} armed={armed}
          />
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
  // borderCurve continuous = Apple's real superellipse on iOS (squircle)
  ledge: {
    position: 'absolute',
    left: 0,
    borderCurve: 'continuous',
  },
  face: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    includeFontPadding: false,
  },
});
