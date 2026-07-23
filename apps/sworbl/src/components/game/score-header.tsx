// The SCORING HEADER — web-parity port of the fossil's slim score strip
// (index.html homeSlim, ~586-588 + 5806-5811): your score on the left, a
// DASHED baseline with a soft GLOWING rounded fill riding over it and a
// dashed KNOB at the tip, crown + points-to-beat on the right. The old
// hard 2px line-fill was the owner-rejected look ("looks bad filled in").
// Target is a STUB until Supabase standings land (then: today's #1).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { GAME_DARK, type GameSurface } from '@/game/palette';
import { Crown } from '@/components/crown';

interface Props {
  score: number;
  target: number; // today's #1 — the crown at the track's end
  marks?: { second: number; third: number }; // podium cut lines on the track
  width: number; // the shared rail (boardW + 24)
  gs?: GameSurface;
}

const EASE_MS = 500; // web: width 0.5s cubic-bezier(0.22,1,0.36,1)
const KNOB = 17;

export function ScoreHeader({ score, target, marks, width, gs = GAME_DARK }: Props) {
  const ratio = Math.min(1, target > 0 ? score / target : 0);
  // NUMERIC widths — Reanimated tweens numbers, not '%' strings (the header
  // silently broke on device with the string version). Track owns the FULL
  // rail now (owner: score and bar fought for the same line at big values)
  const trackW = Math.max(0, width - 4);
  const fillStyle = useAnimatedStyle(() => ({
    width: withTiming(ratio * trackW, { duration: EASE_MS }),
    opacity: withTiming(score > 0 ? 1 : 0, { duration: EASE_MS }),
  }));
  // knob glides with the fill tip (web: left transitions on the same curve);
  // parked near the start while the fill is dormant (web: left 2%, faded)
  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      {
        // clamped INSIDE the rail: at 0 the knob rests flush with the track's
        // start, never poking past it (owner)
        translateX: withTiming(
          Math.min(Math.max(0, ratio * trackW - KNOB / 2), trackW - KNOB),
          { duration: EASE_MS }
        ),
      },
    ],
    opacity: withTiming(score > 0 ? 1 : 0.45, { duration: EASE_MS }),
  }));

  return (
    <View style={[styles.wrap, { width }]}>
      <View style={styles.track}>
        <View style={[styles.dashLine, { borderColor: gs.line }]} />
        {/* podium cut marks: pass 3rd → you're ON the board; 2nd → chasing the crown */}
        {marks &&
          ([
            { at: marks.third, label: '3' },
            { at: marks.second, label: '2' },
          ] as const).map(({ at, label }) => {
            const r = target > 0 ? Math.min(1, at / target) : 0;
            if (r <= 0 || r >= 1) return null;
            const passed = score >= at;
            return (
              <View key={label} style={[styles.markWrap, { left: r * trackW - 5 }]}>
                <Text style={[styles.markLabel, passed && styles.markPassed]}>{label}</Text>
                <View style={[styles.markTick, passed && styles.markTickPassed]} />
              </View>
            );
          })}
        <Animated.View style={[styles.fill, fillStyle]} />
        <Animated.View style={[styles.knob, { backgroundColor: gs.bg, borderColor: gs.line }, knobStyle]} />
      </View>
      {/* the reading line: score grows leftward forever, target sits right */}
      <View style={styles.reading}>
        <Text style={[styles.score, { color: gs.ink }]}>{score.toLocaleString()}</Text>
        <View style={styles.targetWrap}>
          <Crown width={14} style={styles.crown} />
          <Text style={styles.target}>{target.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14, // the knob needs its own airspace above the numbers (owner ×2)
    marginBottom: 8,
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2, // flush with the track's inset edges
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 18,
    justifyContent: 'center',
  },
  dashLine: {
    position: 'absolute',
    left: 2,
    right: 2,
    top: 8,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#3A3A44',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 6.5,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(137,113,255,0.8)',
    // web: filter blur(1px) + glow shadow — the SOFT bar, never a hard line
    boxShadow: '0 0 9px 1px rgba(137,113,255,0.8)',
  },
  knob: {
    position: 'absolute',
    left: 0,
    top: (18 - KNOB) / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: 6,
    backgroundColor: '#131318',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#3A3A44',
  },
  markWrap: {
    position: 'absolute',
    top: -7,
    width: 10,
    alignItems: 'center',
    gap: 1,
  },
  markLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 8.5,
    color: '#5A5A66',
    includeFontPadding: false,
    lineHeight: 9,
  },
  markPassed: {
    color: '#8971FF',
  },
  markTick: {
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: '#3A3A44',
  },
  markTickPassed: {
    backgroundColor: '#8971FF',
  },
  targetWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  crown: {
    marginBottom: 2,
  },
  target: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 17, // same weight as your score — equals chasing equals (owner)
    color: '#9DA2B3',
    fontVariant: ['tabular-nums'],
  },
});
