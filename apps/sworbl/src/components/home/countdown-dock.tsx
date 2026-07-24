// The bottom dock — the COUNTDOWN's home, and nothing else now (owner:
// the PLAY mechanic retired; the hero card is the only door). A played
// day shows the next-puzzle clock; an open day shows nothing.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import engine from '@sworbl/engine';
import { useTheme } from '@/game/theme';

function nextIn(): string {
  const ms = engine.core.msToNextDay(new Date());
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function CountdownDock({ played }: { played: boolean }) {
  const theme = useTheme();
  const [clock, setClock] = useState(nextIn);
  useEffect(() => {
    if (!played) return;
    const h = setInterval(() => setClock(nextIn()), 1000);
    return () => clearInterval(h);
  }, [played]);

  if (!played) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Text style={[styles.label, { color: theme.faint }]}>next sworb in</Text>
      <Text style={[styles.clock, { color: theme.ink }]}>{clock}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  clock: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});
