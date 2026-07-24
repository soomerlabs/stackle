// Trace connector — NATIVE, web-parity: EACH SEGMENT wears ITS tile's candy
// (web trailSegs: per-seg color at 45%, the tip at 85%, dotted 1-9, round
// caps). Tier-2 constraint: Skia nodes can't be created from the UI thread,
// so a FIXED POOL of segment paths is always mounted; each derives its own
// geometry/color/opacity from the shared path — unused segments park off-board.
import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Path, DashPathEffect } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { PALETTE } from '@/game/palette';
import type { TraceTile } from '@/game/types';

const PAL_BG = PALETTE.map((p) => p.bg);
const MAX_SEGS = 29; // a full-board chain

interface SegProps {
  sPath: SharedValue<TraceTile[]>;
  sTrail?: SharedValue<TraceTile[]>; // held shape for the release evaporate
  sTrailFade?: SharedValue<number>;
  idx: number;
  size: number;
  cell: number;
}

function Seg({ sPath, sTrail, sTrailFade, idx, size, cell }: SegProps) {
  // EVAPORATE (fossil lastTrailSegs): when the live path clears, the held
  // copy keeps the shape while a 220ms fade takes it out — never a snap
  const d = useDerivedValue(() => {
    const live = sPath.value;
    const p = live.length ? live : (sTrail?.value ?? live);
    if (idx >= p.length - 1) return 'M -99 -99';
    const a = p[idx], b = p[idx + 1];
    return `M ${a.col * cell + size / 2} ${a.row * cell + size / 2} L ${b.col * cell + size / 2} ${b.row * cell + size / 2}`;
  });
  const color = useDerivedValue(() => {
    const live = sPath.value;
    const p = live.length ? live : (sTrail?.value ?? live);
    const b = p[idx + 1] ?? p[p.length - 1];
    return PAL_BG[(b ? b.ci : 0) % 6];
  });
  const opacity = useDerivedValue(() => {
    const live = sPath.value;
    const held = !live.length;
    const p = live.length ? live : (sTrail?.value ?? live);
    if (idx >= p.length - 1) return 0;
    const base = idx === p.length - 2 ? 0.85 : 0.45; // tip glows hardest (web)
    return held ? base * (sTrailFade?.value ?? 0) : base;
  });
  const strokeWidth = useDerivedValue(() => {
    const live = sPath.value;
    const p = live.length ? live : (sTrail?.value ?? live);
    return idx === p.length - 2 ? Math.max(6, size * 0.13) : Math.max(5, size * 0.11);
  });
  return (
    <Path path={d} style="stroke" color={color} opacity={opacity} strokeWidth={strokeWidth} strokeCap="round">
      <DashPathEffect intervals={[1, 9]} />
    </Path>
  );
}

interface Props {
  sPath: SharedValue<TraceTile[]>;
  sTrail?: SharedValue<TraceTile[]>;
  sTrailFade?: SharedValue<number>;
  size: number;
  gap: number;
  width: number;
  height: number;
}

export default function TraceConnector({ sPath, sTrail, sTrailFade, size, gap, width, height }: Props) {
  const cell = size + gap;
  return (
    <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
      {Array.from({ length: MAX_SEGS }, (_, i) => (
        <Seg key={i} sPath={sPath} sTrail={sTrail} sTrailFade={sTrailFade} idx={i} size={size} cell={cell} />
      ))}
    </Canvas>
  );
}
