// DEV TOOLS — a real screen (owner: "make it way nicer"), themed like
// settings. Ports the web DEVELOPER panel where it makes sense off-board:
//   · TODAY: the day's full intel (sworb, archetype, clues, route, dict)
//   · PLAY A DAY: override the calendar to playtest any authored day
//   · LB FIELD: full/2/1/0 stub-field knob (web lbFieldDbg)
//   · ACTIONS: restart day, wipe all (two-tap arm, never an Alert)
// __DEV__ builds only (settings hides the entry otherwise).
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import engine from '@sworbl/engine';

import { ScreenBar } from '@/components/screen-bar';
import { useTheme, ACCENT, CLUE_GREEN } from '@/game/theme';
import { PALETTE } from '@/game/palette';
import { dealDaily, getDevDay, setDevDay, authoredDays } from '@/game/daily';
import { loadDay, resetDay, getResetNonce, bumpResetNonce } from '@/game/persist';
import { isFullDictionary, dict } from '@/game/dict';
import { getLbFieldMode, setLbFieldMode, type LbFieldMode } from '@/game/standings';
import { getClueAudit, setClueAudit, getCountInStall, setCountInStall } from '@/game/dev-flags';
import { ARCHETYPE_LABEL } from '@/components/game/result-view';
import { TUNING } from '@/game/tuning';
import { haptic } from '@/game/haptics';

const LB_MODES: LbFieldMode[] = ['full', '2', '1', '0'];

