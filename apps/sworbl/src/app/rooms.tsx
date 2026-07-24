// PRIVATE ROOMS (owner: "private rooms, where the organizer dictates the
// money") — one content-height sheet, four faces:
//   pick   → make a room / enter a code / your saved rooms
//   create → name it, set the buy-in, mint the code
//   join   → type the code, see the terms, pay the door
//   room   → the room card: code (share it), pot, board, PLAY, host CALL IT
// Entries are charged by the room edge function (idempotent joins); the
// board is the practice lane on the room's own seed.
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import engine from '@sworbl/engine';

import { PALETTE } from '@/game/palette';
import { ACCENT, ACCENT_EDGE, useTheme } from '@/game/theme';
import { track } from '@/net/analytics';
import {
  createRoom, fetchRoomInvites, fetchRoomState, inviteToRoom, joinRoom, settleRoom,
  type RoomCard, type RoomInvite, type RoomSettle,
} from '@/net/duels';
import { fetchPractice } from '@/net/standings-remote';

const MY_ROOMS_KEY = 'sworbl_rn_my_rooms';
const ENTRIES = [0, 10, 25, 50, 100];

function savedRooms(): string[] {
  return engine.store.getJSON(MY_ROOMS_KEY, []) as string[];
}
function rememberRoom(code: string) {
  const cur = savedRooms().filter((c) => c !== code);
  engine.store.setJSON(MY_ROOMS_KEY, [code, ...cur].slice(0, 6));
}

type Face = 'pick' | 'create' | 'join' | 'room';

