// THE STORMS CARD (owner: "A and B compose" home) — one card, one
// grammar: the four tiers as candy chips inside it (hurricane still
// flies the warning flag), the private-rooms door as the card's last
// row. No horizontal scrolling anywhere.
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { dailyStormBoards } from '@/game/storm-seeds';
import { ACCENT, type Theme } from '@/game/theme';
import { fetchStormCrowns } from '@/net/duels';

export function StormShelf({ theme, refreshNonce }: { theme: Theme; refreshNonce?: number }) {
  const boards = dailyStormBoards();
  const [crowns, setCrowns] = useState<Awaited<ReturnType<typeof fetchStormCrowns>>>(null);
  useEffect(() => {
    let live = true;
    void fetchStormCrowns(boards.map((b) => b.seed)).then((c) => live && c && setCrowns(c));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.ink }]}>storms</Text>
        <Pressable
          onPress={() => router.push('/about-mode?mode=storms')}
          hitSlop={10}
          style={[styles.infoDot, { backgroundColor: theme.pill }]}>
          <Text style={[styles.infoDotText, { color: theme.sub }]}>i</Text>
        </Pressable>
        <View style={styles.spring} />
        <Text style={[styles.subtitle, { color: theme.faint }]}>pick your weather</Text>
      </View>

      {/* strongest first (owner) — hurricane leads the walk down */}
      <View style={styles.tierRow}>
        {[...boards].reverse().map((b) => {
          const c = crowns?.[b.seed];
          const words = b.name.split(' ');
          const tierWord = words.length > 1 ? words.slice(1).join(' ') : b.name;
          return (
            <Pressable
              key={b.seed}
              onPress={() => router.push(`/lobby?seed=${b.seed}`)}
              style={[styles.tier, { backgroundColor: theme.pill }]}>
              {b.intensity.key === 'hurricane' ? (
                <View style={styles.flag}>
                  <View style={styles.flagCenter} />
                </View>
              ) : (
                <Text style={styles.tierEmoji}>{b.intensity.emoji}</Text>
              )}
              <Text style={[styles.tierWord, { color: theme.ink }]} numberOfLines={1}>
                {tierWord}
              </Text>
              <Text style={[styles.tierMeta, { color: theme.faint }]} numberOfLines={1}>
                {c?.top
                  ? c.top.score.toLocaleString()
                  : b.intensity.entry === 0
                    ? 'free'
                    : `${b.intensity.entry} ✦`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* PRIVATE ROOMS — the card's last door */}
      <Pressable onPress={() => router.push('/rooms')} style={styles.privateRow} hitSlop={4}>
        <Text style={styles.privateLock}>🔒</Text>
        <Text style={[styles.privateText, { color: theme.ink }]}>private rooms</Text>
        <View style={styles.spring} />
        <Text style={[styles.privateGo, { color: ACCENT }]}>you set the pot ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: 22, borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  spring: { flex: 1 },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
    fontStyle: 'italic',
  },
  infoDot: {
    width: 16,
    height: 16,
    borderRadius: 6, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoDotText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
  },
  tierRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tier: {
    flex: 1,
    borderRadius: 14, borderCurve: 'continuous',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  tierEmoji: {
    fontSize: 24,
    includeFontPadding: false,
  },
  // the maritime warning AS the icon (owner): red square, black center
  flag: {
    width: 26,
    height: 26,
    marginVertical: 2.5,
    borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: '#E5484D',
    boxShadow: 'inset 0 -3px 0 #8C2328',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagCenter: {
    width: 10,
    height: 10,
    borderRadius: 3, borderCurve: 'continuous',
    backgroundColor: '#17171C',
  },
  tierWord: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
  },
  tierMeta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  privateLock: {
    fontSize: 14,
  },
  privateText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
  },
  privateGo: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
  },
});
