// SETTINGS — designed in the handoff's family (card rows on the theme
// surface): player name, appearance (system/light/dark), haptics, about.
// DEV builds get the developer tools row (the old gear destination).
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Constants from 'expo-constants';

import { ScreenBar } from '@/components/screen-bar';
import { ScreenHeader } from '@/components/screen-header';
import { Floaters } from '@/components/home/floaters';
import { useTheme, useThemeMode, setThemeMode, ACCENT, type ThemeMode } from '@/game/theme';
import { hapticsEnabled, setHapticsEnabled, haptic } from '@/game/haptics';
import { deleteAccount } from '@/net/safety';
import { toast } from '@/components/toast';

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'system' },
  { key: 'light', label: 'light' },
  { key: 'dark', label: 'dark' },
];

export default function SettingsScreen() {
  const [armDelete, setArmDelete] = useState(false);
  const theme = useTheme();
  const dims = useWindowDimensions();
  const mode = useThemeMode();
  const [haptics, setHaptics] = useState(hapticsEnabled());

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {/* the home screen's drifting candy tiles — every screen breathes (owner) */}
      <Floaters width={dims.width} height={dims.height} />
      <SafeAreaView style={styles.safe}>
        <ScreenBar theme={theme} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader theme={theme} eyebrow="SWORBL" title="settings" />

          <Text style={[styles.sectionLabel, { color: theme.faint }]}>APPEARANCE</Text>
          <View style={[styles.row, { backgroundColor: theme.card }]}>
            <View style={styles.segments}>
              {MODES.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    setThemeMode(m.key);
                    haptic.soft();
                  }}
                  style={[
                    styles.segment,
                    mode === m.key && { backgroundColor: ACCENT },
                  ]}>
                  <Text
                    style={[
                      styles.segmentText,
                      { color: mode === m.key ? '#FFFFFF' : theme.sub },
                    ]}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: theme.faint }]}>FEEL</Text>
          <View style={[styles.row, { backgroundColor: theme.card }]}>
            <Text style={[styles.rowLabel, { color: theme.ink }]}>haptics</Text>
            <Switch
              value={haptics}
              onValueChange={(v) => {
                setHaptics(v);
                setHapticsEnabled(v);
                if (v) haptic.good(); // a taste of what you just turned on
              }}
              trackColor={{ true: ACCENT }}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: theme.faint }]}>ACCOUNT</Text>
          <Pressable
            onPress={async () => {
              // two-tap arm (the app's danger idiom — never an Alert)
              if (!armDelete) {
                setArmDelete(true);
                setTimeout(() => setArmDelete(false), 4000);
                return;
              }
              setArmDelete(false);
              const ok = await deleteAccount();
              toast(ok ? 'account deleted — fresh start on next launch' : 'delete failed — check your connection');
              if (ok) router.replace('/');
            }}
            style={[styles.row, armDelete ? styles.dangerArmed : { backgroundColor: theme.card }]}>
            <Text style={[styles.rowLabel, { color: armDelete ? '#FFFFFF' : '#E5484D' }]}>
              {armDelete ? 'tap again to delete EVERYTHING' : 'delete account'}
            </Text>
          </Pressable>
          <Text style={[styles.aboutSmall, { color: theme.faint }]}>
            removes your name, scores and standings from the server — no way back
          </Text>

          {__DEV__ && (
            <>
              <Text style={[styles.sectionLabel, { color: theme.faint }]}>DEVELOPER</Text>
              <Pressable
                onPress={() => router.push('/dev')}
                style={[styles.row, { backgroundColor: theme.card }]}>
                <Text style={[styles.rowLabel, { color: theme.ink }]}>dev tools</Text>
                <Text style={[styles.chev, { color: theme.faint }]}>›</Text>
              </Pressable>
            </>
          )}

          <Text style={[styles.about, { color: theme.faint }]}>
            sworbl {Constants.expoConfig?.version ?? ''} · made by soomer labs
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  dangerArmed: { backgroundColor: '#E5484D' },
  aboutSmall: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    marginTop: -4,
    marginLeft: 4,
  },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  rowLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14.5,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 7,
    alignItems: 'center',
  },
  segmentText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
  },
  chev: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 18,
  },
  about: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
  },
});
