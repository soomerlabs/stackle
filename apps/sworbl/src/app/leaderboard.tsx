// LEADERBOARD (handoff 5a): back · wordmark · share app bar, big daily /
// all-time title, a crossfade pager (swipe or dots) over the floating
// stepped podium, the ranked list with the player's row pinned INLINE
// (indigo), and the NEXT SWORBL IN countdown. Stub fields until Supabase.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import engine from '@sworbl/engine';

import { ScreenBar } from '@/components/screen-bar';
import { FloatingPodium } from '@/components/home/floating-podium';
import { CountdownDock } from '@/components/home/countdown-dock';
import { useTheme, ACCENT, ACCENT_EDGE } from '@/game/theme';
import { PALETTE, tileColorFor } from '@/game/palette';
import { standingsStub, standingsAllTime, rankFor, type LbEntry } from '@/game/standings';
import { loadDay } from '@/game/persist';
import { loadStats } from '@/game/stats';
import { getPlayerName } from '@/game/player';

const LIST_CAP = 12;

function Row({
  rank, entry, isYou, ink, sub, card,
}: {
  rank: number;
  entry: { name: string; score: number };
  isYou: boolean;
  ink: string;
  sub: string;
  card: string;
}) {
  const pal = PALETTE[tileColorFor(entry.name[0]?.toLowerCase() ?? 'a', 0)];
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: isYou ? ACCENT : card },
        isYou && { boxShadow: `0 3px 0 ${ACCENT_EDGE}, inset 0 1.5px 0 rgba(255,255,255,0.4)` },
      ]}>
      <Text style={[styles.rank, { color: isYou ? '#1F1442' : sub }]}>{rank}</Text>
      <View
        style={[
          styles.rowBlock,
          isYou
            ? { backgroundColor: '#F3EFFF', boxShadow: '0 3px 0 #CFC2F2' }
            : { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` },
        ]}>
        <Text style={styles.rowBlockLetter}>{entry.name[0]}</Text>
      </View>
      <Text style={[styles.rowName, { color: isYou ? '#1F1442' : ink }]}>
        {entry.name.toLowerCase()}
      </Text>
      <Text style={[styles.rowScore, { color: isYou ? '#1F1442' : ink }]}>
        {entry.score.toLocaleString()}
      </Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const theme = useTheme();
  const [page, setPage] = useState(0); // 0 daily · 1 all-time
  const dayKey = engine.core.dayKey(new Date());
  const name = getPlayerName();

  const daily = useMemo(() => standingsStub(dayKey), [dayKey]);
  const allTime = useMemo(() => standingsAllTime(), []);
  const myDaily = useMemo(() => loadDay(dayKey).score, [dayKey]);
  const myTotal = useMemo(() => loadStats().total, []);

  const entries = page === 0 ? daily : allTime;
  const myScore = page === 0 ? myDaily : myTotal;
  const played = myScore > 0;
  const myRank = played ? rankFor(entries, myScore) : null;

  // pin YOU inline at rank position (handoff: the list keeps you as a row)
  const listed: { rank: number; entry: LbEntry | { name: string; score: number }; you: boolean }[] =
    useMemo(() => {
      const rows = entries.map((e, i) => ({ rank: i + 1, entry: e as LbEntry | { name: string; score: number }, you: false }));
      if (played && myRank !== null) {
        rows.splice(myRank - 1, 0, { rank: myRank, entry: { name, score: myScore }, you: true });
        rows.forEach((r, i) => (r.rank = i + 1));
      }
      // keep the window around YOU when they'd fall off the cap
      const youIdx = rows.findIndex((r) => r.you);
      if (youIdx >= LIST_CAP) {
        const head = rows.slice(3, LIST_CAP - 3); // podium already shows 1-3
        return [...head, ...rows.slice(youIdx - 1, youIdx + 2)];
      }
      return rows.slice(3, Math.max(LIST_CAP, youIdx + 2));
    }, [entries, played, myRank, name, myScore]);

  const flip = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .runOnJS(true)
    .onEnd((e) => {
      if (Math.abs(e.translationX) >= 30) setPage(e.translationX < 0 ? 1 : 0);
    });

  const share = () => {
    const line =
      played && myRank
        ? `sworbl — #${myRank} ${page === 0 ? 'today' : 'all-time'} with ${myScore.toLocaleString()} ✦`
        : 'sworbl — the daily word storm ✦';
    Share.share({ message: line }).catch(() => {});
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe}>
        <ScreenBar theme={theme} action={{ symbol: 'square.and.arrow.up', fallback: '↗', onPress: share }} />
        <GestureDetector gesture={flip}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: theme.ink }]}>
              {page === 0 ? 'daily' : 'all-time'}
            </Text>
            <Animated.View
              key={page}
              entering={FadeIn.duration(240)}
              exiting={FadeOut.duration(150)}
              style={styles.pageWrap}>
              <FloatingPodium
                theme={theme}
                entries={entries}
                you={null}
                showTitle={false}
                showFoot={false}
              />
              <View style={styles.list}>
                {listed.map((r) => (
                  <Row
                    key={`${r.rank}-${r.entry.name}`}
                    rank={r.rank}
                    entry={r.entry}
                    isYou={r.you}
                    ink={theme.ink}
                    sub={theme.faint}
                    card={theme.card}
                  />
                ))}
                {!played && (
                  <Text style={[styles.joinLine, { color: theme.faint }]}>
                    play today to land on the board
                  </Text>
                )}
              </View>
            </Animated.View>
            <View style={styles.dots}>
              {[0, 1].map((i) => (
                <Pressable key={i} onPress={() => setPage(i)} hitSlop={8}>
                  <View style={[styles.dot, { backgroundColor: i === page ? ACCENT : theme.dashed }]} />
                </Pressable>
              ))}
            </View>
            <View style={styles.foot}>
              <CountdownDock played />
            </View>
          </ScrollView>
        </GestureDetector>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 16,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    marginBottom: 2,
  },
  pageWrap: {
    // the podium row now carries its own crown headroom (26px) — this is
    // just section rhythm on top of it
    paddingTop: 8,
    gap: 22,
  },
  list: {
    gap: 7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
  },
  rank: {
    width: 18,
    textAlign: 'center',
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
  },
  rowBlock: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBlockLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#1F1442',
    includeFontPadding: false,
  },
  rowName: {
    flex: 1,
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  rowScore: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  joinLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    textAlign: 'center',
    paddingTop: 6,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  foot: {
    paddingTop: 2,
  },
});
