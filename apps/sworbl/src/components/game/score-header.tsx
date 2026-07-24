// The SCORING HEADER — web-parity port of the fossil's slim score strip
// (index.html homeSlim, ~586-588 + 5806-5811): your score on the left, a
// DASHED baseline with a soft GLOWING rounded fill riding over it and a
// dashed KNOB at the tip, crown + points-to-beat on the right. The old
// hard 2px line-fill was the owner-rejected look ("looks bad filled in").
// Target is a STUB until Supabase standings land (then: today's #1).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
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

// THE RISER (fossil hudRise, 1.1s ease-out): +N floats up off the score as
// it banks — the web's little dopamine puff, missing since the port
function Riser({ delta, riseKey }: { delta: number; riseKey: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!riseKey) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) });
  }, [riseKey]);
  const st = useAnimatedStyle(() => {
    // web keyframes: y 8→-1@20→-11@70→-18, scale .6→1.12@20→1@70→.95, fade out
    const y = t.value < 0.2
      ? 8 - (t.value / 0.2) * 9
      : t.value < 0.7
        ? -1 - ((t.value - 0.2) / 0.5) * 10
        : -11 - ((t.value - 0.7) / 0.3) * 7;
    const sc = t.value < 0.2
      ? 0.6 + (t.value / 0.2) * 0.52
      : t.value < 0.7
        ? 1.12 - ((t.value - 0.2) / 0.5) * 0.12
        : 1 - ((t.value - 0.7) / 0.3) * 0.05;
    return {
      opacity: t.value === 0 ? 0 : t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
      transform: [{ translateY: y }, { scale: sc }],
    };
  });
  if (!riseKey) return null;
  return (
    <Animated.Text pointerEvents="none" style={[styles.riser, st]}>
      +{delta}
    </Animated.Text>
  );
}

export function ScoreHeader({ score, target, marks, width, gs = GAME_DARK }: Props) {
  const ratio = Math.min(1, target > 0 ? score / target : 0);
  // riser trigger: any score increase floats its delta up off the number
  const prevScore = useRef(score);
  const [rise, setRise] = useState({ key: 0, delta: 0 });
  useEffect(() => {
    const d = score - prevScore.current;
    prevScore.current = score;
    if (d > 0) setRise((r) => ({ key: r.key + 1, delta: d }));
  }, [score]);
  // NUMERIC widths — Reanimated tweens numbers, not '%' strings (the header
  // silently broke on device with the string version). Track owns the FULL
  // rail now (owner: score and bar fought for the same line at big values)
  const trackW = Math.max(0, width - 4);
  const fillStyle = useAnimatedStyle(() => ({
    width: withTiming(ratio * trackW, { duration: EASE_MS }),
    opacity: withTiming(score > 0 ? 1 : 0, { duration: EASE_MS }),
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
      </View>
      {/* the reading line: score grows leftward forever, target sits right */}
      <View style={styles.reading}>
        <View>
          <Text style={[styles.score, { color: gs.ink }]}>{score.toLocaleString()}</Text>
          <Riser key={rise.key} delta={rise.delta} riseKey={rise.key} />
        </View>
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
    gap: 4, // owner-tuned (knob removed — the glow fill alone marks progress)
    marginBottom: 4, // symmetric with the top gap (owner)
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
  riser: {
    position: 'absolute',
    left: '100%',
    top: 0,
    marginLeft: 6,
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    color: '#5FD6A8', // fossil hudRise normal green
  },
  track: {
    // NO flex — in the old ROW layout flex:1 meant "grow wide"; in the
    // stacked column it ZEROED the height (basis 0 beats height:18), the
    // knob overflowed the collapsed track onto the score (owner's overlap)
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
