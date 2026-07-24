// Trace connector — WEB: per-segment SVG lines in each tile's candy (web
// trailSegs parity), fed by the JS mirror of the path.
import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { SharedValue } from 'react-native-reanimated';
import { PALETTE } from '@/game/palette';
import type { TraceTile } from '@/game/types';

interface Props {
  sPath: SharedValue<TraceTile[]>;
  jsPath?: TraceTile[];
  size: number;
  gap: number;
  width: number;
  height: number;
  sTrail?: unknown; // native-only (release evaporate) — web mirrors via jsPath
  sTrailFade?: unknown;
}

export default function TraceConnector({ jsPath, size, gap, width, height }: Props) {
  const p = jsPath || [];
  if (p.length < 2) return null;
  const cell = size + gap;
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={width} height={height}>
      {p.slice(0, -1).map((a, i) => {
        const b = p[i + 1];
        const tip = i === p.length - 2;
        return (
          <Line
            key={i}
            x1={a.col * cell + size / 2}
            y1={a.row * cell + size / 2}
            x2={b.col * cell + size / 2}
            y2={b.row * cell + size / 2}
            stroke={PALETTE[b.ci % PALETTE.length].bg}
            strokeOpacity={tip ? 0.85 : 0.45}
            strokeWidth={tip ? Math.max(6, size * 0.13) : Math.max(5, size * 0.11)}
            strokeDasharray="1 9"
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}
