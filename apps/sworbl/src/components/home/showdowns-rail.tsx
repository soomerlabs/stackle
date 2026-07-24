// SHOWDOWNS (owner mock 2026-07-24): "you vs an open challenger slot" —
// the start card shows YOUR block against a dashed ? seat with the
// play › post › wait flow spelled out; open posts read as "beat their
// score" cards; your own post is a dashed live WAITING state. Taking a
// card claims the 1v1 (server-atomic); decided ones never appear (the
// view filters to open).
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';

import { PALETTE, tileColorFor } from '@/game/palette';
import { getPlayerName } from '@/game/player';
import { dailyStormBoards } from '@/game/storm-seeds';
import { ACCENT, type Theme } from '@/game/theme';
import { fetchOpenDuels, readCachedDuels, type OpenDuel } from '@/net/duels';

export function ShowdownsRail({ theme, refreshNonce }: { theme: Theme; refreshNonce?: number }) {
  const [duels, setDuels] = useState<OpenDuel[]>(() => readCachedDuels());
  // showdowns default to the SQUALL (the 2:00 standard contract)
  const squall = useMemo(() => dailyStormBoards()[1], []);
  const myName = getPlayerName();
  const myPal = PALETTE[tileColorFor(myName[0]?.toLowerCase() ?? 'p', 0)];
  useEffect(() => {
    let live = true;
    fetchOpenDuels().then((d) => live && d && setDuels(d));
    return () => {
      live = false;
    };
  }, [refreshNonce]);

  const mine = duels.filter((d) => d.mine);
  const open = duels.filter((d) => !d.mine);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.ink }]}>showdowns</Text>
        <Pressable
          onPress={() => router.push('/about-mode?mode=showdowns')}
          hitSlop={10}
          style={[styles.infoDot, { backgroundColor: theme.pill }]}>
          <Text style={[styles.infoDotText, { color: theme.sub }]}>i</Text>
        </Pressable>
      </View>
      <Text style={[styles.subtitle, { color: theme.faint }]}>
        mano a mano
      </Text>
      <View style={styles.scrollerWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}>
        {/* START A SHOWDOWN: you vs the open seat */}
        <Pressable
          onPress={() => router.push(`/lobby?seed=${squall.seed}&create=1`)}
          style={[styles.block, { backgroundColor: theme.card }]}>
          <View style={styles.vsRow}>
            <View style={[styles.avatar, { backgroundColor: myPal.bg, boxShadow: `inset 0 -3px 0 ${myPal.edge}` }]}>
              <Text style={styles.avatarLetter}>{myName[0]?.toLowerCase()}</Text>
            </View>
            <Text style={[styles.vs, { color: theme.faint }]}>vs</Text>
            <View style={[styles.avatar, styles.openSeat, { borderColor: theme.dashed }]}>
              <Text style={[styles.openSeatMark, { color: theme.faint }]}>?</Text>
            </View>
          </View>
          <Text style={[styles.name, { color: theme.ink }]}>start a{'\n'}showdown</Text>
          <Text style={[styles.meta, { color: theme.faint }]}>play › post › wait</Text>
        </Pressable>

        {/* open challengers: beat their score */}
        {open.map((d) => {
          const pal = PALETTE[tileColorFor(d.name[0]?.toLowerCase() ?? 'a', 0)];
          return (
            <Pressable
              key={d.id}
              onPress={() =>
                router.push(
                  `/lobby?seed=${d.seed}&vs=${encodeURIComponent(d.name)}&target=${d.score}&did=${d.id}`
                )
              }
              style={[styles.block, { backgroundColor: theme.card }]}>
              <View style={[styles.avatar, { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }]}>
                <Text style={styles.avatarLetter}>{d.name[0]?.toLowerCase()}</Text>
              </View>
              <Text style={[styles.name, { color: theme.ink }]} numberOfLines={1}>
                {d.name.toLowerCase()}
              </Text>
              <Text style={[styles.stat, { color: theme.sub }]}>
                ⚑ beat {d.score.toLocaleString()}
              </Text>
              <Text style={[styles.meta, { color: ACCENT }]}>take it ›</Text>
            </Pressable>
          );
        })}

        {/* your own post: the live waiting state */}
        {mine.map((d) => (
          <View
            key={`mine-${d.id}`}
            style={[styles.block, styles.waitingBlock, { borderColor: theme.dashed }]}>
            <View style={[styles.avatar, { backgroundColor: myPal.bg, boxShadow: `inset 0 -3px 0 ${myPal.edge}` }]}>
              <Text style={styles.avatarLetter}>{myName[0]?.toLowerCase()}</Text>
            </View>
            <Text style={[styles.name, { color: theme.ink }]}>your post</Text>
            <Text style={[styles.stat, { color: theme.sub }]}>{d.score.toLocaleString()} pts</Text>
            <View style={styles.waitRow}>
              <View style={[styles.waitDot, { backgroundColor: ACCENT }]} />
              <Text style={[styles.meta, { color: theme.faint }]}>waiting…</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      {/* the PEEK fade (owner: "hurricane is totally hidden") — cards
          scroll under a bg-colored gradient at the true screen edge */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${theme.bg}00`, theme.bg]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.edgeFade}
      />
      {/* the LEFT fade (owner: "i hate hard lines") — scrolled-past cards
          dissolve at the leading edge too */}
      <LinearGradient
        pointerEvents="none"
        colors={[theme.bg, `${theme.bg}00`]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.edgeFadeLeft}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.3,
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
  subtitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  // bleeds to the TRUE screen edge (home pads 18) so hidden cards peek
  scrollerWrap: {
    marginRight: -18,
    marginLeft: -18, // both edges bleed — scrolled cards dissolve, never clip
  },
  rowContent: {
    gap: 10,
    paddingLeft: 18,
    paddingRight: 44, // the last card clears the fade fully when scrolled
    paddingBottom: 6,
    paddingTop: 2,
  },
  edgeFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 36,
  },
  edgeFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 22,
  },
  block: {
    width: 124,
    minHeight: 118,
    borderRadius: 16, borderCurve: 'continuous',
    paddingVertical: 13,
    paddingHorizontal: 12,
    gap: 3,
    alignItems: 'flex-start',
  },
  waitingBlock: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  vs: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    fontStyle: 'italic',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 9, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  openSeat: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  openSeatMark: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
  },
  // centered on the FACE, not the box — the 3px inset ledge eats the
  // bottom (owner: "the p is sitting low")
  avatarLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#1F1442',
    includeFontPadding: false,
    marginTop: -2,
  },
  name: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14.5,
    lineHeight: 17,
  },
  stat: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  waitDot: {
    width: 6,
    height: 6,
    borderRadius: 2, borderCurve: 'continuous',
  },
});
