// OPEN DUELS RAIL (owner: "current h2h that people wanna have but no one
// has filled them in yet") — posted runs waiting for a taker. Cache-first
// like every remote surface: last-known rail renders instantly, the fresh
// list swaps in silently. Renders NOTHING until a duel exists (no empty
// scaffolding on home).
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { PALETTE, tileColorFor } from '@/game/palette';
import { ACCENT, type Theme } from '@/game/theme';
import { fetchOpenDuels, readCachedDuels, type OpenDuel } from '@/net/duels';

export function DuelsRail({ theme, refreshNonce }: { theme: Theme; refreshNonce?: number }) {
  const [duels, setDuels] = useState<OpenDuel[]>(() => readCachedDuels());
  useEffect(() => {
    let live = true;
    fetchOpenDuels().then((d) => live && d && setDuels(d));
    return () => {
      live = false;
    };
  }, [refreshNonce]);

  // EMPTY ≠ INVISIBLE (owner: "im not seeing duels anywhere") — an empty
  // rail is an invitation: run a board, post it, be the first card.
  return (
    <View style={styles.wrap}>
      <Text style={[styles.eyebrow, { color: theme.faint }]}>OPEN DUELS</Text>
      {!duels.length && (
        <Pressable
          onPress={() => router.push('/storm?seed=first-storm&clock=120')}
          style={[styles.row, { backgroundColor: theme.card }]}>
          <View style={styles.mid}>
            <Text style={[styles.name, { color: theme.ink }]}>no open duels yet</Text>
            <Text style={[styles.meta, { color: theme.faint }]}>
              run a 2:00 blitz board, post your score, wait for a taker
            </Text>
          </View>
          <Text style={[styles.take, { color: ACCENT }]}>start one ›</Text>
        </Pressable>
      )}
      {duels.map((d) => {
        const pal = PALETTE[tileColorFor(d.name[0]?.toLowerCase() ?? 'a', 0)];
        return (
          <Pressable
            key={d.id}
            disabled={d.mine}
            onPress={() =>
              router.push(
                `/storm?seed=${d.seed}&vs=${encodeURIComponent(d.name)}&target=${d.score}&did=${d.id}${d.format === 'blitz' ? '&clock=120' : ''}`
              )
            }
            style={[styles.row, { backgroundColor: theme.card }]}>
            <View style={[styles.block, { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }]}>
              <Text style={styles.blockLetter}>{d.name[0]}</Text>
            </View>
            <View style={styles.mid}>
              <Text style={[styles.name, { color: theme.ink }]} numberOfLines={1}>
                {d.name.toLowerCase()} · {d.score.toLocaleString()}
              </Text>
              <Text style={[styles.meta, { color: theme.faint }]}>
                {d.format === 'blitz' ? '2:00 blitz · pure points' : 'themed board'} · {d.seed}
              </Text>
            </View>
            <Text style={[styles.take, { color: d.mine ? theme.faint : ACCENT }]}>
              {d.mine ? 'yours' : 'take it ›'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 18 },
  eyebrow: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
    letterSpacing: 2.5,
    marginLeft: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  block: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#1F1442',
  },
  mid: { flex: 1, gap: 1 },
  name: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14.5 },
  meta: { fontFamily: 'Fredoka_600SemiBold', fontSize: 11 },
  take: { fontFamily: 'Fredoka_600SemiBold', fontSize: 13, letterSpacing: 0.4 },
});
