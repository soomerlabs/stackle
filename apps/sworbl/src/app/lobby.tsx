// THE LOBBY (owner: "bottom sheet to join or create, dismiss, then the
// gameboard full screen") — one pageSheet for every storm/showdown entry:
//   ?seed=X            → storm lobby: tier + board leaderboard + PLAY
//   ?seed=X&create=1   → start a showdown: you vs ? + PLAY & POST
//   ?seed=X&vs=&target=&did= → take a showdown: ACCEPT claims HERE (a
//     lost race dies in the sheet, never after a board launch)
// PLAY replaces the sheet with the full-screen board (back = home).
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { track } from '@/net/analytics';

import { PALETTE, tileColorFor } from '@/game/palette';
import { getPlayerName } from '@/game/player';
import { POINT_PACKS } from '@/game/point-packs';
import { dailyStormBoards, stormIntensity, stormName } from '@/game/storm-seeds';
import { ACCENT, ACCENT_EDGE, useTheme } from '@/game/theme';
import { TraceLaunch } from '@/components/trace-launch';
import { buyPack, claimShowdown, fetchMyShowdownPoints, spendPoints } from '@/net/duels';
import { fetchPractice } from '@/net/standings-remote';

function fmt(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export default function LobbyScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    seed?: string; create?: string; vs?: string; target?: string; did?: string;
    stk?: string; sealed?: string;
  }>();
  const seed = typeof params.seed === 'string' ? params.seed : '';
  const creating = params.create === '1';
  const vsName = typeof params.vs === 'string' && params.vs ? params.vs : null;
  const vsScore = Number(params.target);
  const did = Number(params.did);
  // SEALED HANDS (owner: "you only find out after you commit") — a sealed
  // post hides the score until the taker's own run banks
  const sealedJoin = params.sealed === '1';
  const joining = !!vsName && Number.isFinite(did) && (sealedJoin || Number.isFinite(vsScore));
  const joinStake = Number(params.stk) > 0 ? Number(params.stk) : 25;

  // THE NAMED GAMBLE (owner: "put what you're willing to gamble in the
  // 1v1 request") — poster picks the ante; the pot is always 2×
  const STAKES = [10, 25, 50, 100];
  const [stake, setStake] = useState(25);
  const [sealed, setSealed] = useState(false);
  // CALL-OUT (owner: "can i select a specific user?") — optional; blank
  // keeps the seat open to anyone
  const [callout, setCallout] = useState('');
  const [more, setMore] = useState(false); // the sealed/call-out drawer

  // PICK YOUR WEATHER (owner: "can i pick what kind i want?") — creating
  // a showdown offers all four boards; the rail's squall is just the
  // default. Storms and takes keep the seed they arrived with.
  const boards = useMemo(() => dailyStormBoards(), []);
  const [pickedSeed, setPickedSeed] = useState<string | null>(null);
  const activeSeed = creating && pickedSeed ? pickedSeed : seed;
  const intensity = stormIntensity(activeSeed);
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

  const [claiming, setClaiming] = useState<'idle' | 'busy' | 'taken' | 'poor' | 'played' | 'error'>('idle');
  // the wallet — stakes on showdown faces, ENTRY on paid storm tiers
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchMyShowdownPoints().then((v) => live && v != null && setBalance(v));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE VELVET ROPE (owner: "gate joining unless you have credits omg")
  // — the door price is known BEFORE the swipe: storms cost the tier's
  // entry, showdowns cost the ante. Short = no swipe, and the sheet
  // points at the wallet. balance null (offline) never gates — the
  // server 402 stays the backstop.
  // creating pays BOTH the board's door and the ante (audit H4: gating
  // on the stake alone let players pay the door, play, then fail to post)
  const doorPrice = joining ? joinStake : creating ? stake + intensity.entry : intensity.entry;
  const broke = balance != null && balance < doorPrice;
  // a poster who can't cover the default snaps to their biggest
  // affordable stake — the gate should redirect, not just refuse
  useEffect(() => {
    if (!creating || balance == null || balance >= stake) return;
    const affordable = [...STAKES].reverse().find((s) => s <= balance);
    if (affordable) setStake(affordable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance]);

  // the inline top-up (owner: "want some? okay here ya go") — receipt-
  // ref'd like every purchase; success lands the new balance in place
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const buyingRef = useRef(false);
  const buyInline = async (key: 'splash' | 'surge' | 'deluge') => {
    if (buyingRef.current) return;
    buyingRef.current = true;
    setBuyingPack(key);
    // random ref per tap (audit M4) — each intent is its own receipt
    const r = await buyPack(key, `topup-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    buyingRef.current = false;
    setBuyingPack(null);
    // the paywall experiment's core datum: WHO taps buy AT THE DOOR
    track('pack_tap', { pack: key, source: 'door', door: doorPrice, ok: r !== 'error' });
    if (r !== 'error') setBalance(r.balance);
  };

  const [entering, setEntering] = useState<'idle' | 'busy' | 'poor' | 'error'>('idle');
  // one receipt per sheet visit (audit H3): a lost response retried with
  // the same ref can never charge the door twice
  const entryRef = useRef(`entry-${Math.random().toString(36).slice(2, 10)}`);
  const play = async () => {
    // PAID TIERS charge at the door (owner: "enter some points to get
    // into the storms") — drizzle stays the free on-ramp
    if (intensity.entry > 0 && !joining) {
      if (entering === 'busy') return;
      setEntering('busy');
      let r: Awaited<ReturnType<typeof spendPoints>> = 'error';
      for (let attempt = 0; attempt < 3; attempt++) {
        r = await spendPoints(
          `storm-${intensity.key}` as 'storm-squall',
          `${entryRef.current}-${activeSeed}`
        );
        if (r !== 'error') break;
        await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
      }
      if (r === 'poor') {
        setEntering('poor');
        return;
      }
      if (r === 'error') {
        // NEVER silent (owner: "swiped play, nothing happened") — the
        // door failing must say so; same ref on retry, never a double
        setEntering('error');
        return;
      }
    }
    // REPLACE, not push — the sheet dismisses and the board owns the
    // screen; back from the board is home (owner flow)
    track(creating ? 'showdown_create_launch' : 'storm_enter', {
      tier: intensity.key,
      entry: intensity.entry,
      ...(creating ? { stake, sealed, callout: !!callout.trim() } : {}),
    });
    router.replace(
      `/storm?seed=${activeSeed}&go=1${creating ? `&post=1&stake=${stake}&sealed=${sealed ? 1 : 0}${callout.trim() ? `&callout=${encodeURIComponent(callout.trim())}` : ''}` : ''}`
    );
  };

  const accept = async () => {
    if (claiming === 'busy') return;
    setClaiming('busy');
    const r = await claimShowdown(did);
    track('showdown_accept', { stake: joinStake, sealed: sealedJoin, result: r });
    if (r === 'ok') {
      // sealed: no target rides the launch — the board races blind
      router.replace(
        `/storm?seed=${seed}&go=1&vs=${encodeURIComponent(vsName!)}&did=${did}&stk=${joinStake}${sealedJoin ? '&sealed=1' : `&target=${vsScore}`}`
      );
      return;
    }
    setClaiming(r === 'taken' ? 'taken' : r === 'poor' ? 'poor' : r === 'played' ? 'played' : 'error');
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
          {/* tier identity — the flag IS the hurricane. Showdown faces
              drop the weather chip (owner: "get rid of the far emoji") —
              the matchup avatars are the identity there. */}
          <View style={styles.tierRow}>
            {!(creating || joining) &&
              (intensity.key === 'hurricane' ? (
                <View style={[styles.tierChip, styles.flagChip]}>
                  <View style={styles.flagCenter} />
                </View>
              ) : (
                <View style={styles.tierChip}>
                  <Text style={styles.tierWeather}>{intensity.emoji}</Text>
                </View>
              ))}
            <View style={styles.tierText}>
              <Text style={[styles.tierName, { color: theme.ink }]}>
                {joining ? 'showdown' : creating ? 'showdown' : stormName(activeSeed)}
              </Text>
              {/* no double title (owner): the meta never repeats the name —
                  and it WRAPS (flexed container, no one-line overflow) */}
              <Text style={[styles.tierMeta, { color: theme.faint }]}>
                {(creating || joining) ? `${intensity.label} · ` : ''}
                {fmt(intensity.clockSecs)}
                {intensity.key === 'hurricane' ? ' · no mercy' : ''}
                {intensity.entry > 0 ? ` · entry ${intensity.entry} ✦` : ' · free'}
                {balance != null ? ` · you have ${balance.toLocaleString()}` : ''}
              </Text>
            </View>
          </View>

          {/* the matchup (showdowns) or the board's standings (storms) */}
          {(creating || joining) ? (
            <View style={styles.duelBlock}>
              <View style={styles.vsRow}>
                <View style={[styles.bigAvatar, { backgroundColor: myPal.bg, boxShadow: `inset 0 -4px 0 ${myPal.edge}` }]}>
                  <Text style={styles.bigAvatarLetter}>{myName[0]?.toUpperCase()}</Text>
                </View>
                <Text style={[styles.vsBig, { color: theme.faint }]}>vs</Text>
                {joining ? (
                  <View style={[styles.bigAvatar, { backgroundColor: themPal.bg, boxShadow: `inset 0 -4px 0 ${themPal.edge}` }]}>
                    <Text style={styles.bigAvatarLetter}>{vsName![0]?.toUpperCase()}</Text>
                  </View>
                ) : (
                  <View style={[styles.bigAvatar, styles.openSeat, { borderColor: theme.dashed }]}>
                    <Text style={[styles.openMark, { color: theme.faint }]}>?</Text>
                  </View>
                )}
              </View>
              {joining && (
                <Text style={[styles.duelLine, { color: theme.sub }]}>
                  {sealedJoin
                    ? `${vsName!.toLowerCase()}'s score is sealed — you find out what you were up against after your own run.`
                    : `${vsName!.toLowerCase()} put up ${vsScore.toLocaleString()}. beat it and the pot is yours.`}
                </Text>
              )}
              {/* THE UNCLUTTERED CREATE (owner: "so cluttered, break it
                  up") — two labeled rows carry the core path (board →
                  ante → swipe); sealed + call-outs fold behind a quiet
                  disclosure, the app's own grammar */}
              {creating && (
                <>
                  <View style={styles.group}>
                    <Text style={[styles.groupLabel, { color: theme.faint }]}>board</Text>
                    <View style={styles.stakeRow}>
                      {boards.map((b) => {
                        const on = activeSeed === b.seed;
                        return (
                          <Pressable
                            key={b.seed}
                            onPress={() => setPickedSeed(b.seed)}
                            style={[
                              styles.tierPick,
                              on
                                ? { backgroundColor: b.intensity.hue.bg, boxShadow: `inset 0 -3px 0 ${b.intensity.hue.edge}` }
                                : { backgroundColor: theme.pill },
                            ]}>
                            <Text style={[styles.tierPickEmoji, !on && { opacity: 0.5 }]}>
                              {b.intensity.emoji}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <View style={styles.group}>
                    <Text style={[styles.groupLabel, { color: theme.faint }]}>ante</Text>
                    <View style={styles.stakeRow}>
                      {STAKES.map((s, i) => {
                        const pal = PALETTE[i % PALETTE.length];
                        const on = stake === s;
                        const short = balance != null && balance < s;
                        return (
                          <Pressable
                            key={s}
                            disabled={short}
                            onPress={() => setStake(s)}
                            style={[
                              styles.stakeChip,
                              on
                                ? { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }
                                : { backgroundColor: theme.pill, opacity: short ? 0.35 : 1 },
                            ]}>
                            <Text style={[styles.stakeChipText, { color: on ? '#1F1442' : theme.sub }]}>
                              {s} ✦
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  {/* the quiet drawer — most posts never need it */}
                  <Pressable onPress={() => setMore((m) => !m)} hitSlop={8}>
                    <Text style={[styles.moreLink, { color: more ? theme.sub : theme.faint }]}>
                      {more
                        ? 'less'
                        : sealed || callout.trim()
                          ? `${sealed ? '🂠 sealed' : 'open hand'}${callout.trim() ? ` · ⚔️ ${callout.trim().toLowerCase()}` : ''} ›`
                          : 'sealed hand · call someone out ›'}
                    </Text>
                  </Pressable>
                  {more && (
                    <>
                      <View style={styles.handRow}>
                        {([false, true] as const).map((v) => (
                          <Pressable
                            key={String(v)}
                            onPress={() => setSealed(v)}
                            style={[
                              styles.handChip,
                              sealed === v
                                ? { backgroundColor: ACCENT, boxShadow: `inset 0 -3px 0 ${ACCENT_EDGE}` }
                                : { backgroundColor: theme.pill },
                            ]}>
                            <Text style={[styles.handChipText, { color: sealed === v ? '#FFFFFF' : theme.sub }]}>
                              {v ? 'sealed' : 'open hand'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[styles.handHint, { color: theme.faint }]}>
                        {sealed
                          ? 'they won’t see your score until their run is in'
                          : 'they race your recorded run, score in view'}
                      </Text>
                      <TextInput
                        value={callout}
                        onChangeText={setCallout}
                        placeholder="call someone out (optional)"
                        placeholderTextColor={theme.faint}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={24}
                        style={[styles.calloutInput, { color: theme.ink, backgroundColor: theme.pill }]}
                      />
                    </>
                  )}
                </>
              )}
              {/* THE STAKES (owner: points on the line) */}
              <Text style={[styles.stakeLine, { color: theme.faint }]}>
                {`ante ${(joining ? joinStake : stake).toLocaleString()} ✦ · winner takes ${((joining ? joinStake : stake) * 2).toLocaleString()}`}
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
              {claiming === 'played' && (
                <Text style={[styles.claimNote, { color: '#F58A66' }]}>
                  you&rsquo;ve already played this board — that&rsquo;d be free money. pick another fight.
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
          {broke && (
            // THE OFFER (owner: "not enough, want some? okay here ya go")
            // — the packs come TO the door: tap one, the balance lands in
            // place, the gate lifts, the swipe wakes up. No detour.
            <View style={styles.brokeBlock}>
              <Text style={[styles.claimNote, { color: '#F58A66' }]}>
                this door is {doorPrice.toLocaleString()} ✦ — you have {balance!.toLocaleString()}. want some?
              </Text>
              <View style={styles.packRow}>
                {POINT_PACKS.map((p) => {
                  const pal = PALETTE[p.pal];
                  const busy = buyingPack === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      disabled={buyingPack != null}
                      onPress={() => buyInline(p.key)}
                      style={[styles.packChip, { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }]}>
                      <Text style={styles.packChipPts}>{busy ? '…' : `+${p.points}`}</Text>
                      <Text style={styles.packChipTag}>{p.sticker}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.mockLine, { color: theme.faint }]}>
                nothing charges yet — this is the dress rehearsal
              </Text>
            </View>
          )}
          {entering === 'poor' && !broke && (
            <Text style={[styles.claimNote, { color: '#F58A66' }]}>
              not enough points for the entry — the drizzle is always free
            </Text>
          )}
          {entering === 'error' && (
            <Text style={[styles.claimNote, { color: '#F58A66' }]}>
              the door didn&rsquo;t answer — swipe again (a retry never double-charges)
            </Text>
          )}
          <TraceLaunch
            onCommit={joining ? accept : play}
            disabled={broke || claiming === 'busy' || claiming === 'taken' || claiming === 'poor' || claiming === 'played' || entering === 'busy' || entering === 'poor'} // 'error' stays swipeable — retry is safe (receipt ref)
            caption={
              broke
                ? 'not enough points'
                : joining
                  ? claiming === 'busy'
                    ? 'claiming…'
                    : 'swipe to accept'
                  : creating
                    ? 'swipe to play & post'
                    : 'swipe to play'
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
  tierText: {
    flex: 1, // the meta line WRAPS instead of running off the sheet
  },
  tierPickRow: {
    flexDirection: 'row',
    gap: 9,
  },
  tierPick: {
    width: 46,
    height: 42,
    borderRadius: 12, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierPickEmoji: {
    fontSize: 21,
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
  tierWeather: { fontSize: 32 },
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
    lineHeight: 28,
    color: '#1F1442',
    includeFontPadding: false,
    marginTop: -4, // the 4px ledge — center on the FACE, not the box
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
  stakeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  group: {
    alignItems: 'center',
    gap: 6,
  },
  groupLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 1.2,
  },
  moreLink: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
    paddingVertical: 2,
  },
  stakeChip: {
    borderRadius: 11, borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  stakeChipText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },
  handRow: {
    flexDirection: 'row',
    gap: 8,
  },
  handChip: {
    borderRadius: 11, borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  handChipText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    letterSpacing: 0.3,
  },
  handHint: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    fontStyle: 'italic',
  },
  calloutInput: {
    alignSelf: 'stretch',
    marginHorizontal: 12,
    borderRadius: 11, borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
    textAlign: 'center',
  },
  claimNote: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    textAlign: 'center',
  },
  brokeBlock: {
    alignItems: 'center',
    gap: 9,
  },
  packRow: {
    flexDirection: 'row',
    gap: 8,
  },
  packChip: {
    borderRadius: 12, borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 1,
  },
  packChipPts: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#1F1442',
    includeFontPadding: false,
  },
  packChipTag: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
    color: '#1F1442',
    opacity: 0.7,
    fontVariant: ['tabular-nums'],
  },
  mockLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    fontStyle: 'italic',
  },
  lbBlock: {
    gap: 9,
    justifyContent: 'center', // the empty line centers in the space (owner)
    // FIXED height (audit: fitToContents re-measured when the async top-5
    // landed and the sheet visibly grew) — loading paints into this space
    height: 148,
  },
  lbEmpty: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
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
