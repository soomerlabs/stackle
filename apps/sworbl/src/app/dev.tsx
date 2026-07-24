// DEV TOOLS — a real screen (owner: "make it way nicer"), themed like
// settings. Ports the web DEVELOPER panel where it makes sense off-board:
//   · TODAY: the day's full intel (sworb, archetype, clues, route, dict)
//   · PLAY A DAY: override the calendar to playtest any authored day
//   · LB FIELD: full/2/1/0 stub-field knob (web lbFieldDbg)
//   · ACTIONS: restart day, wipe all (two-tap arm, never an Alert)
// __DEV__ builds only (settings hides the entry otherwise).
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import engine from '@sworbl/engine';

import { ScreenBar } from '@/components/screen-bar';
import { ScreenHeader } from '@/components/screen-header';
import { useTheme, ACCENT, CLUE_GREEN } from '@/game/theme';
import { PALETTE } from '@/game/palette';
import { dealDaily, getDevDay, setDevDay, authoredDays } from '@/game/daily';
import { fetchRemoteEntry, loadRemoteEntry } from '@/net/dailies-remote';
import { getNetLog, clearNetLog } from '@/net/net-log';
import { supabase } from '@/net/supabase';
import { loadDay, resetDay, getResetNonce, bumpResetNonce } from '@/game/persist';
import { isFullDictionary, dict } from '@/game/dict';
import { getLbFieldMode, setLbFieldMode, type LbFieldMode } from '@/game/standings';
import {
  getClueAudit, setClueAudit, getCountInStall, setCountInStall,
  getDiagnostics, setDiagnostics, getShortRounds, setShortRounds,
} from '@/game/dev-flags';
import { ARCHETYPE_LABEL } from '@/components/game/result-view';
import { TUNING } from '@/game/tuning';
import { haptic } from '@/game/haptics';
import { toast } from '@/components/toast';

const LB_MODES: LbFieldMode[] = ['live', 'full', '2', '1', '0'];

// WALLET override (owner: "clear out points") — writes the player's own
// row directly (same RLS lane as the rename upsert). Dev-only shortcut;
// the real economy only ever moves through the edge functions.
async function setWalletTo(v: number, refresh: (m: string) => void) {
  const sb = supabase();
  if (!sb) {
    refresh('offline — no wallet to touch');
    return;
  }
  const uid = (await sb.auth.getSession()).data.session?.user.id;
  if (!uid) {
    refresh('no session — open home once first');
    return;
  }
  const { error } = await sb
    .from('players')
    .upsert({ id: uid, showdown_points: v }, { onConflict: 'id' });
  refresh(error ? `wallet: ${error.message}` : `wallet → ${v} ✦`);
}

// module-state reads during render are INVISIBLE to the React Compiler —
// it caches the JSX and the row never updates (owner: toggles stuck on
// 'off' while working). Render from a STATE snapshot instead.
function readFlags() {
  return {
    devDay: getDevDay(),
    lbMode: getLbFieldMode(),
    audit: getClueAudit(),
    diag: getDiagnostics(),
    short: getShortRounds(),
    stall: getCountInStall(),
  };
}

