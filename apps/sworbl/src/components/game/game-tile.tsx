// One board tile — WEB-PARITY VISUALS + MOTION (fossil tile builder):
//   • MONO board: tiles idle gray, LIGHT INTO CANDY only while traced.
//   • GRAVITY fall (web: cubic-bezier(0.45,0.02,0.7,0.5), dur = dist/1200s
//     clamped 0.28-0.55) with the landing SQUASH (scaleY 0.85 → back).
//   • NOPE: rejected words shake red in place (web nopeTiles).
//   • Structure: OUTER view carries the layout `exiting` (the morph); INNER
//     carries animated transforms — Reanimated forbids both on one node.
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  FadeOutDown,
  type SharedValue,
} from 'react-native-reanimated';
import { PALETTE, INK, MONO_DARK, MONO_INK } from '@/game/palette';
import type { TileT, TraceTile } from '@/game/types';

const FALL_EASE = Easing.bezier(0.45, 0.02, 0.7, 0.5); // accelerate, hard stop

interface Props {
  tile: TileT;
  size: number;
  gap: number;
  sPath: SharedValue<TraceTile[]>;
  clearingSeq: number | undefined; // position in the swiped word (pop stagger), undefined = alive
  nope: number; // increments per rejected word this tile was part of
  nopeSeq: number; // this tile's position in the rejected word
  nopeTotal: number; // rejected word length (drain sweeps head→back)
}

function GameTileInner({ tile, size, gap, sPath, clearingSeq, nope, nopeSeq, nopeTotal }: Props) {
  const cell = size + gap;
  const x = tile.col * cell;
  const targetY = tile.row * cell;
  const lift = Math.max(3, Math.round(size * 0.08));
  const rad = Math.round(size * 0.2);

  const y = useSharedValue(tile.spawnDrop ? -(tile.spawnDrop + 1) * cell : targetY);
  const scale = useSharedValue(1);
  const squashY = useSharedValue(1);
  const opacity = useSharedValue(1);

  // gravity: duration from distance (web formula), squash on landing
  useEffect(() => {
    const dist = Math.abs(targetY - y.value);
    if (dist < 1) return;
    const dur = Math.max(280, Math.min(550, (dist / 1200) * 1000));
    const delay = tile.spawnDrop ? tile.spawnDrop * 40 : tile.col * 20;
    y.value = withDelay(
      delay,
      withTiming(targetY, { duration: dur, easing: FALL_EASE }, (fin) => {
        'worklet';
        if (fin) {
          squashY.value = withSequence(
            withTiming(0.85, { duration: 60 }),
            withTiming(1, { duration: 110 })
          );
        }
      })
    );
  }, [targetY]);

  // valid word: tiles POP IN SWIPE ORDER (web clearSeq · 45ms/tile) — the
  // full-board-submit cascade the owner loved on web
  useEffect(() => {
    if (clearingSeq !== undefined) {
      const d = clearingSeq * 45;
      scale.value = withDelay(
        d,
        withSequence(withTiming(1.25, { duration: 90 }), withTiming(0, { duration: 140 }))
      );
      opacity.value = withDelay(d + 90, withTiming(0, { duration: 140 }));
    }
  }, [clearingSeq]);

  // THE WAVE-NO (web rjArrive + tileDeflate + rjDrainOut): the whole word
  // turns red TOGETHER (0.26s blend), DEFLATES in unison (womp: 1.07→0.94→1),
  // then the red DRAINS OUT FROM THE HEAD backwards (35ms/tile, from 0.5s)
  const sRed = useSharedValue(0);
  const deflate = useSharedValue(1);
  useEffect(() => {
    if (!nope) return;
    const drainDelay = 500 + (nopeTotal - 1 - nopeSeq) * 35;
    sRed.value = withSequence(
      withTiming(1, { duration: 65 }), // rjArrive's 25% snap
      withTiming(1, { duration: Math.max(0, drainDelay - 65) }),
      withTiming(0, { duration: 420 }) // rjDrainOut
    );
    deflate.value = withSequence(
      withTiming(1.07, { duration: 92 }),
      withTiming(0.94, { duration: 129 }),
      withTiming(1.005, { duration: 110 }),
      withTiming(1, { duration: 129 })
    );
  }, [nope]);

  const pal = PALETTE[tile.ci] || PALETTE[0];

  // lit: 0 mono · 1 chain · 2 head; dimmed while a chain is lit elsewhere
  const sLit = useSharedValue(0);
  const sDim = useSharedValue(false);
  const liftY = useSharedValue(0);
  const headScale = useSharedValue(1);
  useAnimatedReaction(
    () => {
      const p = sPath.value;
      if (!p.length) return 0;
      for (let i = 0; i < p.length; i++) {
        if (p[i].id === tile.id) return i === p.length - 1 ? 2 : 1;
      }
      return 3;
    },
    (cur, prev) => {
      if (cur === prev) return;
      const lit = cur === 1 || cur === 2 ? cur : 0;
      sLit.value = lit;
      sDim.value = cur === 3;
      liftY.value = withTiming(
        lit === 2 ? -Math.max(2, Math.round(size * 0.06)) : lit === 1 ? -Math.max(1, Math.round(size * 0.03)) : 0,
        { duration: 110 }
      );
      headScale.value = withTiming(lit === 2 ? 1.03 : 1, { duration: 110 });
    }
  );

  const inner = useAnimatedStyle(() => ({
    transform: [
      { translateX: x },
      { translateY: y.value + liftY.value },
      { scale: scale.value * deflate.value },
      { scale: headScale.value },
      { scaleY: squashY.value },
    ],
    opacity: opacity.value * (sDim.value ? 0.9 : 1),
  }));

  const ledgeStyle = useAnimatedStyle(() => ({
    backgroundColor: sRed.value > 0.5 ? '#8C2328' : sLit.value ? pal.edge : MONO_DARK.edge,
    top: lift + (sLit.value === 2 ? 2 : sLit.value === 1 ? 1 : 0),
  }));
  const faceStyle = useAnimatedStyle(() => ({
    backgroundColor: sRed.value > 0.5 ? '#E5484D' : sLit.value ? pal.bg : MONO_DARK.bg,
  }));
  const letterStyle = useAnimatedStyle(() => ({
    color: sRed.value > 0.5 ? '#FFFFFF' : sLit.value ? INK : MONO_INK,
  }));

  // OUTER: layout exiting only — THE MORPH: tiles FALL INTO the rising
  // keyboard (downward fade, bottom rows first, slight column ripple)
  return (
    <Animated.View
      exiting={FadeOutDown.duration(240).delay((5 - tile.row) * 40 + tile.col * 15)}
      style={styles.outer}>
      <Animated.View style={[inner, { width: size, height: size + lift + 2 }]}>
        <Animated.View
          style={[styles.ledge, ledgeStyle, { width: size, height: size, borderRadius: rad }]}
        />
        <Animated.View
          style={[styles.face, faceStyle, { width: size, height: size, borderRadius: rad }]}>
          <Animated.Text
            style={[
              styles.letter,
              letterStyle,
              { fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62) },
            ]}>
            {tile.letter.toUpperCase()}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// a trace-driven readout re-render in the board must never touch 30 tiles
export const GameTile = React.memo(
  GameTileInner,
  (a, b) =>
    a.tile === b.tile && a.size === b.size && a.gap === b.gap &&
    a.clearingSeq === b.clearingSeq && a.nope === b.nope
);

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  ledge: {
    position: 'absolute',
    left: 0,
  },
  face: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    includeFontPadding: false,
  },
});
