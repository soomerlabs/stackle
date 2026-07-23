// Trace connector — NATIVE: Skia path derived from the shared path value,
// drawn on the UI thread (PHASE2 #1). Web variant renders SVG (no WASM, #7).
import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Path } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { TraceTile } from '@/game/types';

interface Props {
  sPath: SharedValue<TraceTile[]>;
  size: number;
  gap: number;
  width: number;
  height: number;
}

export default function TraceConnector({ sPath, size, gap, width, height }: Props) {
  const cell = size + gap;
  const d = useDerivedValue(() => {
    const p = sPath.value;
    if (p.length < 2) return 'M -99 -99'; // off-board no-op (Skia rejects '')
    let s = '';
    for (let i = 0; i < p.length; i++) {
      const x = p[i].col * cell + size / 2, y = p[i].row * cell + size / 2;
      s += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    }
    return s;
  });
  return (
    <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
      <Path
        path={d}
        style="stroke"
        color="#FFFFFF"
        opacity={0.45}
        strokeWidth={size * 0.16}
        strokeCap="round"
        strokeJoin="round"
      />
    </Canvas>
  );
}
