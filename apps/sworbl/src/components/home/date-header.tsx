// DATE HEADER — home's instance of the shared ScreenHeader grammar. When
// the day is complete, the score docks at the title's right edge and IS the
// share button (owner: "right edge, put the score... we need a way to share").
import { router } from 'expo-router';
import React from 'react';
import { Text, Pressable, StyleSheet, View } from 'react-native';
import { ARCHETYPE_PAL } from '@/components/game/result-view';
import { PALETTE } from '@/game/palette';
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
  archetypeLabel?: string | null; // the day's archetype — masthead right tag
  archetype?: string | null; // the raw key — picks the tag's reasoned hue
}

export function DateHeader({ theme, dayKey, score, streak, onShare, onInfo, archetypeLabel, archetype }: Props) {
  const archPal = PALETTE[ARCHETYPE_PAL[archetype ?? ''] ?? 2];
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
          <Pressable onPress={onShare} hitSlop={10} style={styles.scoreTap}>
            <Text style={[styles.score, { color: theme.ink }]}>{score.toLocaleString()}</Text>
            <View style={styles.shareRow}>
              <Icon name="share" size={11} color={ACCENT} />
              <Text style={styles.shareText}>share</Text>
            </View>
          </Pressable>
        ) : onInfo ? (
          <Pressable onPress={onInfo} hitSlop={12} style={[styles.infoChip, { backgroundColor: theme.card }]}>
            <Icon name="info" size={14} color={ACCENT} />
          </Pressable>
        ) : undefined
      }
    />
      {/* THE MASTHEAD (owner: "under the divider under thursday") —
          brand-font "sworb" + italic "of the day" hangs off the hairline */}
      <View style={styles.masthead}>
        <View style={styles.mastheadLeft}>
          <Text style={[styles.mastheadBrand, { color: theme.ink }]}>sworb</Text>
          <Text style={[styles.mastheadItalic, { color: theme.sub }]}>of the day</Text>
        </View>
        {/* the ARCHETYPE tag (owner: right side, on-brand, with the i) —
            a candy chip naming the day's rule; tap = the archetype book */}
        {!!archetypeLabel && (
          <Pressable
            onPress={() => router.push('/archetypes')}
            hitSlop={8}
            style={[
              styles.archTag,
              { backgroundColor: archPal.bg, boxShadow: `inset 0 -2.5px 0 ${archPal.edge}` },
            ]}>
            <Text style={styles.archTagText}>{archetypeLabel}</Text>
            <View style={styles.archInfo}>
              <Text style={styles.archInfoText}>i</Text>
            </View>
          </Pressable>
        )}
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
    justifyContent: 'space-between',
  },
  mastheadLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  archTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10, borderCurve: 'continuous',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
  },
  archTagText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
    color: '#1F1442',
  },
  archInfo: {
    width: 15,
    height: 15,
    borderRadius: 5, borderCurve: 'continuous',
    backgroundColor: 'rgba(31,20,66,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  archInfoText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10,
    color: '#1F1442',
  },
  mastheadBrand: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  mastheadItalic: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  scoreTap: {
    alignItems: 'flex-end',
    gap: 1,
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 22,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  shareText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    color: ACCENT,
  },
  infoChip: {
    width: 30,
    height: 30,
    borderRadius: 10, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
