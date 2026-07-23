// LEADERBOARD (handoff 5a): back · wordmark · share app bar, big daily /
// all-time title, a crossfade pager (swipe or dots) over the floating
// stepped podium, the ranked list with the player's row pinned INLINE
// (indigo), and the NEXT SWORBL IN countdown. Stub fields until Supabase.
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import engine from '@sworbl/engine';

import { ScreenBar } from '@/components/screen-bar';
import { ScreenHeader } from '@/components/screen-header';
import { FloatingPodium } from '@/components/home/floating-podium';
import { CountdownDock } from '@/components/home/countdown-dock';
import { useTheme, ACCENT, ACCENT_EDGE } from '@/game/theme';
import { PALETTE, tileColorFor } from '@/game/palette';
import { standingsStub, standingsAllTime, rankFor, type LbEntry } from '@/game/standings';
import { fetchDaily, fetchAllTime, type RemoteField } from '@/net/standings-remote';
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

  const [remoteDaily, setRemoteDaily] = useState<RemoteField | null>(null);
  const [remoteAll, setRemoteAll] = useState<RemoteField | null>(null);
  useEffect(() => {
    let live = true;
    fetchDaily(dayKey).then((r) => live && r?.entries.length && setRemoteDaily(r));
    fetchAllTime().then((r) => live && r?.entries.length && setRemoteAll(r));
    return () => {
      live = false;
    };
  }, [dayKey]);
  const daily = useMemo(
    () => remoteDaily?.entries ?? standingsStub(dayKey),
    [remoteDaily, dayKey]
  );
  const allTime = useMemo(() => remoteAll?.entries ?? standingsAllTime(), [remoteAll]);
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ScreenHeader
              theme={theme}
              eyebrow="STANDINGS"
              title={page === 0 ? 'daily' : 'all-time'}
            />
            {/* PILL FILTER (owner: the swipe pager fought iOS back-swipe) */}
            <View style={styles.pills}>
              {(['daily', 'all-time'] as const).map((label, i) => (
                <Pressable
                  key={label}
                  onPress={() => setPage(i)}
                  style={[
                    styles.pill,
                    page === i
                      ? { backgroundColor: ACCENT, boxShadow: `0 3px 0 ${ACCENT_EDGE}` }
                      : { backgroundColor: theme.card },
                  ]}>
                  <Text style={[styles.pillText, { color: page === i ? '#fff' : theme.sub }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View key={page} style={styles.pageWrap}>
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
            </View>
            <View style={styles.foot}>
              <CountdownDock played />
            </View>
          </ScrollView>
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
  pills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  pillText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
    letterSpacing: 0.3,
  },
  foot: {
    paddingTop: 2,
  },
});
