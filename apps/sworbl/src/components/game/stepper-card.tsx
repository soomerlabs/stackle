// The STEPPER CARD (web hopperCardStyle + bannerEl + payBadge): the strip
// above the board where the traced word builds in candy chips, with the
// pay badge (×mult · pts) fading in at the top-right while a chain is lit.
// Verdicts land here too: valid word + points, invalid in red.
// (The sworb-day guess face and the letter-flight arrival are later passes.)
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  ZoomIn, FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withSequence, withTiming,
  withDelay, Easing, type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import engine from '@sworbl/engine';
import { PALETTE, CARD, tileColorFor, GAME_DARK, type GameSurface } from '@/game/palette';
import { scoreWord } from '@/game/dict';

export interface StepperVerdict {
  word: string;
  pts?: number;
  ok: boolean;
  clue?: string;
  mult?: number; // Threes-stack merge: the ×N banner instead of points
}

export interface SworbFace {
  slots: string[];
  colors: (string | null)[];
  guessesUsed: number;
  shakeKey: number; // increments on a miss → the row shakes it off
  burstKey: number; // increments on the WIN → confetti
}

interface Props {
  width: number; // boardW + 24, the shared rail
  traceWord: string; // live chain, lowercase ('' when idle)
  verdict: StepperVerdict | null;
  sworb?: SworbFace | null; // finale: the stepper hosts the guess (fossil sworb face)
  countIn?: string | null; // '3'|'2'|'1' — the stepper SPEAKS the count-in
  gs?: GameSurface; // scheme surface (defaults dark)
}

// count-in beat colors: 3 violet · 2 gold · 1 green (green hands to GO)
const BEAT_INK: Record<string, number> = { '3': 0, '2': 4, '1': 2 };

// THE MISS TUMBLE (web chipFall + _bannerMiss): rejected chips lean drunk in
// place, then gravity takes them off the stepper — 48px fall with a rotation,
// GOLDEN-RATIO scattered delays so they let go in "random" order, not a sweep.
// Module-level worklet factories — closures inside render trip the React
// Compiler (hoisted out of the worklet = remote-call crash).
function chipFallAt(i: number): EntryExitAnimationFunction {
  return ((values: { currentOriginY: number }) => {
    'worklet';
    const delay = ((i * 0.618034) % 1) * 160;
    const fr = (i % 2 ? 1 : -1) * (12 + i * 8);
    return {
      initialValues: {
        originY: values.currentOriginY,
        transform: [{ rotate: '0deg' }],
        opacity: 1,
      },
      animations: {
        originY: withDelay(
          delay,
          withTiming(values.currentOriginY + 48, {
            duration: 450,
            easing: Easing.bezier(0.5, 0, 0.8, 0.5),
          })
        ),
        transform: [{ rotate: withDelay(delay, withTiming(`${fr}deg`, { duration: 450 })) }],
        opacity: withDelay(delay, withTiming(0, { duration: 450 })),
      },
    };
  }) as EntryExitAnimationFunction;
}

// the reject row arrives SHAKING (web shakeX on the miss banner)
const missShakeIn: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { transform: [{ translateX: 0 }] },
    animations: {
      transform: [
        {
          translateX: withSequence(
            withTiming(-7, { duration: 55 }),
            withTiming(6, { duration: 70 }),
            withTiming(-3, { duration: 60 }),
            withTiming(0, { duration: 70 })
          ),
        },
      ],
    },
  };
};

const GUESS_C: Record<string, { bg: string; edge: string; ink: string }> = {
  green: { bg: '#5FD6A8', edge: '#38AD7F', ink: '#1F1442' },
  yellow: { bg: '#F5B84A', edge: '#CE9022', ink: '#1F1442' },
  typed: { bg: '#42424F', edge: '#22222A', ink: '#FFFFFF' },
};

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  dx: Math.cos((i / 18) * Math.PI * 2 + (i % 5) * 0.11) * (46 + (i % 4) * 22),
  dy: Math.sin((i / 18) * Math.PI * 2) * (34 + (i % 3) * 18) - 14,
  rot: (i % 2 ? 1 : -1) * (140 + i * 21),
  s: 5 + (i % 4) * 2,
  pal: i % 6,
  delay: (i % 5) * 24,
}));