export default function DevScreen() {
  const theme = useTheme();
  const [stamp, setStamp] = useState(0); // bump → re-derive everything
  const [armWipe, setArmWipe] = useState(false);
  const [msg, setMsg] = useState('');

  const realDay = engine.core.dayKey(new Date());
  const devDay = getDevDay();
  const deal = useMemo(() => dealDaily(), [stamp]);
  const day = useMemo(() => (deal ? loadDay(deal.dayKey) : null), [deal, stamp]);
  const days = useMemo(() => authoredDays(), []);
  const lbMode = getLbFieldMode();

  const refresh = (note?: string) => {
    if (note) setMsg(note);
    setStamp((s) => s + 1);
  };

  const restartToday = () => {
    if (!deal) return;
    resetDay(deal.dayKey);
    refresh(`${deal.dayKey} wiped — fresh contest`);
    haptic.good();
  };

  const wipeAll = () => {
    if (!armWipe) {
      setArmWipe(true);
      setMsg('tap again to wipe EVERYTHING');
      return;
    }
    // the wipe also deletes the reset nonce — re-seed it ABOVE its pre-wipe
    // value so the mounted sheet still remounts (no zombie phases)
    const n = getResetNonce();
    for (const k of engine.store.keys()) engine.store.remove(k);
    engine.store.setJSON('sworbl_rn_reset_nonce', n + 1);
    setArmWipe(false);
    refresh('all storage wiped');
    haptic.bad();
  };

  const sectionLabel = [styles.sectionLabel, { color: theme.faint }];

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe}>
        <ScreenBar theme={theme} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.ink }]}>dev tools</Text>

          {/* ---- TODAY ---- */}
          <Text style={sectionLabel}>TODAY</Text>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={styles.kvRow}>
              <Text style={[styles.kvKey, { color: theme.sub }]}>day</Text>
              <View style={styles.kvRight}>
                <Text style={[styles.kvVal, { color: theme.ink }]}>{deal?.dayKey ?? '—'}</Text>
                {devDay && (
                  <View style={styles.overrideBadge}>
                    <Text style={styles.overrideText}>OVERRIDE</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.kvRow}>
              <Text style={[styles.kvKey, { color: theme.sub }]}>sworb</Text>
              <Text style={[styles.kvVal, { color: ACCENT }]}>{deal?.sworb.toUpperCase() ?? 'none'}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={[styles.kvKey, { color: theme.sub }]}>archetype</Text>
              <Text
                style={[
                  styles.kvVal,
                  { color: deal?.archetype ? '#F5B84A' : theme.faint },
                ]}>
                {deal?.archetype
                  ? (ARCHETYPE_LABEL[deal.archetype] ?? deal.archetype)
                  : 'untagged (pre-archetype day)'}
              </Text>
            </View>
            {!!deal?.definition && (
              <Text style={[styles.defLine, { color: theme.sub }]}>“{deal.definition}”</Text>
            )}
            {deal && (
              <View style={styles.chipWrap}>
                {deal.clues.map((c, i) => {
                  const pal = PALETTE[i % PALETTE.length];
                  const caught = day?.found.includes(c);
                  return (
                    <View
                      key={c}
                      style={[
                        styles.clueChip,
                        caught
                          ? { backgroundColor: pal.bg, boxShadow: `0 2px 0 ${pal.edge}` }
                          : { borderWidth: 2, borderStyle: 'dashed', borderColor: theme.dashed },
                      ]}>
                      <Text style={[styles.clueText, { color: caught ? '#1F1442' : theme.sub }]}>
                        {c.toUpperCase()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={[styles.hairline, { backgroundColor: theme.hairline }]} />
            <Text style={[styles.metaLine, { color: theme.faint }]}>
              route {day?.route ?? '—'} · score {(day?.score ?? 0).toLocaleString()} · fuel{' '}
              {TUNING.BASE_SECS}s→{TUNING.CAP_SECS}s · dict{' '}
              {isFullDictionary()
                ? `full ${dict().size.toLocaleString()}`
                : `starter ${dict().size.toLocaleString()}`}
            </Text>
          </View>

          {/* ---- PLAY A DAY ---- */}
          <Text style={sectionLabel}>PLAY A DAY</Text>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={styles.chipWrap}>
              {days.map((d) => {
                const active = (devDay ?? realDay) === d.day;
                const isReal = d.day === realDay;
                return (
                  <Pressable
                    key={d.day}
                    onPress={() => {
                      setDevDay(d.day === realDay ? null : d.day);
                      refresh(`dealing ${d.day} (${d.sworb})`);
                      haptic.soft();
                    }}
                    style={[
                      styles.dayChip,
                      { borderColor: theme.hairline },
                      active && { backgroundColor: ACCENT, borderColor: ACCENT },
                    ]}>
                    <Text style={[styles.dayChipDate, { color: active ? '#fff' : theme.ink }]}>
                      {d.day.slice(5)}
                      {isReal ? ' •' : ''}
                    </Text>
                    <Text
                      style={[
                        styles.dayChipMeta,
                        { color: active ? 'rgba(255,255,255,0.8)' : theme.faint },
                      ]}>
                      {d.sworb}
                      {d.archetype ? ` · ${ARCHETYPE_LABEL[d.archetype] ?? d.archetype}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {devDay && (
              <Pressable
                onPress={() => {
                  setDevDay(null);
                  refresh('override cleared — back to the calendar');
                }}
                style={styles.clearBtn}>
                <Text style={styles.clearText}>clear override · back to today</Text>
              </Pressable>
            )}
          </View>

          {/* ---- LB FIELD ---- */}
          <Text style={sectionLabel}>STANDINGS FIELD</Text>
          <View style={[styles.card, styles.segCard, { backgroundColor: theme.card }]}>
            {LB_MODES.map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setLbFieldMode(m);
                  refresh(`standings field: ${m.toUpperCase()}`);
                }}
                style={[styles.segment, lbMode === m && { backgroundColor: ACCENT }]}>
                <Text style={[styles.segmentText, { color: lbMode === m ? '#fff' : theme.sub }]}>
                  {m.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ---- CLUE AUDIT ---- */}
          <Text style={sectionLabel}>BOARD AUDIT</Text>
          <Pressable
            onPress={() => {
              setClueAudit(!getClueAudit());
              // re-read AFTER the write — the toast reports what storage
              // actually holds (owner: toggle said off despite ON toasts)
              const now = getClueAudit();
              refresh(now ? 'clue audit ON — chips under the board' : 'clue audit off');
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>
              clue audit overlay
            </Text>
            <Text style={[styles.actionText, { color: getClueAudit() ? CLUE_GREEN : theme.faint }]}>
              {getClueAudit() ? 'ON' : 'off'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              const next = !getCountInStall();
              setCountInStall(next);
              refresh(next ? 'stall ON — JS blocks 900ms across GO (freeze repro)' : 'stall off');
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>stress: count-in stall</Text>
            <Text style={[styles.actionText, { color: getCountInStall() ? '#FF8A8E' : theme.faint }]}>
              {getCountInStall() ? 'ON' : 'off'}
            </Text>
          </Pressable>

          {/* ---- ACTIONS ---- */}
          <Text style={sectionLabel}>ACTIONS</Text>
          <Pressable onPress={restartToday} style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>
              restart {deal?.dayKey ?? 'today'}
            </Text>
            <Text style={[styles.actionGlyph, { color: theme.faint }]}>↺</Text>
          </Pressable>
          <Pressable
            onPress={wipeAll}
            style={[styles.actionRow, armWipe ? styles.dangerArmed : styles.danger]}>
            <Text style={[styles.actionText, { color: '#fff' }]}>
              {armWipe ? 'CONFIRM: wipe all data' : 'wipe ALL data'}
            </Text>
            <Text style={[styles.actionGlyph, { color: 'rgba(255,255,255,0.7)' }]}>⌫</Text>
          </Pressable>

          {!!msg && <Text style={[styles.msg, { color: CLUE_GREEN }]}>{msg}</Text>}
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
    paddingBottom: 28,
    gap: 10,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    marginBottom: 6,
  },
  sectionLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 8.5,
    letterSpacing: 1.3,
    marginTop: 8,
  },
  card: {
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kvRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kvKey: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
  },
  kvVal: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  overrideBadge: {
    backgroundColor: '#F5B84A',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overrideText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 8.5,
    letterSpacing: 1,
    color: '#1F1442',
  },
  defLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontStyle: 'italic',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  clueChip: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clueText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  hairline: {
    height: 1.5,
    alignSelf: 'stretch',
  },
  metaLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.4,
  },
  dayChip: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    gap: 1,
  },
  dayChipDate: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  dayChipMeta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 9,
  },
  clearBtn: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  clearText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    color: ACCENT,
  },
  segCard: {
    flexDirection: 'row',
    gap: 6,
    padding: 8,
  },
  segment: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  danger: {
    backgroundColor: '#6E4046',
  },
  dangerArmed: {
    backgroundColor: '#B3373F',
  },
  actionText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
  },
  actionGlyph: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
  },
  msg: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 8,
  },
});
