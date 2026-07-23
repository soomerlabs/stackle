// The 6 clue pills under the board. States (hint ladder, owner 2026-07-23):
//   found → candy pill (PALETTE hue by slot)
//   nudged → dashed pill, FIRST LETTER + a dot per remaining letter (EARNED)
//   ghost → BLANK dashed slot, fixed stagger width — a dot-per-letter ghost
//           leaked every clue's length for free (owner catch); blank slots
//           match the home skeletons exactly.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PALETTE, INK } from '@/game/palette';

// fixed stagger (same rhythm as home's pre-play skeletons) — width must
// never derive from the hidden word
const GHOST_W = [52, 48, 56, 50, 48, 54];

interface Props {
  clues: string[];
  found: string[];
  // HINT LADDER (owner 2026-07-23): pills are BLANK by default — a first
  // letter shows only on the clue the starter nudge revealed (earned intel,
  // so it persists into the finale too)
  nudged?: string | null;
}

export function ClueFan({ clues, found, nudged }: Props) {
  return (
    <View style={styles.fan}>
      {clues.map((clue, i) => {
        const isFound = found.includes(clue);
        const isNudged = !isFound && nudged === clue;
        const pal = PALETTE[i % PALETTE.length];
        if (!isFound && !isNudged) {
          // blank slot: presence only, never shape
          return (
            <View
              key={clue}
              style={[styles.pill, styles.pillGhost, styles.pillBlank, { width: GHOST_W[i % GHOST_W.length] }]}
            />
          );
        }
        return (
          <View
            key={clue}
            style={[
              styles.pill,
              isFound
                ? { backgroundColor: pal.bg, boxShadow: `0 2px 0 ${pal.edge}` }
                : styles.pillGhost,
            ]}>
            <Text style={[styles.pillText, isFound ? { color: INK } : styles.ghostText]}>
              {isFound
                ? clue.toUpperCase()
                : clue[0] + ' ' + '· '.repeat(clue.length - 1).trim()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fan: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    marginTop: 14,
    maxWidth: 420,
  },
  pill: {
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  pillGhost: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#3A3A44',
  },
  pillBlank: {
    height: 26,
  },
  pillText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  ghostText: {
    color: '#9DA2B3',
  },
});