function Burst({ burstKey }: { burstKey: number }) {
  if (!burstKey) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {CONFETTI.map((c, i) => (
        <ConfettiBit key={`${burstKey}-${i}`} c={c} />
      ))}
    </View>
  );
}

function ConfettiBit({ c }: { c: (typeof CONFETTI)[number] }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withSequence(withTiming(0, { duration: c.delay }), withTiming(1, { duration: 750 }));
  }, []);
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * c.dx },
      { translateY: t.value * c.dy + t.value * t.value * 26 },
      { rotate: `${t.value * c.rot}deg` },
    ],
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
  }));
  const pal = PALETTE[c.pal];
  return (
    <Animated.View
      style={[
        st,
        {
          position: 'absolute', left: '50%', top: '46%',
          width: c.s, height: c.s, borderRadius: Math.max(1, Math.round(c.s * 0.26)),
          backgroundColor: pal.bg, boxShadow: `0 1px 0 ${pal.edge}`,
        },
      ]}
    />
  );
}

function Chips({ word, red }: { word: string; red?: boolean }) {
  const hs = Math.min(30, Math.floor(220 / Math.max(1, word.length)));
  return (
    <View style={styles.chipRow}>
      {[...word].map((ch, i) => {
        const pal = PALETTE[tileColorFor(ch, i)];
        return (
          <Animated.View
            key={i + ch}
            entering={ZoomIn.springify().mass(0.5)}
            exiting={red ? chipFallAt(i) : undefined}
            style={[
              styles.chip,
              {
                width: hs,
                height: hs,
                borderRadius: Math.round(hs * 0.27),
                backgroundColor: red ? '#E5484D' : pal.bg,
                boxShadow: `0 2px 0 ${red ? '#8C2328' : pal.edge}`,
              },
              // the drunken lean (web _bannerMiss): each chip knocked askew
              red && {
                transform: [
                  { rotate: `${i % 2 ? 5 : -6}deg` },
                  { translateY: i % 2 ? -2 : 2 },
                ],
              },
            ]}>
            <Text style={[styles.chipText, { fontSize: Math.round(hs * 0.55) }]}>
              {ch.toUpperCase()}
            </Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function StepperCard({ width, traceWord, verdict, sworb, countIn, gs = GAME_DARK }: Props) {
  if (countIn) {
    const pal = PALETTE[BEAT_INK[countIn] ?? 0];
    return (
      <View style={[styles.card, { width, backgroundColor: gs.card, boxShadow: `0 4px 0 ${gs.cardEdge}` }]}>
        <Animated.Text
          key={countIn}
          entering={ZoomIn.springify().mass(0.5).damping(13)}
          exiting={FadeOut.duration(110)}
          style={[styles.countDigit, { color: pal.bg, textShadowColor: pal.edge }]}>
          {countIn}
        </Animated.Text>
      </View>
    );
  }
  const tracing = traceWord.length > 0;
  const mult = tracing ? engine.core.lenMult(traceWord.length) : 0;
  const pts = tracing && traceWord.length >= 3 ? scoreWord(traceWord) : 0;

  // the miss SHAKE (fossil sworbGuess.shakeKey)
  const shakeX = useSharedValue(0);
  useEffect(() => {
    if (!sworb?.shakeKey) return;
    shakeX.value = withSequence(
      withTiming(-7, { duration: 45 }),
      withTiming(7, { duration: 70 }),
      withTiming(-4, { duration: 60 }),
      withTiming(0, { duration: 80 })
    );
  }, [sworb?.shakeKey]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  // ONE persistent card, FIXED height — the two faces dissolve inside it
  // (owner: the card grew at the finale swap and jerked the board down)
  if (sworb) {
    const bs = Math.min(34, Math.floor((width - 60) / Math.max(1, sworb.slots.length)) - 5);
    return (
      <View style={[styles.card, { width, backgroundColor: gs.card, boxShadow: `0 4px 0 ${gs.cardEdge}` }]}>
        <Animated.View key="sworb" entering={FadeIn.duration(300)} style={styles.face}>
        <Animated.View style={[styles.sworbRow, shakeStyle]}>
          {sworb.slots.map((l, i) => {
            const color = sworb.colors[i];
            const pal = color ? GUESS_C[color] ?? GUESS_C.typed : l ? GUESS_C.typed : null;
            const isHint = color === 'yellow';
            return (
              <View
                key={i}
                style={[
                  styles.slot,
                  { width: bs, height: bs * 1.14, borderRadius: Math.round(bs * 0.22) },
                  pal && !isHint
                    ? { backgroundColor: pal.bg, boxShadow: `0 3px 0 ${pal.edge}` }
                    : isHint
                      ? styles.slotHint
                      : styles.slotEmpty,
                ]}>
                <Text
                  style={[
                    styles.slotText,
                    { fontSize: Math.round(bs * 0.52) },
                    { color: isHint ? '#F5B84A' : pal ? pal.ink : '#9DA2B3' },
                    isHint && { opacity: 0.75 },
                  ]}>
                  {l.toUpperCase()}
                </Text>
              </View>
            );
          })}
        </Animated.View>
        <View style={styles.pips}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={[styles.pip, i < sworb.guessesUsed && styles.pipUsed]} />
          ))}
        </View>
        <Burst burstKey={sworb.burstKey} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { width, backgroundColor: gs.card, boxShadow: `0 4px 0 ${gs.cardEdge}` }]}>
      <Animated.View key="spell" exiting={FadeOut.duration(200)} style={styles.face}>
      {/* the banner: live chain chips, a landed verdict, or the idle line */}
      {verdict ? (
        <Animated.View
          entering={verdict.ok ? undefined : missShakeIn}
          style={styles.bannerRow}>
          <Chips word={verdict.word.toLowerCase()} red={!verdict.ok} />
          {verdict.ok && verdict.mult != null && (
            <Animated.Text entering={FadeIn.duration(150)} style={styles.pts}>
              ×{verdict.mult}
            </Animated.Text>
          )}
          {verdict.ok && verdict.pts != null && (
            <Animated.Text entering={FadeIn.duration(150)} style={styles.pts}>
              +{verdict.pts}
              {verdict.clue ? '  ✦' : ''}
            </Animated.Text>
          )}
        </Animated.View>
      ) : tracing ? (
        <Chips word={traceWord} />
      ) : (
        <Text style={[styles.idle, { color: gs.sub }]}>swipe to spell</Text>
      )}

      {/* pay badge (web payBadgeStyle): ×mult · running pts, only while tracing */}
      {tracing && mult > 1 && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.payBadge}>
          <Text style={styles.payMult}>×{mult}</Text>
          {pts > 0 && <Text style={styles.payPts}>{pts}</Text>}
        </Animated.View>
      )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD.bg,
    borderRadius: 16,
    // FIXED height — tall enough for the guess face, so the finale swap
    // never reflows the column (the board must not move)
    height: 80,
    marginBottom: 12,
    marginTop: 2,
    boxShadow: `0 4px 0 ${CARD.edge}`,
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 4,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  pts: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 17,
    color: '#5FD6A8',
  },
  countDigit: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 44,
    lineHeight: 50,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
    includeFontPadding: false,
    alignSelf: 'center',
    marginTop: 15,
  },
  idle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    letterSpacing: 1.5,
    color: '#3A3A44',
    textTransform: 'uppercase',
  },
  payBadge: {
    position: 'absolute',
    top: 5,
    right: 7,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    backgroundColor: '#26262E',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    boxShadow: '0 2px 0 rgba(0,0,0,0.25)',
  },
  payMult: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    color: '#F5B84A',
  },
  payPts: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    color: '#9DA2B3',
  },
  sworbRow: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: { borderWidth: 2.5, borderStyle: 'dashed', borderColor: '#3A3A44' },
  slotHint: { borderWidth: 2.5, borderStyle: 'dashed', borderColor: '#CE9022' },
  slotText: { fontFamily: 'Fredoka_600SemiBold', includeFontPadding: false },
  pips: { flexDirection: 'row', gap: 5, marginTop: 6, justifyContent: 'center' },
  pip: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2a2446' },
  pipUsed: { backgroundColor: '#ff6b5a' },
});
