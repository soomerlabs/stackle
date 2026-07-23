// THE SWORBL AURORA v3 — NATIVE (Skia). Owner brief: "taller, more
// northern-light-ish, mixed with prism and our blocks."
//   · CURTAINS: five vertical light veils rising from the horizon, each a
//     hue fading upward to nothing, swaying glacially — the northern lights
//   · PRISM: the six-hue spectrum band sweeping along the base
//   · BLOCKS: three of our candy tiles drifting inside the light, sharp
//     against the blur — the game living in its own weather
// Feathered top AND bottom (home mounts the canvas taller than the band —
// the bottom melt hangs off-screen at park). WEB SIBLING: storm.tsx carries
// a simpler CSS-blur port — patch both or state why not (split-file trap).
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas, Group, Paint, Blur, Rect, RoundedRect, Circle, LinearGradient, RadialGradient, vec,
} from '@shopify/react-native-skia';
import {
  useSharedValue, useDerivedValue, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';

const HUES = ['#A78BFA', '#5BC8F5', '#5FD6A8', '#F58FB8', '#F5B84A', '#F58A66'];

// curtains: x anchor (pct), hue index, sway px, period ms
const CURTAINS = [
  { x: 0.08, c: 0, sway: 14, dur: 19000 },
  { x: 0.27, c: 1, sway: -18, dur: 23000 },
  { x: 0.47, c: 2, sway: 12, dur: 17000 },
  { x: 0.66, c: 3, sway: -14, dur: 21000 },
  { x: 0.85, c: 4, sway: 16, dur: 25000 },
] as const;

// our blocks, adrift in the light: x/y (pct of canvas), size, hue, period
const DRIFT_BLOCKS = [
  { x: 0.2, y: 0.58, s: 15, c: 5, dur: 15000, rise: 10 },
  { x: 0.55, y: 0.46, s: 19, c: 0, dur: 19000, rise: 14 },
  { x: 0.8, y: 0.62, s: 13, c: 2, dur: 17000, rise: 9 },
] as const;

function useDrift(dur: number) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: dur / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur]);
  return t;
}

function Curtain({ i, width, height }: { i: number; width: number; height: number }) {
  const c = CURTAINS[i];
  const t = useDrift(c.dur);
  const w = width * 0.17;
  const transform = useDerivedValue(() => [
    { translateX: width * c.x + t.value * c.sway },
    // the veil breathes taller and shorter as it sways
    { scaleY: 0.92 + t.value * 0.16 },
  ]);
  return (
    <Group transform={transform} origin={vec(w / 2, height)}>
      <Rect x={0} y={height * 0.12} width={w} height={height * 0.88}>
        <LinearGradient
          start={vec(0, height * 0.12)}
          end={vec(0, height)}
          colors={['transparent', HUES[c.c] + 'D9']}
          positions={[0, 0.82]}
        />
      </Rect>
    </Group>
  );
}

function DriftBlock({ b, width, height }: { b: (typeof DRIFT_BLOCKS)[number]; width: number; height: number }) {
  const t = useDrift(b.dur);
  const transform = useDerivedValue(() => [
    { translateX: width * b.x + t.value * 6 },
    { translateY: height * b.y - t.value * b.rise },
    { rotate: (t.value - 0.5) * 0.14 },
  ]);
  const opacity = useDerivedValue(() => 0.35 + t.value * 0.25);
  return (
    <Group transform={transform} origin={vec(b.s / 2, b.s / 2)} opacity={opacity}>
      <RoundedRect x={0} y={0} width={b.s} height={b.s} r={b.s * 0.3} color={HUES[b.c]} />
    </Group>
  );
}

export default function Storm({ width, height = 260 }: {
  width: number; height?: number; zoom?: number; // zoom kept for API parity
}) {
  const sweep = useDrift(26000); // the prism slides along the base
  const breath = useDrift(9000); // the whole aurora breathes

  const W = width * 1.7;
  const sweepX = useDerivedValue(() => [{ translateX: -(W - width) * sweep.value }]);
  const glowOpacity = useDerivedValue(() => 0.78 + breath.value * 0.22);

  return (
    <View pointerEvents="none" style={[styles.wrap, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group layer={<Paint />} opacity={glowOpacity}>
          <Group layer={<Paint><Blur blur={24} /></Paint>}>
            {/* PRISM: the spectrum band along the base */}
            <Group transform={sweepX}>
              <Rect x={0} y={height * 0.55} width={W} height={height * 0.6}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(W, 0)}
                  colors={[...HUES, HUES[0], HUES[1]]}
                />
              </Rect>
            </Group>
            {/* NORTHERN LIGHTS: five hue veils rising from the horizon */}
            {CURTAINS.map((_, i) => (
              <Curtain key={i} i={i} width={width} height={height} />
            ))}
            {/* a warm core so the veils share one bed of light */}
            <Circle cx={width / 2} cy={height * 0.9} r={width * 0.5}>
              <RadialGradient
                c={vec(width / 2, height * 0.9)}
                r={width * 0.5}
                colors={['rgba(167,139,250,0.35)', 'rgba(167,139,250,0)']}
                positions={[0, 0.85]}
              />
            </Circle>
          </Group>
          {/* OUR BLOCKS: sharp candy tiles adrift inside the blur */}
          {DRIFT_BLOCKS.map((b, i) => (
            <DriftBlock key={i} b={b} width={width} height={height} />
          ))}
          {/* feather BOTH edges — the tall head melts into home, the tail
              melts into the board (mounted past the screen at park) */}
          <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, height)}
              colors={[
                'rgba(0,0,0,0)',
                'rgba(0,0,0,0.45)',
                'rgba(0,0,0,1)',
                'rgba(0,0,0,1)',
                'rgba(0,0,0,0)',
              ]}
              positions={[0.02, 0.34, 0.56, 0.78, 0.99]}
            />
          </Rect>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
