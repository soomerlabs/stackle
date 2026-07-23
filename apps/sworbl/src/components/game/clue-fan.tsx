// The 6 clue pills under the board. States (web idiom, clueToken):
//   found → candy pill (PALETTE hue by slot)
//   ghost → dashed pill, FIRST LETTER + a dot per remaining letter — hint aid #1,
//           always-on ("r · · ·"), a free nudge that never gives the word away.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PALETTE, INK } from '@/game/palette';

interface Props {
  clues: string[];
  found: string[];
}

export function ClueFan({ clues, found }: Props) {
  return (
    <View style={styles.fan}>
      {clues.map((clue, i) => {
        const isFound = found.includes(clue);
        const pal = PALETTE[i % PALETTE.length];
        return (
          <View
            key={clue}
            style={[
              styles.pill,
              isFound
                ? { backgroundColor: pal.bg, shadowColor: pal.edge, ...styles.pillFound }
                : styles.pillGhost,
            ]}>
            <Text style={[styles.pillText, isFound ? { color: INK } : styles.ghostText]}>
              {isFound ? clue.toUpperCase() : clue[0] + ' ' + '· '.repeat(clue.length - 1).trim()}
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
  pillFound: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
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
