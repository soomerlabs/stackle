// THE WORD OF THE DAY section — hero tiles (dashed mystery pre-play, the
// Wordle-grammar candy FLIP reveal after), the miss line, the twist pill,
// and the six blank hint slots. Extracted from home (the index god-file
// split); pure display.
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withTiming, interpolate, Easing,
} from 'react-native-reanimated';

import { ARCHETYPE_LABEL } from '@/components/game/result-view';
import { PALETTE, INK, tileColorFor, gameSurface } from '@/game/palette';
import { type Theme } from '@/game/theme';

export const twistLabel = (a: string) => ARCHETYPE_LABEL[a] ?? null;

// the six blank hint slots: staggered widths, NO letter-count leak. SMALLER
// than the hero word blocks in both axes (owner: the placeholders were
// out-measuring the word of the day — the hierarchy was upside down)
const HINT_SLOT_W = [40, 36, 44, 38, 36, 42];

// THE REVEAL FLIP (owner: 'the wordle character reversal') — each answer
// tile flips over on arrival, staggered down the word: mono back → candy
// face at the halfway point. Shared values only.
function FlipTile({ ch, i, w, h, r, palBg, palEdge, monoBg, monoEdge }: {
  ch: string; i: number; w: number; h: number; r: number;
  palBg: string; palEdge: string; monoBg: string; monoEdge: string;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(200 + i * 160, withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pose = useAnimatedStyle(() => {
    // AT REST: a PLAIN untransformed tile (owner: letters pixelated — iOS
    // rasterizes perspective layers, so resting at rotateX 180 kept the
    // text in a low-res raster forever). The flip is transient; the
    // destination is an ordinary crisp tile.
    if (p.value >= 1) {
      return {
        transform: [],
        backgroundColor: palBg,
        boxShadow: `inset 0 -5px 0 ${palEdge}, 0 2px 3px rgba(0,0,0,0.3)`,
      };
    }
    const deg = interpolate(p.value, [0, 1], [0, 180]);
    const flipped = p.value > 0.5;
    return {
      transform: [{ perspective: 600 }, { rotateX: `${deg}deg` }],
      backgroundColor: flipped ? palBg : monoBg,
      // mid-flip the tile is rotated, so its local-coords shadows invert
      // to keep the ledge reading at the BOTTOM on screen
      boxShadow: flipped
        ? `inset 0 5px 0 ${palEdge}, 0 -2px 3px rgba(0,0,0,0.3)`
        : `inset 0 -5px 0 ${monoEdge}, 0 2px 3px rgba(0,0,0,0.3)`,
    };
  });
  const inkPose = useAnimatedStyle(() => {
    // letters center on the FACE, not the box — the inset ledge eats the
    // bottom 5px, so true center is ~2.5px above box center (owner)
    if (p.value >= 1) return { opacity: 1, transform: [{ translateY: -2.5 }] };
    const flipped = p.value > 0.5;
    return {
      opacity: flipped ? 1 : 0,
      // mid-flip the face is mirrored — counter-rotate the letter upright;
      // +2.5 in flipped local coords = 2.5px UP on screen
      transform: [{ rotateX: flipped ? '180deg' : '0deg' }, { translateY: flipped ? 2.5 : -2.5 }],
    };
  });
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: r, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
        pose,
      ]}>
      <Animated.Text
        style={[
          { fontFamily: 'Fredoka_600SemiBold', color: INK, includeFontPadding: false, fontSize: Math.round(w * 0.57) },
          inkPose,
        ]}>
        {ch.toUpperCase()}
      </Animated.Text>
    </Animated.View>
  );
}

interface Props {
  theme: Theme;
  deal: { dayKey: string; sworb: string; archetype?: string | null } | null;
  played: boolean;
  solved: boolean;
  width: number;
  onGuess?: () => void; // THE HERO IS THE GUESS DOOR (owner): tap the word
}

export function HeroWord({ theme, deal, played, solved, width, onGuess }: Props) {
  const wordLen = deal?.sworb.length ?? 5;
  // 46 was the 300px design-mock cap — real phones earn bigger blocks; the
  // word of the day is the hero and must dominate everything under it
  const tileW = Math.min(56, Math.floor((Math.min(width, 480) - 36 - (wordLen - 1) * 8) / wordLen));
  const tileH = Math.round(tileW * (50 / 46));
  const tileR = Math.round(tileW * (13 / 46));

  return (
    <>
      {/* word of the day: candy bloom when the day is done, dashed
          blanks before (the answer is hidden — no spoilers). The ROW is
          the guess door when a guess is live (owner). */}
      <Pressable
        onPress={onGuess}
        disabled={!onGuess}
        style={styles.heroRow}>
        {played && deal
          ? [...deal.sworb].map((ch, i) => {
              const pal = PALETTE[tileColorFor(ch, i)];
              return (
                <FlipTile
                  key={`${deal.dayKey}-${i}`}
                  ch={ch}
                  i={i}
                  w={tileW}
                  h={tileH}
                  r={tileR}
                  palBg={pal.bg}
                  palEdge={pal.edge}
                  monoBg={gameSurface(theme.mode).mono.bg}
                  monoEdge={gameSurface(theme.mode).mono.edge}
                />
              );
            })
          : Array.from({ length: wordLen }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.heroBlock,
                  {
                    width: tileW, height: tileH, borderRadius: tileR, borderCurve: 'continuous',
                    borderWidth: 2, borderStyle: 'dashed', borderColor: theme.dashed,
                  },
                ]}
              />
            ))}
      </Pressable>
      {played && !solved && (
        <Text style={[styles.missLine, { color: theme.sub }]}>
          not cracked — tomorrow's another sworbl
        </Text>
      )}
      {/* pre-play: six BLANK hint slots (no letter counts, no spoilers).
          post-play the clue intel lives inside the superlatives pager. */}
      {!played && (
        <View style={styles.hintRow}>
          {HINT_SLOT_W.map((w, i) => (
            <View key={i} style={[styles.hintSlot, { width: w, borderColor: theme.dashed }]} />
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  heroBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  missLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    marginTop: -6,
  },
  twistPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(137,113,255,0.14)',
    marginTop: -4,
  },
  twistText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#8971FF',
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12, // air between the word blocks and the hint slots (owner)
  },
  // BOARD PARITY (owner): the same dashed ghost pills as the in-game clue
  // fan — blank slot, presence only, never shape
  hintSlot: {
    height: 26,
    borderRadius: 9, borderCurve: 'continuous',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});
