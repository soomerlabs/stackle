// One board tile — WEB-PARITY VISUALS + MOTION (fossil tile builder):
//   • MONO board: tiles idle gray, LIGHT INTO CANDY only while traced.
//   • GRAVITY fall (web: cubic-bezier(0.45,0.02,0.7,0.5), dur = dist/1200s
//     clamped 0.28-0.55) with the landing SQUASH (scaleY 0.85 → back).
//   • NOPE: rejected words shake red in place (web nopeTiles).
//   • Structure: OUTER view carries the layout `exiting` (the morph); INNER
//     carries animated transforms — Reanimated forbids both on one node.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  interpolateColor,
  type SharedValue,
} from 'react-native-reanimated';
import { PALETTE, INK, type GameSurface } from '@/game/palette';
import { COLS, ROWS, type TileT, type TraceTile } from '@/game/types';

// softer entry, still a hard-ish landing (owner: falls needed smoothing —
// the old curve slammed off the line with a visible first-frame jump)
const FALL_EASE = Easing.bezier(0.3, 0.02, 0.65, 0.6);

interface Props {
  tile: TileT;
  size: number;
  gap: number;
  sPath: SharedValue<TraceTile[]>;
  clearingSeq: number | undefined; // position in the swiped word (pop stagger), undefined = alive
  nope: number; // increments per rejected word this tile was part of
  nopeSeq: number; // this tile's position in the rejected word
  nopeTotal: number; // rejected word length (drain sweeps head→back)
  concealed: boolean; // letters only exist while YOUR clock runs (anti-stare)
  gs: GameSurface; // scheme surface (STABLE module object — memo-safe)
}

