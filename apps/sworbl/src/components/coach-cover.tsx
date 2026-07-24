// THE FIRST-RUN COACH (audit: "session one teaches by punishment" — the
// trace verb was never shown). One cover, three beats, a live demo of
// the verb: mini tiles light in a looping wave like a finger dragging
// through them. Shows exactly once, before the first clock ever starts.
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue,
  withDelay, withRepeat, withSequence, withTiming, interpolateColor,
} from 'react-native-reanimated';
import engine from '@sworbl/engine';

import { haptic } from '@/game/haptics';
import { PALETTE, INK, gameSurface } from '@/game/palette';
import { ACCENT, ACCENT_EDGE, useTheme } from '@/game/theme';

const COACH_KEY = 'sworbl_rn_coached';

export function wasCoached(): boolean {
  return engine.store.getJSON(COACH_KEY, false) === true;
}
export function setCoached(): void {
  engine.store.setJSON(COACH_KEY, true);
}

const DEMO = ['s', 'w', 'o', 'r', 'b'] as const;
const TILE = 40;

function DemoTile({ i, mono }: { i: number; mono: { bg: string; edge: string; ink: string } }) {
  const pal = PALETTE[i % PALETTE.length];
  const t = useSharedValue(0);
  useEffect(() => {
    // the wave: each tile lights 160ms after its neighbor, holds, lets
    // go together, breathes, repeats — a finger dragging through
    t.value = withRepeat(
      withSequence(
        withDelay(400 + i * 160, withTiming(1, { duration: 140 })),
        withDelay(900 + (DEMO.length - i) * 40, withTiming(0, { duration: 260 })),
        withTiming(0, { duration: 700 })
      ),
      -1
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lit = useDerivedValue(() => t.value);
  const pose = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lit.value * 0.08 }, { translateY: lit.value * -3 }],
    backgroundColor: interpolateColor(lit.value, [0, 1], [mono.bg, pal.bg]),
    boxShadow: lit.value > 0.5 ? `0 3px 0 ${pal.edge}` : `0 3px 0 ${mono.edge}`,
  }));
  const inkPose = useAnimatedStyle(() => ({
    color: interpolateColor(lit.value, [0, 1], [mono.ink, INK]),
  }));
  return (
    <Animated.View style={[styles.tile, pose]}>
      <Animated.Text style={[styles.tileText, inkPose]}>{DEMO[i].toUpperCase()}</Animated.Text>
    </Animated.View>
  );
}

export function CoachCover({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const gs = gameSurface(theme.mode);
  const mono = { bg: gs.mono.bg, edge: gs.mono.edge, ink: gs.monoInk };
  return (
    <View style={[StyleSheet.absoluteFill, styles.scrim]}>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.title, { color: theme.ink }]}>how it works</Text>

        <View style={styles.demoRow}>
          {DEMO.map((_, i) => (
            <DemoTile key={i} i={i} mono={mono} />
          ))}
        </View>
        <Text style={[styles.beat, { color: theme.sub }]}>
          drag through touching letters to spell words — longer is bigger
        </Text>

        <Text style={[styles.beat, { color: theme.sub }]}>
          six secret clue words hide on the board. spell one and it glows —
          every clue you catch is intel.
        </Text>

        <Text style={[styles.beat, { color: theme.sub }]}>
          the clues all point at ONE word: the sworb. guess it any time —
          the fewer clues you needed, the bigger the bonus.
        </Text>

        <Pressable
          onPress={() => {
            setCoached();
            haptic.good();
            onDone();
          }}
          accessibilityRole="button"
          accessibilityLabel="start playing"
          style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
          <Text style={styles.ctaText}>GOT IT — PLAY</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 50,
  },
  card: {
    alignSelf: 'stretch',
    borderRadius: 22, borderCurve: 'continuous',
    paddingHorizontal: 22,
    paddingVertical: 22,
    gap: 14,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 21,
  },
  demoRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 11, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 17,
    includeFontPadding: false,
  },
  beat: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  cta: {
    alignSelf: 'stretch',
    borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
});