export default function DevScreen() {
  const theme = useTheme();
  const [stamp, setStamp] = useState(0); // bump → re-derive everything
  const [armWipe, setArmWipe] = useState(false);
  const [flags, setFlags] = useState(readFlags);

  const realDay = engine.core.dayKey(new Date());
  const devDay = flags.devDay;
  const deal = useMemo(() => dealDaily(), [stamp]);
  const day = useMemo(() => (deal ? loadDay(deal.dayKey) : null), [deal, stamp]);
  const days = useMemo(() => authoredDays(), []);
  const lbMode = flags.lbMode;

  const refresh = (note?: string) => {
    if (note) toast(note, { title: 'dev tools', pal: 4 });
    setFlags(readFlags()); // snapshot AFTER the write — the rows render this
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
      toast('tap again to wipe EVERYTHING', { title: 'dev tools', pal: 5 });
      return;
    }
    // the wipe also deletes the reset nonce — re-seed it ABOVE its pre-wipe
    // value so the mounted sheet still remounts (no zombie phases).
    // IDENTITY SURVIVES: the session's PRIMARY home is the iOS Keychain
    // now (survives wipes by nature) — these skips guard the FALLBACK
    // paths (web has no keychain; secure-store failures land in the
    // engine store) plus the username, which never goes to the keychain.
    // A wipe resets the GAME, never who you are.
    const n = getResetNonce();
    for (const k of engine.store.keys()) {
      if (k.includes('auth-token') || k === 'sworbl_rn_name') continue;
      engine.store.remove(k);
    }
    engine.store.setJSON('sworbl_rn_reset_nonce', n + 1);
    setDevDay(null); // the override is MEMORY-FIRST — a raw key delete leaves it live
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
          <ScreenHeader theme={theme} eyebrow="DEVELOPER" title="dev tools" />

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
            <Text style={[styles.actionText, { color: flags.audit ? CLUE_GREEN : theme.faint }]}>
              {flags.audit ? 'ON' : 'off'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setDiagnostics(!getDiagnostics());
              refresh(getDiagnostics() ? 'gold diagnostics ON (sheet/band/standings readouts)' : 'diagnostics off');
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>gold diagnostics</Text>
            <Text style={[styles.actionText, { color: flags.diag ? CLUE_GREEN : theme.faint }]}>
              {flags.diag ? 'ON' : 'off'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShortRounds(!getShortRounds());
              refresh(getShortRounds() ? 'SHORT ROUNDS — 20s clock (rearm to apply)' : 'normal rounds');
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>short rounds (20s)</Text>
            <Text style={[styles.actionText, { color: flags.short ? CLUE_GREEN : theme.faint }]}>
              {flags.short ? 'ON' : 'off'}
            </Text>
          </Pressable>
          <Text style={[styles.metaLine, { color: theme.faint }]}>
            tip: long-press the CLOCK on a live board → skip straight to the finale
          </Text>
          <Pressable
            onPress={() => router.push('/storm?seed=first-storm')}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>storm board (seed run)</Text>
            <Text style={[styles.actionText, { color: theme.faint }]}>first-storm ›</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              // THE PROOF LOOP (owner): burn local content → fetch the
              // server book → show the receipt → cache is warm again
              if (!deal) return;
              const dk = deal.dayKey;
              for (const k of engine.store.keys()) {
                if (k.startsWith('sworbl_rn_dayspec_')) engine.store.remove(k);
              }
              resetDay(dk);
              refresh('local words nuked — asking the server…');
              await fetchRemoteEntry(dk);
              const e = loadRemoteEntry(dk) as {
                sworb?: string; archetype?: string; themeWords?: string[]; hint?: string;
              } | null;
              refresh(
                e
                  ? `server book: ${e.sworb} · ${e.archetype} · ${e.themeWords?.length ?? 0} words${e.hint ? ' · hint ✓' : ''} — cached`
                  : 'no server row — bundled fallback in play'
              );
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>nuke words → refetch → prove</Text>
            <Text style={[styles.actionText, { color: '#F5B84A' }]}>server test</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const next = !getCountInStall();
              setCountInStall(next);
              refresh(next ? 'stall ON — JS blocks 900ms across GO (freeze repro)' : 'stall off');
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>stress: count-in stall</Text>
            <Text style={[styles.actionText, { color: flags.stall ? '#FF8A8E' : theme.faint }]}>
              {flags.stall ? 'ON' : 'off'}
            </Text>
          </Pressable>

          {/* ---- WALLET (owner: "clear out points" — test the velvet
              rope + the inline offer without going broke honestly) ---- */}
          <Text style={sectionLabel}>WALLET</Text>
          <Pressable
            onPress={() => void setWalletTo(0, refresh)}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>drain points → 0</Text>
            <Text style={[styles.actionText, { color: '#FF8A8E' }]}>broke test</Text>
          </Pressable>
          <Pressable
            onPress={() => void setWalletTo(100, refresh)}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>refill points → 100</Text>
            <Text style={[styles.actionText, { color: theme.faint }]}>fresh start</Text>
          </Pressable>

          {/* ---- NETWORK (owner: a log of the supabase calls) ---- */}
          <Text style={sectionLabel}>NETWORK · last {getNetLog().length} supabase calls</Text>
          {getNetLog().slice(0, 14).map((e, i) => (
            <View key={`${e.ts}-${i}`} style={styles.netRow}>
              <Text style={[styles.netTime, { color: theme.faint }]}>
                {new Date(e.ts).toLocaleTimeString('en-US', { hour12: false })}
              </Text>
              <Text style={[styles.netPath, { color: theme.ink }]} numberOfLines={1}>
                {e.method} {e.path.replace('/functions/v1', 'ƒ').replace('/rest/v1', 'r')}
              </Text>
              <Text
                style={[
                  styles.netStatus,
                  { color: e.status === 'ERR' || (typeof e.status === 'number' && e.status >= 400) ? '#FF8A8E' : CLUE_GREEN },
                ]}>
                {e.status} · {e.ms}ms
              </Text>
            </View>
          ))}
          {getNetLog().length === 0 && (
            <Text style={[styles.metaLine, { color: theme.faint }]}>
              no calls yet — pull to refresh home, then come back
            </Text>
          )}
          <Pressable
            onPress={() => {
              clearNetLog();
              refresh('network log cleared');
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>clear network log</Text>
          </Pressable>

          {/* ---- STORAGE ---- */}
          <Text style={sectionLabel}>STORAGE</Text>
          <Pressable
            onPress={() => {
              // live round-trip probe: write → read → remove → read → keys()
              const k = 'sworbl_rn_probe';
              const stamp = `probe-${Date.now()}`;
              engine.store.setJSON(k, stamp);
              const r1 = engine.store.getJSON(k, null);
              engine.store.remove(k);
              const r2 = engine.store.getJSON(k, null);
              const n = engine.store.keys().length;
              const ok = r1 === stamp && r2 === null;
              refresh(
                ok
                  ? `storage OK — round-trip ✓, ${n} keys, boot #${engine.store.getInt('sworbl_rn_boots', 0)}`
                  : `STORAGE BROKEN — wrote "${stamp}", read "${String(r1)}", after remove "${String(r2)}"`
              );
              if (!ok) haptic.bad();
            }}
            style={[styles.actionRow, { backgroundColor: theme.card }]}>
            <Text style={[styles.actionText, { color: theme.ink }]}>run storage probe</Text>
            <Text style={[styles.actionGlyph, { color: theme.faint }]}>⚗</Text>
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

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  netTime: { fontFamily: 'Fredoka_600SemiBold', fontSize: 10, fontVariant: ['tabular-nums'] },
  netPath: { fontFamily: 'Fredoka_600SemiBold', fontSize: 11, flex: 1 },
  netStatus: { fontFamily: 'Fredoka_600SemiBold', fontSize: 10, fontVariant: ['tabular-nums'] },
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 10,
  },
  sectionLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 8.5,
    letterSpacing: 1.3,
    marginTop: 8,
  },
  card: {
    borderRadius: 14, borderCurve: 'continuous',
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
    borderRadius: 6, borderCurve: 'continuous',
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
    borderRadius: 9, borderCurve: 'continuous',
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
    borderRadius: 10, borderCurve: 'continuous',
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
    borderRadius: 9, borderCurve: 'continuous',
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
    borderRadius: 14, borderCurve: 'continuous',
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
});
