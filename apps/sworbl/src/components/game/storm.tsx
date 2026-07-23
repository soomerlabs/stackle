// Aurora-of-blocks storm — WEB fallback: soft SVG radial-gradient blobs on the
// web spec's bell geometry (no Skia/WASM in the web bundle — PHASE2 #7). The
// FULL goo recipe on web belongs to the frozen site's CSS today and to a
// css-filter port of this component when RNW web replaces it at launch.
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

const BLOBS = [
  { xPct: 1,  bot: -2,  s: 44, c: '#A78BFA', dur: 17000 },
  { xPct: 19, bot: -12, s: 54, c: '#5BC8F5', dur: 19000 },
  { xPct: 38, bot: -22, s: 68, c: '#5FD6A8', dur: 15000 },
  { xPct: 55, bot: -20, s: 64, c: '#F58FB8', dur: 21000 },
  { xPct: 74, bot: -12, s: 54, c: '#F5B84A', dur: 18000 },
  { xPct: 91, bot: -2,  s: 44, c: '#F58A66', dur: 22000 },
];

function Blob({ b, width, height }: { b: (typeof BLOBS)[number]; width: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: b.dur / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [b.dur]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: t.value * -14 }, { scale: 1 + t.value * 0.08 }],
  }));
  const d = b.s * 3; // soft halo needs room around the block
  const left = (b.xPct / 100) * width - d / 2 + b.s / 2;
  // centered in the box, gently varied (was bottom-anchored floor glow —
  // as the band's backdrop the color belongs mid-band, owner)
  const top = height / 2 - d / 2 + (b.bot % 3) * 8 - 8;
  return (
    <Animated.View pointerEvents="none" style={[anim, { position: 'absolute', left, top, width: d, height: d }]}>
      <Svg width={d} height={d}>
        <Defs>
          <RadialGradient id={`sg${b.xPct}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={b.c} stopOpacity="0.5" />
            <Stop offset="55%" stopColor={b.c} stopOpacity="0.22" />
            <Stop offset="100%" stopColor={b.c} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={d / 2} cy={d / 2} r={d / 2} fill={`url(#sg${b.xPct})`} />
      </Svg>
    </Animated.View>
  );
}

export default function Storm({ width, height = 260, zoom = 1 }: { width: number; height?: number; zoom?: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { width, height, transform: [{ scale: zoom }] }]}>
      {BLOBS.map((b, i) => (
        <Blob key={i} b={b} width={width} height={height} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
});
