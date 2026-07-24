// PROFILE (handoff 4a, lifted as-is): avatar block + name + "since", the
// 2×2 stat cards (BEST green · AVG · GAMES · WORDS FOUND), YOUR BEST word
// as candy letter blocks with its pay badge, runner-up word pills, and the
// 9-week PLAY HISTORY heat grid. All device-local stats (stats.ts).
import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, useWindowDimensions, Modal, Pressable, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Icon } from '@/components/icon';
import { router } from 'expo-router';

import { ScreenBar } from '@/components/screen-bar';
import { ScreenHeader } from '@/components/screen-header';
import { Floaters } from '@/components/home/floaters';
import { fetchMyShowdownPoints, fetchPointEvents, type PointEvent } from '@/net/duels';
import { useTheme, CLUE_GREEN } from '@/game/theme';
import { PALETTE, tileColorFor } from '@/game/palette';
import { loadStats, historyGrid, streakDays } from '@/game/stats';
import { getPlayerName, setPlayerName, isNameAllowed } from '@/game/player';
import { renamePlayer } from '@/net/supabase';
import { toast } from '@/components/toast';
import { haptic } from '@/game/haptics';
import { lexiconCount, titleFor } from '@/game/lexicon';

const HEAT_DARK = ['#1b1a22', '#3d3557', '#8a72d6', '#B485FF'];
const HEAT_LIGHT = ['#E2DFEE', '#CFC4EC', '#A98FE8', '#8971FF'];

