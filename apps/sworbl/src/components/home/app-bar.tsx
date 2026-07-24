// HOME APP BAR (handoff 20a/6b): person · wordmark · settings, 56px row.
// Brand sits at the same offset as the sheet's — the "uniting logos" dock
// animation is positional, keep them aligned when touching either.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/icon';
import { Brand } from '@/components/brand';
import { type Theme } from '@/game/theme';

interface Props {
  theme: Theme;
  onPerson?: () => void;
  onSettings?: () => void;
  points?: number | null; // the wallet chip (owner: expose the points)
}

export function AppBar({ theme, onPerson, onSettings, points }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onPerson} hitSlop={8} style={styles.side}>
        <Icon name="person" size={23} color={theme.icon} />
      </Pressable>
      <Brand ink={theme.ink} />
      {points != null && (
        <View pointerEvents="box-none" style={styles.pointsSlot}>
          <Pressable onPress={onPerson} hitSlop={8} style={[styles.pointsChip, { backgroundColor: theme.pill }]}>
            <Text style={[styles.pointsText, { color: theme.ink }]}>✦ {points.toLocaleString()}</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={onSettings} hitSlop={8} style={[styles.side, styles.right]}>
        <Icon name="settings" size={23} color={theme.icon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12, // sheet parity — logos unite at dock
    paddingBottom: 10, // iOS bars breathe below their icons (owner)
  },
  side: {
    width: 44,
  },
  pointsSlot: {
    position: 'absolute',
    right: 52,
    top: 0,
    bottom: 0,
    justifyContent: 'center', // vertically centered in the bar (owner)
  },
  pointsChip: {
    borderRadius: 10, borderCurve: 'continuous',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pointsText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  right: {
    alignItems: 'flex-end',
  },
});
