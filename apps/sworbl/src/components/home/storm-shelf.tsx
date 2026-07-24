// THE STORMS CARD (owner: "A and B compose" home) — one card, one
// grammar: the four tiers as candy chips inside it (hurricane still
// flies the warning flag), the private-rooms door as the card's last
// row. No horizontal scrolling anywhere.
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';

import { dailyStormBoards } from '@/game/storm-seeds';
import { listPausedRuns, type PausedRun } from '@/game/storm-runs';
import { ACCENT, type Theme } from '@/game/theme';
import { fetchStormCrowns } from '@/net/duels';

export function StormShelf({ theme, refreshNonce }: { theme: Theme; refreshNonce?: number }) {
  const boards = dailyStormBoards();
  const [crowns, setCrowns] = useState<Awaited<ReturnType<typeof fetchStormCrowns>>>(null);
  // boards left mid-run (owner: "no way for me to get back into it") —
  // non-showdown pauses live HERE; showdown pauses ride their own card
  const [paused, setPaused] = useState<PausedRun[]>([]);
  useEffect(() => {
    let live = true;
    setPaused(listPausedRuns().filter((c) => !c.post));
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

      {/* strongest first (owner) — hurricane leads the walk down. A
          SCROLLER now (owner: "storms will be created — we'll need to
          scroll"): fixed square tiles, never squashed */}
      <View style={styles.scrollerWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tierRow}>
        {[...boards].reverse().map((b) => {
          const c = crowns?.[b.seed];
          const run = paused.find((p) => p.seed === b.seed);
          const words = b.name.split(' ');
          const tierWord = words.length > 1 ? words.slice(1).join(' ') : b.name;
          return (
            <Pressable
              key={b.seed}
              // a PAUSED board goes STRAIGHT back in (never the lobby —
              // the door already charged); the cover lands on RESUME
              onPress={() =>
                run
                  ? router.push(`/storm?seed=${b.seed}`)
                  : router.push(`/lobby?seed=${b.seed}`)
              }
              // paused = the BADGE + amber meta, never a hue flood
              // (owner: "all red omg hurricane looks awful")
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
              <Text
                style={[styles.tierMeta, { color: run ? ACCENT : theme.faint }]}
                numberOfLines={1}>
                {run
                  ? run.score > 0
                    ? `${run.score.toLocaleString()} pts`
                    : 'paused'
                  : c?.top
                    ? c.top.score.toLocaleString()
                    : b.intensity.entry === 0
                      ? 'free'
                      : `${b.intensity.entry} ✦`}
              </Text>
            </Pressable>
          );
        })}
        {/* + — make your own board (owner: just the plus, full size);
            the rooms sheet asks public or private */}
        <Pressable
          onPress={() => router.push('/rooms?make=1')}
          style={[styles.tier, styles.plusTier, { borderColor: theme.dashed }]}>
          <Text style={[styles.plusMark, { color: theme.faint }]}>+</Text>
        </Pressable>
      </ScrollView>
      {/* the right-edge fade (owner: "blend in nice… no hard line") —
          tiles dissolve into the card at its true edge */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${theme.card}00`, theme.card]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.edgeFade}
      />
      </View>

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
  // bleeds to the card's true edges so tiles dissolve, never clip
  scrollerWrap: {
    marginHorizontal: -16,
  },
  tierRow: {
    gap: 9,
    paddingVertical: 2,
    paddingLeft: 16,
    paddingRight: 44, // the last tile clears the fade fully when scrolled
  },
  edgeFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 34,
  },
  // NICE-SIZED SQUARES (owner) — fixed, readable, never squashed
  tier: {
    width: 92,
    height: 92,
    borderRadius: 16, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tierEmoji: {
    fontSize: 26,
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
  plusTier: {
    borderWidth: 2,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  plusMark: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 28,
    includeFontPadding: false,
  },
  tierMeta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
