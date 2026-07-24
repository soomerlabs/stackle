// THE SHOWDOWNS CARD (owner: "A and B compose" home) — one card,
// vertical rows, no sideways scroll: start-a-showdown up top, open
// challenges as rows (a call-out aimed at YOU leads), your own post as
// the quiet waiting row.
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { PALETTE, tileColorFor } from '@/game/palette';
import { getPlayerName } from '@/game/player';
import { dailyStormBoards } from '@/game/storm-seeds';
import { ACCENT, type Theme } from '@/game/theme';
import { listPausedRuns, type StormCtx } from '@/game/storm-runs';
import { fetchMyClaims, fetchOpenDuels, readCachedDuels, type MyClaim, type OpenDuel } from '@/net/duels';

const MAX_ROWS = 4;

export function ShowdownsRail({ theme, refreshNonce }: { theme: Theme; refreshNonce?: number }) {
  const [duels, setDuels] = useState<OpenDuel[]>(() => readCachedDuels());
  // showdowns default to the SQUALL (the picker in the sheet can change it)
  const squall = useMemo(() => dailyStormBoards()[1], []);
  const myName = getPlayerName();
  const myPal = PALETTE[tileColorFor(myName[0]?.toLowerCase() ?? 'p', 0)];
  const [claims, setClaims] = useState<MyClaim[]>([]);
  // boards left mid-run (local, instant) — the paused-showdown rows
  const [paused, setPaused] = useState<StormCtx[]>([]);
  useEffect(() => {
    let live = true;
    setPaused(listPausedRuns().filter((c) => c.post));
    fetchOpenDuels().then((d) => live && d && setDuels(d));
    // the fights you claimed and left — your ante is on the table
    fetchMyClaims().then((c) => live && setClaims(c));
    return () => {
      live = false;
    };
  }, [refreshNonce]);

  const mine = duels.filter((d) => d.mine);
  // call-outs aimed at YOU lead the card
  const open = duels
    .filter((d) => !d.mine)
    .sort((a, b) => Number(b.forMe) - Number(a.forMe))
    .slice(0, MAX_ROWS);

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.ink }]}>showdowns</Text>
        <Pressable
          onPress={() => router.push('/about-mode?mode=showdowns')}
          hitSlop={10}
          style={[styles.infoDot, { backgroundColor: theme.pill }]}>
          <Text style={[styles.infoDotText, { color: theme.sub }]}>i</Text>
        </Pressable>
        <View style={styles.spring} />
        <Text style={[styles.subtitle, { color: theme.faint }]}>mano a mano</Text>
      </View>

      {/* START — you vs the open seat */}
      <Pressable
        onPress={() => router.push(`/lobby?seed=${squall.seed}&create=1`)}
        style={styles.row}
        hitSlop={4}>
        <View style={[styles.avatar, { backgroundColor: myPal.bg, boxShadow: `inset 0 -3px 0 ${myPal.edge}` }]}>
          <Text style={styles.avatarLetter}>{myName[0]?.toLowerCase()}</Text>
        </View>
        <Text style={[styles.vs, { color: theme.faint }]}>vs</Text>
        <View style={[styles.avatar, styles.openSeat, { borderColor: theme.dashed }]}>
          <Text style={[styles.openSeatMark, { color: theme.faint }]}>?</Text>
        </View>
        <Text style={[styles.rowName, { color: theme.ink }]}>start a showdown</Text>
        <View style={styles.spring} />
        <Text style={[styles.rowGo, { color: ACCENT }]}>post ›</Text>
      </Pressable>

      {/* PAUSED MID-RUN (owner: "i hit the X — it's paused, we resume")
          — your own showdown run, parked. Tap lands on the RESUME cover. */}
      {paused.map((c) => (
        <Pressable
          key={`paused-${c.seed}`}
          onPress={() =>
            router.push(
              `/storm?seed=${c.seed}&post=1${c.stake ? `&stake=${c.stake}` : ''}&sealed=${c.sealed ? 1 : 0}${c.callout ? `&callout=${encodeURIComponent(c.callout)}` : ''}`
            )
          }
          style={styles.row}
          hitSlop={4}>
          <View style={[styles.avatar, { backgroundColor: myPal.bg, boxShadow: `inset 0 -3px 0 ${myPal.edge}` }]}>
            <Text style={styles.avatarLetter}>{myName[0]?.toLowerCase()}</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowName, { color: theme.ink }]}>your showdown</Text>
            <Text style={[styles.rowStat, { color: ACCENT }]}>paused mid-run</Text>
          </View>
          <View style={styles.spring} />
          <Text style={[styles.rowGo, { color: ACCENT }]}>resume ›</Text>
        </Pressable>
      ))}

      {/* FINISH YOUR FIGHT (owner: "close the board and come back?") —
          claimed, unresolved, ante on the table. Leads everything. */}
      {claims.map((c) => {
        const pal = PALETTE[tileColorFor(c.posterName[0]?.toLowerCase() ?? 'a', 0)];
        return (
          <Pressable
            key={`claim-${c.id}`}
            onPress={() =>
              router.push(
                `/storm?seed=${c.seed}&vs=${encodeURIComponent(c.posterName)}&did=${c.id}&stk=${c.stake}${c.sealed || c.score == null ? '&sealed=1' : `&target=${c.score}`}`
              )
            }
            style={styles.row}
            hitSlop={4}>
            <View style={[styles.avatar, { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }]}>
              <Text style={styles.avatarLetter}>{c.posterName[0]?.toLowerCase()}</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowName, { color: theme.ink }]} numberOfLines={1}>
                vs {c.posterName.toLowerCase()}
              </Text>
              <Text style={[styles.rowStat, { color: ACCENT }]} numberOfLines={1}>
                unfinished — your {c.stake} ✦ is on the table
              </Text>
            </View>
            <View style={styles.spring} />
            <Text style={[styles.rowGo, { color: ACCENT }]}>finish ›</Text>
          </Pressable>
        );
      })}

      {/* OPEN CHALLENGES — rows, call-outs first */}
      {open.map((d) => {
        const pal = PALETTE[tileColorFor(d.name[0]?.toLowerCase() ?? 'a', 0)];
        return (
          <Pressable
            key={d.id}
            onPress={() =>
              router.push(
                `/lobby?seed=${d.seed}&vs=${encodeURIComponent(d.name)}&did=${d.id}&stk=${d.stake}${d.sealed ? '&sealed=1' : `&target=${d.score}`}`
              )
            }
            style={styles.row}
            hitSlop={4}>
            <View style={[styles.avatar, { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }]}>
              <Text style={styles.avatarLetter}>{d.name[0]?.toLowerCase()}</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowName, { color: theme.ink }]} numberOfLines={1}>
                {d.name.toLowerCase()}
              </Text>
              <Text style={[styles.rowStat, { color: d.forMe ? ACCENT : theme.faint }]} numberOfLines={1}>
                {d.forMe
                  ? '⚔️ calls YOU out'
                  : d.sealed
                    ? '🂠 score sealed'
                    : `⚑ beat ${d.score.toLocaleString()}`}
              </Text>
            </View>
            <View style={styles.spring} />
            <Text style={[styles.rowGo, { color: ACCENT }]}>{d.stake} ✦ · take ›</Text>
          </Pressable>
        );
      })}

      {/* YOUR POST — the quiet waiting row */}
      {mine.map((d) => (
        <View key={`mine-${d.id}`} style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: myPal.bg, boxShadow: `inset 0 -3px 0 ${myPal.edge}` }]}>
            <Text style={styles.avatarLetter}>{myName[0]?.toLowerCase()}</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowName, { color: theme.ink }]}>
              your post · {d.sealed ? '🂠 sealed' : `${d.score.toLocaleString()} pts`} · {d.stake} ✦
            </Text>
            <View style={styles.waitRow}>
              <View style={[styles.waitDot, { backgroundColor: ACCENT }]} />
              <Text style={[styles.rowStat, { color: theme.faint }]} numberOfLines={1}>
                {d.challengedName ? `waiting for ${d.challengedName.toLowerCase()}…` : 'waiting…'}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {open.length === 0 && mine.length === 0 && (
        <Text style={[styles.empty, { color: theme.faint }]}>
          no open fights — post a score and see who bites
        </Text>
      )}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowText: {
    gap: 1,
    flexShrink: 1,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 9, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openSeat: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  openSeatMark: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
  },
  avatarLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#1F1442',
    includeFontPadding: false,
    marginTop: -2, // center on the FACE, not the box (the inset ledge)
  },
  vs: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    fontStyle: 'italic',
  },
  rowName: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
  },
  rowStat: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  rowGo: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  waitDot: {
    width: 6,
    height: 6,
    borderRadius: 2, borderCurve: 'continuous',
  },
  empty: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
  },
});
