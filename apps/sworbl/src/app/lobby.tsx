// THE LOBBY (owner: "bottom sheet to join or create, dismiss, then the
// gameboard full screen") — one pageSheet for every storm/showdown entry:
//   ?seed=X            → storm lobby: tier + board leaderboard + PLAY
//   ?seed=X&create=1   → start a showdown: you vs ? + PLAY & POST
//   ?seed=X&vs=&target=&did= → take a showdown: ACCEPT claims HERE (a
//     lost race dies in the sheet, never after a board launch)
// PLAY replaces the sheet with the full-screen board (back = home).
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PALETTE, tileColorFor } from '@/game/palette';
import { getPlayerName } from '@/game/player';
import { stormIntensity, stormName } from '@/game/storm-seeds';
import { ACCENT, ACCENT_EDGE, useTheme } from '@/game/theme';
import { TraceLaunch } from '@/components/trace-launch';
import { claimShowdown, fetchMyShowdownPoints } from '@/net/duels';
import { fetchPractice } from '@/net/standings-remote';

function fmt(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export default function LobbyScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    seed?: string; create?: string; vs?: string; target?: string; did?: string;
  }>();
  const seed = typeof params.seed === 'string' ? params.seed : '';
  const creating = params.create === '1';
  const vsName = typeof params.vs === 'string' && params.vs ? params.vs : null;
  const vsScore = Number(params.target);
  const did = Number(params.did);
  const joining = !!vsName && Number.isFinite(vsScore) && Number.isFinite(did);

  const intensity = stormIntensity(seed);
  const tierPal = intensity.hue;
  const myName = getPlayerName();
  const myPal = PALETTE[tileColorFor(myName[0]?.toLowerCase() ?? 'p', 0)];
  const themPal = vsName ? PALETTE[tileColorFor(vsName[0]?.toLowerCase() ?? 'a', 0)] : myPal;

  // the board's standings (storm lobby only — showdowns show the duel)
  const [board, setBoard] = useState<Array<{ name: string; score: number; isMe: boolean }> | null>(null);
  useEffect(() => {
    if (creating || joining || !seed) return;
    let live = true;
    void fetchPractice(seed, 5).then((rows) => live && rows && setBoard(rows));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const [claiming, setClaiming] = useState<'idle' | 'busy' | 'taken' | 'poor' | 'error'>('idle');
  // the wallet, for the stakes line (showdown faces only)
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!creating && !joining) return;
    let live = true;
    void fetchMyShowdownPoints().then((v) => live && v != null && setBalance(v));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = () => {
    // REPLACE, not push — the sheet dismisses and the board owns the
    // screen; back from the board is home (owner flow)
    router.replace(`/storm?seed=${seed}&go=1${creating ? '&post=1' : ''}`);
  };

  const accept = async () => {
    if (claiming === 'busy') return;
    setClaiming('busy');
    const r = await claimShowdown(did);
    if (r === 'ok') {
      router.replace(
        `/storm?seed=${seed}&go=1&vs=${encodeURIComponent(vsName!)}&target=${vsScore}&did=${did}`
      );
      return;
    }
    setClaiming(r === 'taken' ? 'taken' : r === 'poor' ? 'poor' : 'error');
  };

  if (!seed) {
    router.back();
    return null;
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.content}>
          {/* tier identity — the flag IS the hurricane */}
          <View style={styles.tierRow}>
            {intensity.key === 'hurricane' ? (
              <View style={[styles.tierChip, styles.flagChip]}>
                <View style={styles.flagCenter} />
              </View>
            ) : (
              <View style={[styles.tierChip, { backgroundColor: tierPal.bg, boxShadow: `inset 0 -3px 0 ${tierPal.edge}` }]}>
                <Text style={styles.tierBolts}>{'⚡'.repeat(intensity.bolts)}</Text>
              </View>
            )}
            <View>
              <Text style={[styles.tierName, { color: theme.ink }]}>
                {joining ? 'showdown' : creating ? 'showdown' : stormName(seed)}
              </Text>
              <Text style={[styles.tierMeta, { color: theme.faint }]}>
                {intensity.label} · {fmt(intensity.clockSecs)}
                {intensity.key === 'hurricane' ? ' · no mercy' : ''}
              </Text>
            </View>
          </View>

          {/* the matchup (showdowns) or the board's standings (storms) */}
          {(creating || joining) ? (
            <View style={styles.duelBlock}>
              <View style={styles.vsRow}>
                <View style={[styles.bigAvatar, { backgroundColor: myPal.bg, boxShadow: `inset 0 -4px 0 ${myPal.edge}` }]}>
                  <Text style={styles.bigAvatarLetter}>{myName[0]?.toLowerCase()}</Text>
                </View>
                <Text style={[styles.vsBig, { color: theme.faint }]}>vs</Text>
                {joining ? (
                  <View style={[styles.bigAvatar, { backgroundColor: themPal.bg, boxShadow: `inset 0 -4px 0 ${themPal.edge}` }]}>
                    <Text style={styles.bigAvatarLetter}>{vsName![0]?.toLowerCase()}</Text>
                  </View>
                ) : (
                  <View style={[styles.bigAvatar, styles.openSeat, { borderColor: theme.dashed }]}>
                    <Text style={[styles.openMark, { color: theme.faint }]}>?</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.duelLine, { color: theme.sub }]}>
                {joining
                  ? `${vsName!.toLowerCase()} put up ${vsScore.toLocaleString()}. beat it and the pot is yours.`
                  : 'play the board — your score becomes an open challenge.'}
              </Text>
              {/* THE STAKES (owner: points on the line) */}
              <Text style={[styles.stakeLine, { color: theme.faint }]}>
                ante 25 ✦ · winner takes 50
                {balance != null ? ` · you have ${balance.toLocaleString()}` : ''}
              </Text>
              {claiming === 'poor' && (
                <Text style={[styles.claimNote, { color: '#F58A66' }]}>
                  not enough points for the ante — win some back on the boards
                </Text>
              )}
              {claiming === 'taken' && (
                <Text style={[styles.claimNote, { color: '#F58A66' }]}>
                  someone claimed this one first
                </Text>
              )}
              {claiming === 'error' && (
                <Text style={[styles.claimNote, { color: theme.faint }]}>
                  couldn&rsquo;t claim — check your connection
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.lbBlock}>
              {board === null && (
                <Text style={[styles.lbEmpty, { color: theme.faint }]}>checking the board…</Text>
              )}
              {board != null && board.length === 0 && (
                <Text style={[styles.lbEmpty, { color: theme.faint }]}>
                  no scores yet — you set the bar
                </Text>
              )}
              {board != null &&
                board.map((r, i) => (
                  <View key={`${r.name}-${i}`} style={styles.lbRow}>
                    <Text style={[styles.lbRank, { color: theme.faint }]}>{i + 1}</Text>
                    <Text
                      style={[styles.lbName, { color: r.isMe ? ACCENT : theme.ink }]}
                      numberOfLines={1}>
                      {r.name.toLowerCase()}
                    </Text>
                    <Text style={[styles.lbScore, { color: theme.sub }]}>
                      {r.score.toLocaleString()}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* THE TRACE IS THE BUTTON (owner: on brand) — spell it to go */}
          <TraceLaunch
            onCommit={joining ? accept : play}
            disabled={claiming === 'busy' || claiming === 'taken' || claiming === 'poor'}
            caption={
              joining
                ? claiming === 'busy'
                  ? 'claiming…'
                  : 'trace to accept'
                : creating
                  ? 'trace to play & post'
                  : 'trace to play'
            }
          />
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.notNow}>
            <Text style={[styles.notNowText, { color: theme.faint }]}>not now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  safe: {},
  content: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 10,
    gap: 18,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tierChip: {
    width: 44,
    height: 44,
    borderRadius: 13, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagChip: {
    backgroundColor: '#E5484D',
    boxShadow: 'inset 0 -4px 0 #8C2328',
  },
  flagCenter: {
    width: 16,
    height: 16,
    borderRadius: 4, borderCurve: 'continuous',
    backgroundColor: '#17171C',
  },
  tierBolts: { fontSize: 13, letterSpacing: -2 },
  tierName: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 21,
  },
  tierMeta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  duelBlock: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 6,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bigAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigAvatarLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    color: '#1F1442',
    includeFontPadding: false,
    marginTop: -3, // the 4px ledge — center on the face
  },
  openSeat: {
    borderWidth: 2.5,
    borderStyle: 'dashed',
  },
  openMark: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 22,
    includeFontPadding: false,
    marginTop: -2,
  },
  vsBig: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    fontStyle: 'italic',
  },
  duelLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  stakeLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  claimNote: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
  },
  lbBlock: {
    gap: 9,
    paddingTop: 2,
    // FIXED height (audit: fitToContents re-measured when the async top-5
    // landed and the sheet visibly grew) — loading paints into this space
    height: 148,
  },
  lbEmpty: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 22,
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lbRank: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    width: 18,
    textAlign: 'right',
  },
  lbName: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    flex: 1,
  },
  lbScore: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  cta: {
    borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  notNow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  notNowText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
  },
});
