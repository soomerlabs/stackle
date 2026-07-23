// The 6 clue pills under the board. States (web idiom, clueToken):
//   found → candy pill (PALETTE hue by slot)
//   ghost → dashed pill, FIRST LETTER + a dot per remaining letter — hint aid #1,
//           always-on ("r · · ·"), a free nudge that never gives the word away.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { PALETTE, INK } from '@/game/palette';

interface Props {
  clues: string[];
  found: string[];
  tokenReady?: boolean; // a hint token is spendable: ghost pills glow + tap pings
  onGhostTap?: (clue: string, slot: number) => void;
  // FINALE mode: unfound clues show as letterless ghosts — the first-letter
  // nudge is a HUNT aid; unearned intel must not leak into the guess phase
  conceal?: boolean;
}

export function ClueFan({ clues, found, tokenReady, onGhostTap, conceal }: Props) {
  return (
    <View style={styles.fan}>
      {clues.map((clue, i) => {
        const isFound = found.includes(clue);
        const pal = PALETTE[i % PALETTE.length];
        return (
          <Pressable
            key={clue}
            disabled={isFound || !tokenReady}
            onPress={() => onGhostTap && onGhostTap(clue, i)}
            style={[
              styles.pill,
              isFound
                ? { backgroundColor: pal.bg, boxShadow: `0 2px 0 ${pal.edge}` }
                : styles.pillGhost,
              !isFound && tokenReady && { borderColor: pal.bg, borderStyle: 'solid' },
            ]}>
            <Text style={[styles.pillText, isFound ? { color: INK } : styles.ghostText]}>
              {isFound
                ? clue.toUpperCase()
                : conceal
                  ? '· '.repeat(clue.length).trim()
                  : clue[0] + ' ' + '· '.repeat(clue.length - 1).trim()}
            </Text>
          </Pressable>
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
  pillText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  ghostText: {
    color: '#9DA2B3',
  },
});