function GameTileInner({ tile, size, gap, sPath, clearingSeq, nope, nopeSeq, nopeTotal, concealed, gs }: Props) {
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
    const dur = Math.max(340, Math.min(620, (dist / 1100) * 1000));
    const delay = tile.spawnDrop ? tile.spawnDrop * 55 : tile.col * 24;
    y.value = withDelay(
      delay,
      withTiming(targetY, { duration: dur, easing: FALL_EASE }, (fin) => {
        'worklet';
        if (fin) {
          squashY.value = withSequence(
            withTiming(0.88, { duration: 70 }),
            withTiming(1, { duration: 130 })
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
  // SNAPPIER than the web fossil (owner: the round is timed — "get it over
  // with"): shorter red hold, faster drain, tighter womp. Same shape, ~60% time.
  const sRed = useSharedValue(0);
  const deflate = useSharedValue(1);
  useEffect(() => {
    if (!nope) return;
    const drainDelay = 280 + (nopeTotal - 1 - nopeSeq) * 22;
    sRed.value = withSequence(
      // BLOOM, not blind (owner): the 65ms snap to full red flashed the whole
      // word at once — eased arrival like the web's rjArrive transition
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: Math.max(0, drainDelay - 160) }),
      withTiming(0, { duration: 260 }) // rjDrainOut, hurried
    );
    deflate.value = withSequence(
      withTiming(1.07, { duration: 70 }),
      withTiming(0.94, { duration: 95 }),
      withTiming(1.005, { duration: 80 }),
      withTiming(1, { duration: 95 })
    );
  }, [nope]);

  // THE WAKE (owner count-in redesign): letters are masked until the clock
  // runs; when concealment lifts, each letter STAMPS IN with a pop, staggered
  // by distance from the board's center — the shockwave's footprint.
  const sLetterO = useSharedValue(concealed ? 0 : 1);
  const wakePop = useSharedValue(1);
  useEffect(() => {
    if (concealed) {
      sLetterO.value = 0;
      return;
    }
    const dist = Math.hypot(tile.col - (COLS - 1) / 2, tile.row - (ROWS - 1) / 2);
    const delay = Math.round(dist * 60);
    sLetterO.value = withDelay(delay, withTiming(1, { duration: 150 }));
    wakePop.value = withDelay(
      delay,
      withSequence(withTiming(1.09, { duration: 100 }), withTiming(1, { duration: 140 }))
    );
  }, [concealed]);

  // THE STACK (web mergeTiles): survivor pops on impact; badge wears ×mult
  const stackPop = useSharedValue(1);
  useEffect(() => {
    if (!tile.boost) return;
    stackPop.value = withSequence(
      withTiming(1.18, { duration: 90 }),
      withTiming(0.96, { duration: 110 }),
      withTiming(1, { duration: 100 })
    );
  }, [tile.boost]);

  const pal = PALETTE[tile.ci] || PALETTE[0];

  // lit: 0 mono · 1 chain · 2 head; dimmed while a chain is lit elsewhere
  const sLit = useSharedValue(0);
  const sDim = useSharedValue(1);
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
      // web: the recede is EASED (opacity 0.25s), never a snap
      sDim.value = withTiming(cur === 3 ? 0.9 : 1, { duration: 250 });
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
      { scale: scale.value * deflate.value * stackPop.value * wakePop.value },
      { scale: headScale.value },
      { scaleY: squashY.value },
    ],
    opacity: opacity.value * sDim.value,
  }));

  // the red BLENDS in and drains out (web rjArrive/rjDrainOut are color
  // transitions) — the old `> 0.5` test snapped mid-drain, the reported jank
  const ledgeStyle = useAnimatedStyle(() => {
    const base = sLit.value ? pal.edge : gs.mono.edge;
    return {
      backgroundColor:
        sRed.value > 0 ? interpolateColor(sRed.value, [0, 1], [base, '#8C2328']) : base,
      top: lift + (sLit.value === 2 ? 2 : sLit.value === 1 ? 1 : 0),
    };
  });
  const faceStyle = useAnimatedStyle(() => {
    const base = sLit.value ? pal.bg : gs.mono.bg;
    return {
      backgroundColor:
        sRed.value > 0 ? interpolateColor(sRed.value, [0, 1], [base, '#E5484D']) : base,
    };
  });
  const letterStyle = useAnimatedStyle(() => {
    const base = sLit.value ? INK : gs.monoInk;
    return {
      color: sRed.value > 0 ? interpolateColor(sRed.value, [0, 1], [base, '#FFFFFF']) : base,
      opacity: sLetterO.value,
    };
  });


  // OUTER/INNER split (layout-anim vs transforms); the board→finale fade is
  // owned by the play-sheet wrapper — tiles carry NO exit of their own
  return (
    <Animated.View style={styles.outer}>
      <Animated.View style={[inner, { width: size, height: size + lift + 2 }]}>
        <Animated.View
          style={[
            styles.ledge,
            ledgeStyle,
            { width: size, height: size, borderRadius: rad },
            // one static shadow property — never the old 30-glow-views mistake
            gs.tileAmbient ? { boxShadow: gs.tileAmbient } : null,
          ]}
        />
        <Animated.View
          style={[styles.face, faceStyle, { width: size, height: size, borderRadius: rad }]}>
          {/* bevel on its OWN static layer — inset shadows on the color-
              animated face forced per-frame shadow recompute (the wave-no
              hesitation, owner: "jenk!") */}
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: rad, boxShadow: gs.tileBevel }]}
          />
          <Animated.Text
            style={[
              styles.letter,
              letterStyle,
              {
                fontSize: Math.round(size * (tile.letter === 'q' ? 0.42 : 0.5)),
                lineHeight: Math.round(size * 0.62),
              },
            ]}>
            {tile.letter === 'q' ? 'Qu' : tile.letter.toUpperCase()}
          </Animated.Text>
          {!concealed && !!tile.boost && (
            <Animated.View
              style={[
                styles.stackBadge,
                {
                  minWidth: Math.round(size * 0.34),
                  height: Math.round(size * 0.3),
                  borderRadius: Math.round(size * 0.15),
                  top: Math.round(size * 0.06),
                  right: Math.round(size * 0.06),
                },
              ]}>
              <Animated.Text style={[styles.stackText, { fontSize: Math.round(size * 0.2) }]}>
                ×{tile.boost + 1}
              </Animated.Text>
            </Animated.View>
          )}
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
    a.clearingSeq === b.clearingSeq && a.nope === b.nope && a.concealed === b.concealed &&
    a.gs === b.gs
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
    // NO top-edge decoration: RN borders render web's soft inset highlights
    // as hard gray lines (owner: 'gray line on top of the blocks'). Flat face
    // on ledge IS the web look at phone scale.
  },
  letter: {
    fontFamily: 'Fredoka_600SemiBold',
    includeFontPadding: false,
  },
  stackBadge: {
    position: 'absolute',
    paddingHorizontal: 3,
    backgroundColor: 'rgba(15,15,20,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
});
