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

import { PALETTE, tileColorFor } from '@/game/palette';
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
  // CUSTOM AMOUNTS (owner) — the organizer names any door, 0..500
  const [customEntry, setCustomEntry] = useState(false);
  const [entryText, setEntryText] = useState('');
  const entryVal = customEntry
    ? Math.min(500, Math.max(0, parseInt(entryText, 10) || 0))
    : entry;
  const entryOk = !customEntry || entryText.length > 0;
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
    const r = await createRoom(name.trim(), entryVal);
    track('room_create', { entry: entryVal, custom: customEntry, ok: typeof r === 'object' });
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
                a showdown for your whole circle — you set the door, everyone antes into one pot, top score takes it.
              </Text>
              {/* ROWS, the showdowns grammar (owner: "more like showdowns") */}
              <Pressable onPress={() => setFace('create')} style={styles.row} hitSlop={4}>
                <View style={[styles.blockIcon, { backgroundColor: theme.pill }]}>
                  <Text style={styles.blockEmoji}>🔒</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: theme.ink }]}>make a room</Text>
                  <Text style={[styles.rowStat, { color: theme.faint }]}>you dictate the money</Text>
                </View>
                <View style={styles.spring} />
                <Text style={[styles.rowGo, { color: ACCENT }]}>post ›</Text>
              </Pressable>
              <Pressable onPress={() => setFace('join')} style={styles.row} hitSlop={4}>
                <View style={[styles.blockIcon, styles.dashedIcon, { borderColor: theme.dashed }]}>
                  <Text style={[styles.blockMark, { color: theme.faint }]}>?</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: theme.ink }]}>enter a code</Text>
                  <Text style={[styles.rowStat, { color: theme.faint }]}>got an invite?</Text>
                </View>
                <View style={styles.spring} />
                <Text style={[styles.rowGo, { color: ACCENT }]}>join ›</Text>
              </Pressable>
              {/* pending offers — accepting pays the door (consent = tap) */}
              {invites.map((inv) => {
                const pal = PALETTE[tileColorFor(inv.inviterName[0]?.toLowerCase() ?? 'a', 0)];
                return (
                  <Pressable key={inv.code} onPress={() => doJoin(inv.code)} style={styles.row} hitSlop={4}>
                    <View style={[styles.blockIcon, { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }]}>
                      <Text style={styles.blockLetter}>{inv.inviterName[0]?.toLowerCase()}</Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.rowName, { color: theme.ink }]} numberOfLines={1}>
                        {inv.inviterName.toLowerCase()}&rsquo;s {inv.name}
                      </Text>
                      <Text style={[styles.rowStat, { color: ACCENT }]}>⚔️ you&rsquo;re invited</Text>
                    </View>
                    <View style={styles.spring} />
                    <Text style={[styles.rowGo, { color: ACCENT }]}>
                      {inv.entry === 0 ? 'free' : `${inv.entry} ✦`} · join ›
                    </Text>
                  </Pressable>
                );
              })}
              {myCodes.map((c) => (
                <Pressable key={c} onPress={() => doJoin(c)} style={styles.row} hitSlop={4}>
                  <View style={[styles.blockIcon, { backgroundColor: theme.pill }]}>
                    <Text style={[styles.blockMark, { color: theme.sub }]}>{c[0]}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, { color: theme.ink }]}>{c}</Text>
                    <Text style={[styles.rowStat, { color: theme.faint }]}>your room</Text>
                  </View>
                  <View style={styles.spring} />
                  <Text style={[styles.rowGo, { color: ACCENT }]}>open ›</Text>
                </Pressable>
              ))}
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
                  const on = !customEntry && entry === e;
                  return (
                    <Pressable
                      key={e}
                      onPress={() => {
                        setCustomEntry(false);
                        setEntry(e);
                      }}
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
                {/* CUSTOM (owner) — the organizer dictates ANY money */}
                <Pressable
                  onPress={() => setCustomEntry(true)}
                  style={[
                    styles.chip,
                    customEntry
                      ? { backgroundColor: ACCENT, boxShadow: `inset 0 -3px 0 ${ACCENT_EDGE}` }
                      : { backgroundColor: theme.pill },
                  ]}>
                  <Text style={[styles.chipText, { color: customEntry ? '#FFFFFF' : theme.sub }]}>…</Text>
                </Pressable>
              </View>
              {customEntry && (
                <TextInput
                  value={entryText}
                  onChangeText={(t) => setEntryText(t.replace(/[^0-9]/g, ''))}
                  placeholder="name the door (0–500)"
                  placeholderTextColor={theme.faint}
                  keyboardType="number-pad"
                  maxLength={3}
                  autoFocus
                  style={[styles.input, { color: theme.ink, backgroundColor: theme.card }]}
                />
              )}
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
                disabled={creating === 'busy' || !name.trim() || !entryOk}
                style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }, (!name.trim() || !entryOk) && { opacity: 0.45 }]}>
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
              {/* the terms as PILLS — the storm sheet's grammar */}
              <View style={styles.statRow}>
                <View style={[styles.statPill, { backgroundColor: theme.pill }]}>
                  <Text style={[styles.statText, { color: theme.ink }]}>
                    {room.hostName.toLowerCase()}&rsquo;s room
                  </Text>
                </View>
                <View style={[styles.statPill, { backgroundColor: theme.pill }]}>
                  <Text style={[styles.statText, { color: theme.ink }]}>{room.seats} in</Text>
                </View>
                <View style={[styles.statPill, { backgroundColor: theme.pill }]}>
                  <Text style={[styles.statText, { color: theme.ink }]}>
                    {room.entry === 0 ? 'free door' : `door ${room.entry} ✦`}
                  </Text>
                </View>
                <View style={[styles.statPill, { backgroundColor: '#F5B84A', boxShadow: 'inset 0 -2.5px 0 #CE9022' }]}>
                  <Text style={[styles.statText, { color: '#1F1442' }]}>pot {room.pot} ✦</Text>
                </View>
              </View>
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
                  board.map((r, i) => {
                    const pal = PALETTE[tileColorFor(r.name[0]?.toLowerCase() ?? 'a', 0)];
                    return (
                      <View key={`${r.name}-${i}`} style={styles.lbRow}>
                        <View style={[styles.blockIcon, styles.lbAvatar, { backgroundColor: pal.bg, boxShadow: `inset 0 -2.5px 0 ${pal.edge}` }]}>
                          <Text style={[styles.blockLetter, styles.lbLetter]}>
                            {r.name[0]?.toLowerCase()}
                          </Text>
                        </View>
                        <Text
                          style={[styles.lbName, { color: r.isMe ? ACCENT : theme.ink }]}
                          numberOfLines={1}>
                          {i === 0 ? '♛ ' : ''}{r.name.toLowerCase()}
                        </Text>
                        <Text style={[styles.lbScore, { color: theme.sub }]}>
                          {r.score.toLocaleString()}
                        </Text>
                      </View>
                    );
                  })}
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
                    <Text style={[styles.rowGo, { color: ACCENT }]}>
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
  // THE ROW GRAMMAR (owner: "more like showdowns") — block · text · go
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spring: { flex: 1 },
  rowText: {
    gap: 1,
    flexShrink: 1,
  },
  rowName: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
  },
  rowStat: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
  },
  rowGo: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  blockIcon: {
    width: 30,
    height: 30,
    borderRadius: 9, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedIcon: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  blockEmoji: { fontSize: 14 },
  blockMark: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    includeFontPadding: false,
  },
  blockLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#1F1442',
    includeFontPadding: false,
    marginTop: -2, // center on the FACE, not the box (inset ledge)
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  statPill: {
    borderRadius: 10, borderCurve: 'continuous',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  statText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  lbAvatar: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
  lbLetter: {
    fontSize: 12,
    marginTop: -1.5,
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
