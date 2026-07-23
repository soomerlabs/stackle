// THE SWORBL AURORA v4 — NATIVE (Skia). Owner: "bring back our original
// block-based storm but more like it is today — v3 was washed out."
// The fossil's excitement was the GOO: blur the blob field, then SNAP the
// alpha (×30 −14) — soft mist becomes chunky liquid candy with real edges.
//   · GOO BLOBS: the six original tileblobs (fossil geometry ×1.4), orbiting
//     on their 15-22s keyframes, goo'd copy over sharp source — the heroes
//   · PRISM BED: today's six-hue sweep beneath them, dimmed to a bed
//   · VEILS: two faint northern-light curtains for the tall head
//   · BLOCKS: three sharp candy tiles adrift in the light
// Feathered top AND bottom (home mounts the canvas taller than the band —
// the bottom melt hangs off-screen at park). WEB SIBLING: storm.tsx carries
// a simpler CSS-blur port — patch both or state why not (split-file trap).
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas, Group, Paint, Blur, ColorMatrix, Rect, RoundedRect,
  LinearGradient, vec,
} from '@shopify/react-native-skia';
import {
  useSharedValue, useDerivedValue, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';

const HUES = ['#A78BFA', '#5BC8F5', '#5FD6A8', '#F58FB8', '#F5B84A', '#F58A66'];

// two faint veils only — v3's five washed the field out (owner)
const CURTAINS = [
  { x: 0.18, c: 1, sway: -16, dur: 23000 },
  { x: 0.72, c: 3, sway: 14, dur: 21000 },
] as const;

// THE GOO BLOBS — fossil .stormB1-B6 geometry ×1.4, y as canvas fraction
// (the band's visible zone on the tall crest canvas); f/t = the 0%/50%
// orbit keyframes (dx, dy, scale), periods 15-22s
// risen into the PLAY tiles' zone (owner) — and each blob is a REAL
// SWORBL TILE now: candy face on its darker ledge (the board's own
// construction), edges from the brand palette
const BLOBS = [
  { x: 0.04, y: 0.58, s: 68, c: '#A78BFA', e: '#7C5CE0', dur: 17000, f: [-6, 7, 0.9], t: [14, -13, 1.02] },
  { x: 0.21, y: 0.54, s: 84, c: '#5BC8F5', e: '#2E9FD0', dur: 19000, f: [7, 6, 1.02], t: [-20, -27, 0.93] },
  { x: 0.4, y: 0.5, s: 104, c: '#5FD6A8', e: '#38AD7F', dur: 15000, f: [-11, 8, 0.94], t: [14, -45, 1.12] },
  { x: 0.57, y: 0.51, s: 99, c: '#F58FB8', e: '#D06090', dur: 21000, f: [11, 7, 1.05], t: [-14, -41, 0.9] },
  { x: 0.75, y: 0.54, s: 84, c: '#F5B84A', e: '#CE9022', dur: 18000, f: [-7, 6, 0.96], t: [21, -25, 1.06] },
  { x: 0.9, y: 0.58, s: 68, c: '#F58A66', e: '#C65F3E', dur: 22000, f: [6, 7, 0.9], t: [-14, -13, 1.02] },
] as const;

// the fossil #stormGoo alpha snap: blur first, then alpha ×30 −14 — soft
// mist becomes liquid candy with edges (the missing excitement, owner)
const GOO = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 30, -14];

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

function GooBlob({ b, width, height }: { b: (typeof BLOBS)[number]; width: number; height: number }) {
  const t = useDrift(b.dur);
  const transform = useDerivedValue(() => {
    const k = t.value;
    const lerp = (a: number, z: number) => a + (z - a) * k;
    return [
      { translateX: width * b.x + lerp(b.f[0], b.t[0]) },
      { translateY: height * b.y + lerp(b.f[1], b.t[1]) },
      { scale: lerp(b.f[2], b.t[2]) },
    ];
  });
  const r = Math.round(b.s * 0.26);
  const lift = Math.max(4, Math.round(b.s * 0.09));
  return (
    <Group transform={transform} origin={vec(b.s / 2, b.s / 2)}>
      {/* the LEDGE beneath, then the face — the board's own construction */}
      <RoundedRect x={0} y={lift} width={b.s} height={b.s} r={r} color={b.e} />
      <RoundedRect x={0} y={0} width={b.s} height={b.s} r={r} color={b.c} />
    </Group>
  );
}

function BlobField({ width, height }: { width: number; height: number }) {
  return (
    <>
      {BLOBS.map((b, i) => (
        <GooBlob key={i} b={b} width={width} height={height} />
      ))}
    </>
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
          {/* the BED, dimmed — prism sweep + two faint veils + warm core;
              at full strength it washed the blobs out (owner, v3) */}
          <Group layer={<Paint><Blur blur={24} /></Paint>} opacity={0.3}>
            <Group transform={sweepX}>
              <Rect x={0} y={height * 0.46} width={W} height={height * 0.66}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(W, 0)}
                  colors={[...HUES, HUES[0], HUES[1]]}
                />
              </Rect>
            </Group>
            {CURTAINS.map((_, i) => (
              <Curtain key={i} i={i} width={width} height={height} />
            ))}
          </Group>
          {/* THE GOO BLOBS — the fossil recipe, the heroes: sharp source
              UNDER the goo'd copy (blur 11 → alpha ×30 −14), the whole
              composite inside a soft blur(10) so it sits IN the weather */}
          <Group layer={<Paint><Blur blur={2} /></Paint>}>
            <BlobField width={width} height={height} />
            <Group layer={<Paint><Blur blur={5} /><ColorMatrix matrix={GOO} /></Paint>}>
              <BlobField width={width} height={height} />
            </Group>
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
              positions={[0.02, 0.3, 0.5, 0.86, 0.99]}
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
