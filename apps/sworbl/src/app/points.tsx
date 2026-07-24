// THE WALLET (owner: "a points screen where we can mock 'pay for more'")
// — balance up top, three candy packs with mock $ stickers, the ledger
// underneath. No real money moves in the proof phase; every tapped pack
// leaves a "top-up (mock)" trail, which IS the experiment.
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PALETTE } from '@/game/palette';
import { useTheme } from '@/game/theme';
import {
  buyPack, fetchMyShowdownPoints, fetchPointEvents, type PointEvent,
} from '@/net/duels';

const PACKS = [
  { key: 'splash' as const, points: 100, sticker: '$0.99', pal: 2 },
  { key: 'surge' as const, points: 300, sticker: '$1.99', pal: 0 },
  { key: 'deluge' as const, points: 800, sticker: '$4.99', pal: 4 },
];

export default function PointsScreen() {
  const theme = useTheme();
  const [balance, setBalance] = useState<number | null>(null);
  const [events, setEvents] = useState<PointEvent[] | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const buyingRef = useRef(false);
  const refresh = () => {
    void fetchMyShowdownPoints().then((v) => v != null && setBalance(v));
    void fetchPointEvents(8).then((e) => e && setEvents(e));
  };
  useEffect(refresh, []);

  const buy = async (pack: (typeof PACKS)[number]) => {
    if (buyingRef.current) return;
    buyingRef.current = true;
    setBuying(pack.key);
    // one receipt per pack per minute-bucket — a retry inside the window
    // can never double-grant (same law as every purchase)
    const ref = `topup-${pack.key}-${Math.floor(Date.now() / 60000)}`;
    const r = await buyPack(pack.key, ref);
    buyingRef.current = false;
    setBuying(null);
    if (r !== 'error') {
      setBalance(r.balance);
      setBought(pack.key);
      setTimeout(() => setBought(null), 1800);
      void fetchPointEvents(8).then((e) => e && setEvents(e));
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView edges={['bottom']}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.ink }]}>points</Text>
          <View style={styles.balanceRow}>
            <Text style={[styles.balance, { color: theme.ink }]}>
              ✦ {balance != null ? balance.toLocaleString() : '—'}
            </Text>
            <Text style={[styles.balanceMeta, { color: theme.faint }]}>
              fake money · real bragging
            </Text>
          </View>

          {/* the mock packs — stickers wear PRICES, taps just grant */}
          <View style={styles.packRow}>
            {PACKS.map((p) => {
              const pal = PALETTE[p.pal];
              const busy = buying === p.key;
              const done = bought === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => buy(p)}
                  disabled={buying != null}
                  style={[styles.pack, { backgroundColor: pal.bg, boxShadow: `inset 0 -4px 0 ${pal.edge}` }]}>
                  <Text style={styles.packPoints}>+{p.points}</Text>
                  <Text style={styles.packName}>{p.key}</Text>
                  <View style={styles.sticker}>
                    <Text style={styles.stickerText}>
                      {busy ? '…' : done ? 'yours ✦' : p.sticker}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.mockNote, { color: theme.faint }]}>
            nothing is charged — this is the dress rehearsal
          </Text>

          {/* the ledger — where every ✦ came from and went */}
          <View style={styles.ledger}>
            {events == null && (
              <Text style={[styles.ledgerEmpty, { color: theme.faint }]}>checking the books…</Text>
            )}
            {events != null && events.length === 0 && (
              <Text style={[styles.ledgerEmpty, { color: theme.faint }]}>
                no moves yet — the daily refuel starts the story
              </Text>
            )}
            {events != null &&
              events.map((e, i) => (
                <View key={`${e.ts}-${i}`} style={styles.ledgerRow}>
                  <Text style={[styles.ledgerReason, { color: theme.sub }]} numberOfLines={1}>
                    {e.reason}
                  </Text>
                  <Text
                    style={[
                      styles.ledgerDelta,
                      { color: e.delta > 0 ? '#5FD6A8' : theme.faint },
                    ]}>
                    {e.delta > 0 ? `+${e.delta}` : e.delta}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    gap: 14,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 21,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  balance: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 34,
    fontVariant: ['tabular-nums'],
  },
  balanceMeta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    fontStyle: 'italic',
  },
  packRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pack: {
    flex: 1,
    borderRadius: 16, borderCurve: 'continuous',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  packPoints: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 20,
    color: '#1F1442',
    includeFontPadding: false,
  },
  packName: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.4,
    color: '#1F1442',
    opacity: 0.75,
  },
  sticker: {
    marginTop: 6,
    borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: 'rgba(31,20,66,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  stickerText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  mockNote: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  ledger: {
    gap: 7,
    paddingTop: 4,
  },
  ledgerEmpty: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ledgerReason: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    flex: 1,
  },
  ledgerDelta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});
