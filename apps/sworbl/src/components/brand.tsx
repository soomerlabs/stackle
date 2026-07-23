// The sworbl wordmark (web header parity): the violet chip block with the
// white 's' + "sworbl" in WHITE Fredoka (the violet-text version was wrong).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function Brand({ size = 24 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <View style={[styles.chip, { width: size, height: size, borderRadius: size * 0.32 }]}>
        <Text style={[styles.chipS, { fontSize: size * 0.62 }]}>s</Text>
      </View>
      <Text style={[styles.word, { fontSize: size * 0.92 }]}>sworbl</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  chip: {
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 0 #7C5CE0',
  },
  chipS: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  word: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#EDEFF7',
  },
});