export default function RoomsScreen() {
  const theme = useTheme();
  // DEEP LINK (owner: AASA on sworbl.com) — /rooms?code=ABC123 lands on
  // the join face prefilled. NEVER auto-joins: the door charges points,
  // so the swipe stays the consent.
  const params = useLocalSearchParams<{ code?: string }>();
  const linkedCode =
    typeof params.code === 'string' && /^[A-Za-z0-9]{4,8}$/.test(params.code)
      ? params.code.toUpperCase()
      : null;
  const [face, setFace] = useState<Face>(linkedCode ? 'join' : 'pick');
  const [myCodes] = useState<string[]>(() => savedRooms());
  // THE INBOX (owner: "add in users and have them be added") — pending
  // offers; accepting pays the door, so it's a tap, never automatic
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  useEffect(() => {
    let live = true;
    void fetchRoomInvites().then((v) => live && setInvites(v));
    return () => {
      live = false;
    };
  }, []);

  // create face
  const [name, setName] = useState('');
  const [entry, setEntry] = useState(25);
  const [creating, setCreating] = useState<'idle' | 'busy' | 'poor' | 'error'>('idle');

  // join face
  const [code, setCode] = useState(linkedCode ?? '');
  const [joining, setJoining] = useState<'idle' | 'busy' | 'poor' | 'gone' | 'settled' | 'error'>('idle');

  // room face
  const [room, setRoom] = useState<RoomCard | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState<'idle' | 'busy' | 'sent' | 'already' | 'nobody' | 'error'>('idle');
  const sendInvite = async () => {
    if (!room || inviting === 'busy' || !inviteName.trim()) return;
    setInviting('busy');
    const r = await inviteToRoom(room.code, inviteName.trim());
    track('room_invite', { ok: r === 'ok' });
    setInviting(r === 'ok' ? 'sent' : r === 'already-in' ? 'already' : r === 'no-player' ? 'nobody' : 'error');
    if (r === 'ok') setInviteName('');
    setTimeout(() => setInviting('idle'), 2200);
  };
  const [board, setBoard] = useState<Array<{ name: string; score: number; isMe: boolean }> | null>(null);
  const [settling, setSettling] = useState(false);
  const [settled, setSettled] = useState<RoomSettle | null>(null);
  useEffect(() => {
    if (!room) return;
    let live = true;
    void fetchPractice(room.seed, 5).then((rows) => live && rows && setBoard(rows));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.seed]);

  const enterRoom = (r: RoomCard) => {
    rememberRoom(r.code);
    setRoom(r);
    setBoard(null);
    setSettled(null);
    setFace('room');
  };

  const doCreate = async () => {
    if (creating === 'busy' || !name.trim()) return;
    setCreating('busy');
    const r = await createRoom(name.trim(), entry);
    track('room_create', { entry, ok: typeof r === 'object' });
    if (r === 'poor' || r === 'error') {
      setCreating(r);
      return;
    }
    setCreating('idle');
    const state = await fetchRoomState(r.code);
    if (typeof state === 'object') enterRoom(state);
  };

  const doJoin = async (c: string) => {
    if (joining === 'busy') return;
    setJoining('busy');
    const r = await joinRoom(c.trim().toUpperCase());
    track('room_join', { ok: typeof r === 'object' });
    if (typeof r === 'object') {
      setJoining('idle');
      enterRoom(r);
      return;
    }
    setJoining(r);
  };

  const callIt = async () => {
    if (!room || settling) return;
    setSettling(true);
    const r = await settleRoom(room.code);
    setSettling(false);
    if (r !== 'error') setSettled(r);
  };

  const play = () => {
    if (!room) return;
    router.replace(`/storm?seed=${room.seed}&go=1`);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView edges={['bottom']}>
        <View style={styles.content}>
          {face === 'pick' && (
            <>
              <Text style={[styles.title, { color: theme.ink }]}>private rooms</Text>
              <Text style={[styles.sub, { color: theme.sub }]}>
                your board, your buy-in, your circle. the pot goes to the top score when the host calls it.
              </Text>
              <View style={styles.pickRow}>
                <Pressable
                  onPress={() => setFace('create')}
                  style={[styles.pickCard, { backgroundColor: theme.card }]}>
                  <Text style={styles.pickEmoji}>🔒</Text>
                  <Text style={[styles.pickLabel, { color: theme.ink }]}>make a room</Text>
                  <Text style={[styles.pickMeta, { color: theme.faint }]}>you set the stakes</Text>
                </Pressable>
                <Pressable
                  onPress={() => setFace('join')}
                  style={[styles.pickCard, { backgroundColor: theme.card }]}>
                  <Text style={styles.pickEmoji}>🎟️</Text>
                  <Text style={[styles.pickLabel, { color: theme.ink }]}>enter a code</Text>
                  <Text style={[styles.pickMeta, { color: theme.faint }]}>got an invite?</Text>
                </Pressable>
              </View>
              {/* pending offers — accepting pays the door (consent = tap) */}
              {invites.length > 0 && (
                <View style={styles.savedWrap}>
                  <Text style={[styles.savedTitle, { color: theme.faint }]}>invites</Text>
                  {invites.map((inv) => (
                    <Pressable key={inv.code} onPress={() => doJoin(inv.code)} style={styles.savedRow}>
                      <Text style={[styles.savedCode, styles.inviteName, { color: theme.ink }]} numberOfLines={1}>
                        {inv.inviterName.toLowerCase()}&rsquo;s {inv.name}
                      </Text>
                      <Text style={[styles.savedGo, { color: ACCENT }]}>
                        {inv.entry === 0 ? 'free' : `${inv.entry} ✦`} · join ›
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {myCodes.length > 0 && (
                <View style={styles.savedWrap}>
                  <Text style={[styles.savedTitle, { color: theme.faint }]}>your rooms</Text>
                  {myCodes.map((c) => (
                    <Pressable key={c} onPress={() => doJoin(c)} style={styles.savedRow}>
                      <Text style={[styles.savedCode, { color: theme.ink }]}>{c}</Text>
                      <Text style={[styles.savedGo, { color: ACCENT }]}>open ›</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {face === 'create' && (
            <>
              <Text style={[styles.title, { color: theme.ink }]}>make a room</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="name the room"
                placeholderTextColor={theme.faint}
                maxLength={24}
                autoFocus
                style={[styles.input, { color: theme.ink, backgroundColor: theme.card }]}
              />
              <Text style={[styles.fieldLabel, { color: theme.faint }]}>
                the buy-in — you pay it too, straight into the pot
              </Text>
              <View style={styles.chipRow}>
                {ENTRIES.map((e, i) => {
                  const pal = PALETTE[i % PALETTE.length];
                  const on = entry === e;
                  return (
                    <Pressable
                      key={e}
                      onPress={() => setEntry(e)}
                      style={[
                        styles.chip,
                        on
                          ? { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }
                          : { backgroundColor: theme.pill },
                      ]}>
                      <Text style={[styles.chipText, { color: on ? '#1F1442' : theme.sub }]}>
                        {e === 0 ? 'free' : `${e} ✦`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {creating === 'poor' && (
                <Text style={[styles.note, { color: '#F58A66' }]}>
                  not enough points to cover your own buy-in
                </Text>
              )}
              {creating === 'error' && (
                <Text style={[styles.note, { color: theme.faint }]}>
                  couldn&rsquo;t mint the room — check your connection
                </Text>
              )}
              <Pressable
                onPress={doCreate}
                disabled={creating === 'busy' || !name.trim()}
                style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }, !name.trim() && { opacity: 0.45 }]}>
                <Text style={styles.ctaText}>{creating === 'busy' ? 'MINTING…' : 'MAKE IT'}</Text>
              </Pressable>
              <Pressable onPress={() => setFace('pick')} hitSlop={8} style={styles.backLink}>
                <Text style={[styles.backText, { color: theme.faint }]}>back</Text>
              </Pressable>
            </>
          )}

          {face === 'join' && (
            <>
              <Text style={[styles.title, { color: theme.ink }]}>enter a code</Text>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={theme.faint}
                maxLength={6}
                autoFocus
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, styles.codeInput, { color: theme.ink, backgroundColor: theme.card }]}
              />
              <Text style={[styles.note, { color: theme.faint }]}>
                the buy-in charges when you join — the organizer set it
              </Text>
              {joining === 'poor' && (
                <Text style={[styles.note, { color: '#F58A66' }]}>not enough points for this door</Text>
              )}
              {joining === 'gone' && (
                <Text style={[styles.note, { color: '#F58A66' }]}>no room wears that code</Text>
              )}
              {joining === 'settled' && (
                <Text style={[styles.note, { color: '#F58A66' }]}>that room already settled</Text>
              )}
              {joining === 'error' && (
                <Text style={[styles.note, { color: theme.faint }]}>
                  couldn&rsquo;t join — check your connection
                </Text>
              )}
              <Pressable
                onPress={() => doJoin(code)}
                disabled={joining === 'busy' || code.trim().length < 4}
                style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }, code.trim().length < 4 && { opacity: 0.45 }]}>
                <Text style={styles.ctaText}>{joining === 'busy' ? 'KNOCKING…' : 'JOIN'}</Text>
              </Pressable>
              <Pressable onPress={() => setFace('pick')} hitSlop={8} style={styles.backLink}>
                <Text style={[styles.backText, { color: theme.faint }]}>back</Text>
              </Pressable>
            </>
          )}

          {face === 'room' && room && (
            <>
              <Text style={[styles.title, { color: theme.ink }]}>{room.name}</Text>
              <Text style={[styles.sub, { color: theme.faint }]}>
                {room.hostName.toLowerCase()}&rsquo;s room · {room.seats} in ·{' '}
                {room.entry === 0 ? 'free door' : `${room.entry} ✦ door`} · pot {room.pot} ✦
              </Text>
              {/* the code IS the invite — tap to share */}
              <Pressable
                onPress={() =>
                  Share.share({
                    message: `sworbl private room “${room.name}” — door is ${room.entry === 0 ? 'free' : `${room.entry} ✦`}, top score takes the pot. get in: https://sworbl.com/rooms?code=${room.code}`,
                  }).catch(() => {})
                }
                style={[styles.codeCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.codeBig, { color: theme.ink }]}>{room.code}</Text>
                <Text style={[styles.codeShare, { color: ACCENT }]}>tap to share the code</Text>
              </Pressable>

              <View style={styles.lbBlock}>
                {board == null && (
                  <Text style={[styles.note, { color: theme.faint }]}>checking the board…</Text>
                )}
                {board != null && board.length === 0 && (
                  <Text style={[styles.note, { color: theme.faint }]}>
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

              {settled && (
                <Text style={[styles.note, { color: '#5FD6A8' }]}>
                  {settled.refunded
                    ? 'nobody played — everyone got their buy-in back'
                    : `${settled.winnerName?.toLowerCase() ?? 'someone'} takes the pot · ${settled.pot} ✦`}
                </Text>
              )}
              {room.status === 'settled' && !settled && (
                <Text style={[styles.note, { color: theme.faint }]}>this room has settled</Text>
              )}

              {room.status === 'open' && !settled && (
                <Pressable
                  onPress={play}
                  style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
                  <Text style={styles.ctaText}>PLAY</Text>
                </Pressable>
              )}
              {/* the host summons (owner: "add in users") — by name */}
              {room.youAreHost && room.status === 'open' && !settled && (
                <View style={styles.inviteRow}>
                  <TextInput
                    value={inviteName}
                    onChangeText={setInviteName}
                    placeholder="invite by name"
                    placeholderTextColor={theme.faint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={24}
                    style={[styles.input, styles.inviteInput, { color: theme.ink, backgroundColor: theme.card }]}
                  />
                  <Pressable
                    onPress={sendInvite}
                    disabled={inviting === 'busy' || !inviteName.trim()}
                    style={[styles.inviteBtn, { backgroundColor: theme.card }]}>
                    <Text style={[styles.savedGo, { color: ACCENT }]}>
                      {inviting === 'busy'
                        ? '…'
                        : inviting === 'sent'
                          ? 'sent ✦'
                          : inviting === 'already'
                            ? 'in already'
                            : inviting === 'nobody'
                              ? 'no one?'
                              : inviting === 'error'
                                ? 'again?'
                                : 'invite ›'}
                    </Text>
                  </Pressable>
                </View>
              )}
              {room.youAreHost && room.status === 'open' && !settled && (
                <Pressable
                  onPress={callIt}
                  disabled={settling}
                  style={[styles.settleBtn, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
                  <Text style={styles.settleText}>
                    {settling ? 'calling it…' : 'call it — pot to the top score'}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backLink}>
                <Text style={[styles.backText, { color: theme.faint }]}>done</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  content: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 12,
    gap: 14,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 21,
  },
  sub: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    lineHeight: 19,
  },
  pickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickCard: {
    flex: 1,
    borderRadius: 16, borderCurve: 'continuous',
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 2,
  },
  pickEmoji: {
    fontSize: 26,
    marginBottom: 4,
  },
  pickLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14.5,
  },
  pickMeta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
  },
  savedWrap: {
    gap: 8,
    paddingTop: 2,
  },
  savedTitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedCode: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    letterSpacing: 2,
  },
  savedGo: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
  },
  input: {
    borderRadius: 13, borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
  },
  codeInput: {
    letterSpacing: 6,
    textAlign: 'center',
    fontSize: 22,
  },
  fieldLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.3,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: 11, borderCurve: 'continuous',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    textAlign: 'center',
  },
  codeCard: {
    borderRadius: 16, borderCurve: 'continuous',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  codeBig: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 30,
    letterSpacing: 8,
    includeFontPadding: false,
  },
  codeShare: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
  },
  lbBlock: {
    gap: 8,
    height: 128,
    justifyContent: 'center',
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
  inviteName: {
    letterSpacing: 0,
    flex: 1,
  },
  inviteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  inviteBtn: {
    borderRadius: 13, borderCurve: 'continuous',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  settleBtn: {
    borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 13,
    alignItems: 'center',
  },
  cta: {
    borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  settleText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  backText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
  },
});
