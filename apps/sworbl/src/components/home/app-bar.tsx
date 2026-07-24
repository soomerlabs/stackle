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
  onPoints?: () => void; // the chip opens the WALLET (mock packs + ledger)
}

export function AppBar({ theme, onPerson, onSettings, points, onPoints }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={onPerson} hitSlop={8} style={styles.side} accessibilityRole="button" accessibilityLabel="profile">
        <Icon name="person" size={23} color={theme.icon} />
      </Pressable>
      <Brand ink={theme.ink} />
      {points != null && (
        <View pointerEvents="box-none" style={styles.pointsSlot}>
          <Pressable onPress={onPoints ?? onPerson} hitSlop={8} style={[styles.pointsChip, { backgroundColor: theme.pill }]} accessibilityRole="button" accessibilityLabel={`points balance ${points ?? 0}, open wallet`}>
            <Text style={[styles.pointsText, { color: theme.ink }]}>✦ {points.toLocaleString()}</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={onSettings} hitSlop={8} style={[styles.side, styles.right]} accessibilityRole="button" accessibilityLabel="settings">
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
    // center on the CONTENT box, not the bar box — the bar's asymmetric
    // padding (12 top / 10 bottom) floated the chip 1px high (owner eye)
    top: 12,
    bottom: 10,
    justifyContent: 'center',
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
