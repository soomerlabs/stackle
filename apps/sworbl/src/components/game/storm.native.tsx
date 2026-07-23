// Aurora-of-blocks storm — NATIVE (Skia), matched 1:1 to the web spec
// (index.html .storm* CSS + #stormGoo filter). Proven on the Phase-0 spike:
// 6 tileblobs anchored at the bottom edge (half below the fold), exact orbit
// keyframes 15-22s, goo = blur(11)+alpha 30/-14 blended over sharp source,
// all inside blur(12), purple pulsing haze, radial mask from below-bottom-center.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas, Group, Paint, Blur, ColorMatrix, RoundedRect, Rect, Circle,
  LinearGradient, RadialGradient, vec,
} from '@shopify/react-native-skia';
import {
  useSharedValue, useDerivedValue, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { BG_DARK } from '@/game/palette';

interface Blob {
  xPct: number;
  bot: number;
  s: number;
  c: string;
  dur: number;
  f: [number, number, number]; // 0% keyframe: dx, dy, scale
  t: [number, number, number]; // 50% keyframe
}

// verbatim from .stormB1-B6
const BLOBS: Blob[] = [
  { xPct: 1,  bot: -2,  s: 44, c: '#A78BFA', dur: 17000, f: [-4, 5, 0.9],  t: [10, -9, 1.02] },
  { xPct: 19, bot: -12, s: 54, c: '#5BC8F5', dur: 19000, f: [5, 4, 1.02],  t: [-14, -19, 0.93] },
  { xPct: 38, bot: -22, s: 68, c: '#5FD6A8', dur: 15000, f: [-8, 6, 0.94], t: [10, -32, 1.12] },
  { xPct: 55, bot: -20, s: 64, c: '#F58FB8', dur: 21000, f: [8, 5, 1.05],  t: [-10, -29, 0.9] },
  { xPct: 74, bot: -12, s: 54, c: '#F5B84A', dur: 18000, f: [-5, 4, 0.96], t: [15, -18, 1.06] },
  { xPct: 91, bot: -2,  s: 44, c: '#F58A66', dur: 22000, f: [4, 5, 0.9],   t: [-10, -9, 1.02] },
];

// #stormGoo's alpha snap: blur(11) then alpha ×30 -14
const GOO = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 30, -14];

function useOrbit(dur: number) {
  const t = useSharedValue(0);
  useEffect(() => {
    // 0→1→0 mirrors the CSS 0%→50%→100% keyframe loop
    t.value = withRepeat(
      withTiming(1, { duration: dur / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [dur]);
  return t;
}

function DriftBlob({ b, width, height }: { b: Blob; width: number; height: number }) {
  const t = useOrbit(b.dur);
  const bx = (b.xPct / 100) * width;
  const by = height - b.s - b.bot; // negative bot pushes past the bottom edge
  const transform = useDerivedValue(() => {
    const k = t.value;
    const lerp = (a: number, z: number) => a + (z - a) * k;
    return [
      { translateX: bx + lerp(b.f[0], b.t[0]) },
      { translateY: by + lerp(b.f[1], b.t[1]) },
      { scale: lerp(b.f[2], b.t[2]) },
    ];
  });
  return (
    <Group transform={transform} origin={vec(b.s / 2, b.s / 2)}>
      <RoundedRect x={0} y={0} width={b.s} height={b.s} r={22} color={b.c} />
    </Group>
  );
}

function BlobField({ width, height }: { width: number; height: number }) {
  return (
    <>
      {BLOBS.map((b, i) => (
        <DriftBlob key={i} b={b} width={width} height={height} />
      ))}
    </>
  );
}

export default function Storm({ width, height = 260 }: { width: number; height?: number }) {
  const hazeT = useOrbit(20000);
  const hazeOpacity = useDerivedValue(() => 0.4 + hazeT.value * 0.22);
  const cx = width / 2;

  return (
    <View pointerEvents="none" style={[styles.wrap, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group layer={<Paint />}>
          {/* stormHaze: purple radial glow, center-bottom, pulsing 0.4↔0.62 */}
          <Group opacity={hazeOpacity}>
            <Circle cx={cx} cy={height - 25} r={110}>
              <RadialGradient
                c={vec(cx, height - 25)}
                r={110}
                colors={['rgba(167,139,250,0.22)', 'rgba(167,139,250,0)']}
                positions={[0, 0.74]}
              />
            </Circle>
          </Group>

          {/* .stormBlockwrap: the whole goo composite inside blur(12) */}
          <Group layer={<Paint><Blur blur={12} /></Paint>}>
            {/* feBlend: sharp source blobs UNDER the goo'd copy */}
            <BlobField width={width} height={height} />
            <Group layer={<Paint><Blur blur={11} /><ColorMatrix matrix={GOO} /></Paint>}>
              <BlobField width={width} height={height} />
            </Group>
          </Group>

          {/* .stormAura radial mask: solid 34%, half 66%, gone 88% from 50%/110% */}
          <Rect x={0} y={0} width={width} height={height} blendMode="dstIn">
            <RadialGradient
              c={vec(cx, height * 1.1)}
              r={Math.max(width * 0.675, height * 0.96)}
              colors={['rgba(0,0,0,1)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']}
              positions={[0.34, 0.66, 0.88]}
            />
          </Rect>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: BG_DARK + '00', // transparent; canvas draws everything
  },
});
