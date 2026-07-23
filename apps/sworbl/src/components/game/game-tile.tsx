// One candy tile. Selection reads the shared-value path ON THE UI THREAD;
// springs fire from reactions on change, never per-frame (PHASE2 #1/#4).
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  type SharedValue,
} from 'react-native-reanimated';
import { PALETTE, INK } from '@/game/palette';
import type { TileT, TraceTile } from '@/game/types';

const FALL_SPRING = { mass: 0.7, damping: 16, stiffness: 220 };
const POP_SPRING = { mass: 0.5, damping: 12, stiffness: 320 };

interface Props {
  tile: TileT;
  size: number;
  gap: number;
  sPath: SharedValue<TraceTile[]>;
  clearing: boolean;
}

function GameTileInner({ tile, size, gap, sPath, clearing }: Props) {
  const cell = size + gap;
  const x = tile.col * cell;
  const targetY = tile.row * cell;

  const y = useSharedValue(tile.spawnDrop ? -(tile.spawnDrop + 1) * cell : targetY);
  const baseScale = useSharedValue(tile.spawnDrop ? 0.6 : 1);
  const opacity = useSharedValue(tile.spawnDrop ? 0 : 1);

  useEffect(() => {
    const delay = tile.spawnDrop ? tile.spawnDrop * 40 : 0;
    y.value = withDelay(delay, withSpring(targetY, FALL_SPRING));
    baseScale.value = withDelay(delay, withSpring(1, POP_SPRING));
    opacity.value = withDelay(delay, withTiming(1, { duration: 120 }));
  }, [targetY]);

  useEffect(() => {
    if (clearing) {
      baseScale.value = withSequence(
        withTiming(1.25, { duration: 90 }),
        withTiming(0, { duration: 140 })
      );
      opacity.value = withDelay(90, withTiming(0, { duration: 140 }));
    }
  }, [clearing]);

  const pal = PALETTE[tile.ci] || PALETTE[0];

  const sSel = useSharedValue(false);
  const selScale = useSharedValue(1);
  useAnimatedReaction(
    () => {
      const p = sPath.value;
      for (let i = 0; i < p.length; i++) if (p[i].id === tile.id) return true;
      return false;
    },
    (cur, prev) => {
      if (cur !== prev) {
        sSel.value = cur;
        selScale.value = withSpring(cur ? 1.12 : 1, POP_SPRING);
      }
    }
  );

  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: x },
      { translateY: y.value },
      // two scale slots compose multiplicatively: fall/clear × selection pop
      { scale: baseScale.value },
      { scale: selScale.value },
    ],
    opacity: opacity.value,
    backgroundColor: sSel.value ? pal.hi : pal.bg,
  }));

  return (
    <Animated.View
      style={[
        styles.tile,
        anim,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.27),
          shadowColor: pal.edge,
          // candy ledge: solid offset shadow, no blur — the web tile recipe
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 1,
          shadowRadius: 0,
        },
      ]}>
      <Animated.Text
        style={[
          styles.letter,
          { fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62) },
        ]}>
        {tile.letter.toUpperCase()}
      </Animated.Text>
    </Animated.View>
  );
}

// a readout re-render in the board must never touch 30 tiles
export const GameTile = React.memo(
  GameTileInner,
  (a, b) => a.tile === b.tile && a.size === b.size && a.gap === b.gap && a.clearing === b.clearing
);

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    color: INK,
    includeFontPadding: false,
  },
});