function sinceLine(firstDay: string | null): string {
  if (!firstDay) return 'new around here';
  const [y, m] = firstDay.split('-').map(Number);
  const mon = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  return `since ${mon} ’${String(y).slice(2)}`;
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const stats = useMemo(() => loadStats(), []);
  const [name, setName] = useState(getPlayerName());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const collected = useMemo(() => lexiconCount(), []);
  const openEdit = () => {
    setDraft(name);
    setEditing(true);
    haptic.soft();
  };
  const commitName = () => {
    setEditing(false);
    if (!isNameAllowed(draft)) {
      toast("that one won't fly on a public board", { title: 'pick another name', pal: 5 });
      haptic.bad();
      return;
    }
    const before = getPlayerName();
    const saved = setPlayerName(draft);
    setName(saved);
    if (saved !== before) {
      // usernames are UNIQUE (owner: one way to link a person) — the
      // server verdict decides the toast, and a taken name rolls back
      void renamePlayer(saved).then((verdict) => {
        if (verdict === 'taken') {
          setPlayerName(before);
          setName(before);
          toast('someone already owns that one', { title: 'name taken', pal: 5 });
          haptic.bad();
        } else {
          toast(`you're ${saved} now`, { title: 'name changed', pal: 2 });
          haptic.good();
        }
      });
    }
  };
  const avatarPal = PALETTE[tileColorFor(name[0]?.toLowerCase() ?? 'p', 0)];
  const grid = useMemo(() => historyGrid(stats), [stats]);
  const heat = theme.mode === 'dark' ? HEAT_DARK : HEAT_LIGHT;
  const cellS = Math.floor((Math.min(width, 480) - 36 - 8 * 6) / 2 / 4.6); // 9 cols fit

  // SHOWDOWN POINTS (audit: the 1v1 payoff had no persistent surface) —
  // cache-first via state; the fetch swaps in silently
  const [sdPts, setSdPts] = useState<number | null>(null);
  const [ledger, setLedger] = useState<PointEvent[]>([]);
  useEffect(() => {
    let live = true;
    void fetchMyShowdownPoints().then((v) => live && v != null && setSdPts(v));
    void fetchPointEvents().then((ev) => live && ev && setLedger(ev));
    return () => {
      live = false;
    };
  }, []);

  const cards = [
    { label: 'STREAK', value: streakDays(stats), dot: PALETTE[5], accent: '#F58A66' },
    { label: 'BEST SCORE', value: stats.best, dot: PALETTE[2], accent: CLUE_GREEN },
    { label: 'AVG SCORE', value: stats.games ? Math.round(stats.total / stats.games) : 0, dot: PALETTE[0] },
    { label: 'GAMES', value: stats.games, dot: PALETTE[1] },
    { label: 'POINTS ✦', value: sdPts ?? 0, dot: PALETTE[3] },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {/* the home screen's drifting candy tiles — every screen breathes (owner) */}
      <Floaters width={width} height={height} />
      <SafeAreaView style={styles.safe}>
        <ScreenBar theme={theme} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            theme={theme}
            eyebrow={`${titleFor(collected).toUpperCase()} · ${sinceLine(stats.firstDay).toUpperCase()}`}
            title="profile"
          />
          {/* THE IDENTITY ROW (owner): header just says profile; the real
              you lives BELOW the divider, bigger — block · name · edit */}
          <Pressable onPress={openEdit} style={styles.identityRow}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: avatarPal.bg,
                  boxShadow: `0 5px 0 ${avatarPal.edge}, inset 0 3px 0 rgba(255,255,255,0.42)`,
                },
              ]}>
              <Text style={styles.avatarLetter}>{name[0]}</Text>
            </View>
            <Text style={[styles.identityName, { color: theme.ink }]} numberOfLines={1}>
              {name.toLowerCase()}
            </Text>
            <View style={styles.pencilBtn}>
              <Icon name="pencil" size={16} color={theme.faint} />
            </View>
          </Pressable>

          {/* 2×2 stat cards */}
          <View style={styles.cards}>
            {cards.map((c) => (
              <View key={c.label} style={[styles.card, { backgroundColor: theme.card }]}>
                <View style={styles.cardHead}>
                  <View
                    style={[
                      styles.cardDot,
                      { backgroundColor: c.dot.bg, boxShadow: `0 1.5px 0 ${c.dot.edge}` },
                    ]}
                  />
                  <Text style={[styles.cardLabel, { color: theme.faint }]}>{c.label}</Text>
                </View>
                <Text style={[styles.cardValue, { color: c.accent ?? theme.ink }]}>
                  {c.value.toLocaleString()}
                </Text>
              </View>
            ))}
          </View>

          {/* THE LEDGER (owner: manage the currency) — every ✦ accounted */}
          {ledger.length > 0 && (
            <View style={styles.ledgerWrap}>
              <Text style={[styles.ledgerTitle, { color: theme.sub }]}>points ledger</Text>
              {ledger.map((e, i) => (
                <View key={`${e.ts}-${i}`} style={styles.ledgerRow}>
                  <Text style={[styles.ledgerReason, { color: theme.ink }]}>{e.reason}</Text>
                  <Text
                    style={[
                      styles.ledgerDelta,
                      { color: e.delta >= 0 ? '#5FD6A8' : theme.faint },
                    ]}>
                    {e.delta >= 0 ? '+' : ''}
                    {e.delta} ✦
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* YOUR BEST — the lifetime word in candy blocks + its pay */}
          <View style={styles.section}>
            <View style={styles.bestHead}>
              <View style={styles.bestHeadLeft}>
                <Text style={[styles.sectionLabel, { color: theme.faint }]}>YOUR BEST</Text>
                {stats.bestWord && (
                  <View style={[styles.payBadge, { backgroundColor: theme.card, borderColor: theme.hairline }]}>
                    <Text style={styles.payPts}>+{stats.bestWord.pts}</Text>
                  </View>
                )}
              </View>
              {/* the collection lives HERE now (owner: card removed) — the
                  count is the door into the word explorer */}
              <Pressable
                onPress={() => router.push('/words')}
                hitSlop={8}
                style={[styles.wordsChip, { backgroundColor: theme.card }]}>
                <Text style={[styles.wordsChipCount, { color: theme.ink }]}>
                  {collected.toLocaleString()}
                </Text>
                <Text style={[styles.wordsChipLabel, { color: theme.faint }]}>WORDS ›</Text>
              </Pressable>
            </View>
            {stats.bestWord ? (
              <View style={styles.bestRow}>
                {[...stats.bestWord.word].map((ch, i) => {
                  const pal = PALETTE[tileColorFor(ch, i)];
                  return (
                    <View
                      key={i}
                      style={[
                        styles.bestBlock,
                        {
                          backgroundColor: pal.bg,
                          boxShadow: `0 2px 0 ${pal.edge}, inset 0 1px 0 rgba(255,255,255,0.35)`,
                        },
                      ]}>
                      <Text style={styles.bestLetter}>{ch.toUpperCase()}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.emptyLine, { color: theme.sub }]}>
                your best word will live here
              </Text>
            )}
            {stats.topWords.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.pillRow}>
                  {stats.topWords.slice(1).map((w) => (
                    <View key={w.word} style={[styles.wordPill, { backgroundColor: theme.card }]}>
                      <Text style={[styles.pillWord, { color: theme.ink }]}>
                        {w.word.toUpperCase()}
                      </Text>
                      <Text style={styles.pillPts}>+{w.pts}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* 9-week heat grid */}
          <View style={styles.section}>
            <View style={styles.historyHead}>
              <Text style={[styles.sectionLabel, { color: theme.faint }]}>PLAY HISTORY</Text>
              <Text style={[styles.historySub, { color: theme.faint }]}>LAST 9 WEEKS</Text>
            </View>
            <View style={styles.grid}>
              {Array.from({ length: 9 }, (_, w) => (
                <View key={w} style={styles.gridCol}>
                  {Array.from({ length: 7 }, (_, d) => (
                    <View
                      key={d}
                      style={[
                        styles.gridCell,
                        { width: cellS, height: cellS, backgroundColor: heat[grid[w * 7 + d] ?? 0] },
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* NAME EDIT — pencil opens this (owner: modal, not an inline row) */}
      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={styles.modalScrim} onPress={() => setEditing(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card }]} onPress={() => {}}>
            <Text style={[styles.modalLabel, { color: theme.faint }]}>YOUR NAME</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={commitName}
              style={[styles.modalInput, { color: theme.ink, borderColor: theme.hairline }]}
            />
            <Text style={[styles.modalHint, { color: theme.faint }]}>
              2–10 letters or numbers · shows on standings
            </Text>
            <View style={styles.modalRow}>
              <Pressable
                onPress={() => setEditing(false)}
                style={[styles.modalBtn, { backgroundColor: theme.bg }]}>
                <Text style={[styles.modalBtnText, { color: theme.sub }]}>CANCEL</Text>
              </Pressable>
              <Pressable onPress={commitName} style={[styles.modalBtn, styles.modalSave]}>
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>SAVE</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  ledgerWrap: {
    alignSelf: 'stretch',
    gap: 7,
    marginTop: 6,
  },
  ledgerTitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    marginBottom: 2,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerReason: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
  },
  ledgerDelta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    alignSelf: 'stretch',
    paddingVertical: 4,
  },
  identityName: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    flexShrink: 1,
  },
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14, // IDENTICAL header position on every screen
    paddingBottom: 28,
    gap: 20,
  },
  // sized to the header's title line (36px) — the 46px block overflowed the
  // row and knocked the whole header out of whack (owner)
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 18,
    color: '#1F1442',
    includeFontPadding: false,
  },
  pencilBtn: {
    alignSelf: 'center',
    paddingBottom: 4, // optically centers against the title's baseline
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    borderRadius: 20, borderCurve: 'continuous',
    padding: 20,
    gap: 10,
  },
  modalLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 8.5,
    letterSpacing: 1.3,
  },
  modalInput: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 22,
    borderBottomWidth: 1.5,
    paddingVertical: 6,
    padding: 0,
  },
  modalHint: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalSave: {
    backgroundColor: '#8971FF',
  },
  modalBtnText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  wordsChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    borderRadius: 9, borderCurve: 'continuous',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  wordsChipCount: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  wordsChipLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 9,
    letterSpacing: 1,
  },
  bestHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 13,
    gap: 7,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardDot: {
    width: 9,
    height: 9,
    borderRadius: 3, borderCurve: 'continuous',
  },
  cardLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 8.5,
    letterSpacing: 1.3,
  },
  cardValue: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    fontVariant: ['tabular-nums'],
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 8.5,
    letterSpacing: 1.3,
  },
  bestHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  payBadge: {
    borderRadius: 8, borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  payPts: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    color: CLUE_GREEN,
  },
  bestRow: {
    flexDirection: 'row',
    gap: 4,
  },
  bestBlock: {
    width: 25,
    height: 25,
    borderRadius: 6,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestLetter: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    color: '#1F1442',
    includeFontPadding: false,
  },
  emptyLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 1,
  },
  wordPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    borderRadius: 8, borderCurve: 'continuous',
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  pillWord: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
  },
  pillPts: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
    color: CLUE_GREEN,
  },
  historyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historySub: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 9,
  },
  grid: {
    flexDirection: 'row',
    gap: 6,
  },
  gridCol: {
    gap: 6,
  },
  gridCell: {
    borderRadius: 5,
    borderCurve: 'continuous',
  },
});
