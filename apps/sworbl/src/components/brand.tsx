// The sworbl wordmark — EXACT web header port: the 32px three-block stack
// (mint −14°, cyan +10°, violet on top wearing the white 's') + "sworbl" in
// 22px Fredoka, near-white, centered in the header.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function Brand({ scale = 1 }: { scale?: number }) {
  const s = 32 * scale;
  const inset = 4 * scale;
  const block = {
    position: 'absolute' as const,
    left: inset,
    top: inset,
    right: inset,
    bottom: inset,
    borderRadius: 8 * scale,
  };
  return (
    <View style={styles.row}>
      <View style={{ width: s, height: s }}>
        <View
          style={[
            block,
            {
              backgroundColor: '#5FD6A8',
              boxShadow: `0 ${2 * scale}px 0 #38AD7F`,
              transform: [{ rotate: '-14deg' }, { translateX: -4 * scale }, { translateY: 2 * scale }],
            },
          ]}
        />
        <View
          style={[
            block,
            {
              backgroundColor: '#5BC8F5',
              boxShadow: `0 ${2 * scale}px 0 #2E9FD0`,
              transform: [{ rotate: '10deg' }, { translateX: 4 * scale }, { translateY: 2 * scale }],
            },
          ]}
        />
        <View
          style={[
            styles.topBlock,
            {
              left: 1.5 * scale,
              top: 1.5 * scale,
              right: 1.5 * scale,
              bottom: 1.5 * scale,
              borderRadius: 9 * scale,
              boxShadow: `0 ${2 * scale}px 0 #7C5CE0`,
              paddingBottom: 2 * scale,
            },
          ]}>
          <Text style={[styles.chipS, { fontSize: 18 * scale }]}>s</Text>
        </View>
      </View>
      <Text style={[styles.word, { fontSize: 22 * scale }]}>sworbl</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  topBlock: {
    position: 'absolute',
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.35)',
  },
  chipS: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  word: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#EDEFF7',
    letterSpacing: 0.3,
  },
});
