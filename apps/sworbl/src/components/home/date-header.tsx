// DATE HEADER — home's instance of the shared ScreenHeader grammar. When
// the day is complete, the score docks at the title's right edge and IS the
// share button (owner: "right edge, put the score... we need a way to share").
import { router } from 'expo-router';
import React from 'react';
import { Text, Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { type Theme, ACCENT } from '@/game/theme';
import { puzzleNo } from '@/game/share';

interface Props {
  theme: Theme;
  dayKey: string;
  score?: number | null; // completed day → docks right of the title
  streak?: number; // 🔥 in the eyebrow when ≥2
  onShare?: () => void;
  onInfo?: () => void; // pre-play: the ⓘ lives where the score will
}

export function DateHeader({ theme, dayKey, score, streak, onShare, onInfo }: Props) {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const monthDay = now
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    .toLowerCase();
  return (
    <View style={styles.headWrap}>
    <ScreenHeader
      theme={theme}
      eyebrow={`Nº ${puzzleNo(dayKey)}${streak && streak >= 2 ? `  ·  🔥 ${streak}` : ''}`}
      title={weekday}
      titleAccent={monthDay}
      right={
        score != null ? (
          // TITLE-SIZED score + the icon says it all (owner)
          <View style={styles.scoreRow}>
            <Text style={[styles.score, { color: theme.ink }]}>{score.toLocaleString()}</Text>
            <Pressable onPress={onShare} hitSlop={12} style={[styles.shareBtn, { backgroundColor: theme.pill }]}>
              <Icon name="share" size={15} color={ACCENT} />
            </Pressable>
          </View>
        ) : onInfo ? (
          <Pressable onPress={onInfo} hitSlop={12} style={[styles.infoChip, { backgroundColor: theme.card }]}>
            <Icon name="info" size={14} color={ACCENT} />
          </Pressable>
        ) : undefined
      }
    />
      {/* THE MASTHEAD (owner: "under the divider under thursday") —
          brand-font "sworb" + italic "of the day" hangs off the hairline.
          One row, everything on a shared center line (owner: "all
          centered vertically" — the header score is the ONLY tally). */}
      <View style={styles.masthead}>
        <Text style={[styles.mastheadBrand, { color: theme.ink }]}>sworb</Text>
        <Text style={[styles.mastheadItalic, { color: theme.sub }]}>of the day</Text>
        <Pressable
          onPress={() => router.push('/about-mode?mode=daily')}
          hitSlop={10}
          style={[styles.infoDot, { backgroundColor: theme.pill }]}>
          <Text style={[styles.infoDotText, { color: theme.sub }]}>i</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headWrap: {
    alignSelf: 'stretch',
    gap: 10,
  },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  mastheadBrand: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.3,
    includeFontPadding: false, // shared center line with the italic + dot
  },
  mastheadItalic: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    fontStyle: 'italic',
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 31, // the header title's size (owner)
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  shareBtn: {
    width: 30,
    height: 30,
    borderRadius: 10, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoChip: {
    width: 30,
    height: 30,
    borderRadius: 10, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
