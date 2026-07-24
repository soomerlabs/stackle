// Post-finale reveal: the answer in candy (solved) or gray (missed), the
// definition card underneath, score + bonus. Owner rule: the ANSWER is only
// gray inside the failed reveal — home always shows candy.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { ZoomIn, FadeIn } from 'react-native-reanimated';
import { PALETTE, INK, tileColorFor } from '@/game/palette';

// content values → player-facing labels ("straight-category" is internal)
export const ARCHETYPE_LABEL: Record<string, string> = {
  'straight-category': 'category',
  connector: 'connector',
  sibling: 'sibling',
  lateral: 'lateral',
  wordplay: 'wordplay',
};

interface Props {
  word: string;
  definition: string;
  archetype?: string | null;
  solved: boolean;
  guessesUsed: number;
  score: number;
  bonus: number;
}

export function ResultView({ word, definition, archetype, solved, guessesUsed, score, bonus }: Props) {
  const bs = Math.min(56, Math.floor(300 / word.length));
  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.wrap}>
      <Text style={styles.verdict}>
        {solved ? `cracked in ${guessesUsed} of 6` : 'not this time'}
      </Text>
      <View style={styles.row}>
        {[...word].map((ch, i) => {
          const pal = solved ? PALETTE[tileColorFor(ch, i)] : null;
          return (
            <Animated.View
              key={i}
              entering={ZoomIn.delay(120 + i * 90).springify().mass(0.6)}
              style={[
                styles.block,
                { width: bs, height: bs * 1.14, borderRadius: Math.round(bs * 0.25), borderCurve: 'continuous' },
                pal
                  ? { backgroundColor: pal.bg, boxShadow: `0 3px 0 ${pal.edge}` }
                  : styles.grayBlock,
              ]}>
              <Text
                style={[
                  styles.blockText,
                  { fontSize: Math.round(bs * 0.52), color: pal ? INK : '#8A8A96' },
                ]}>
                {ch.toUpperCase()}
              </Text>
            </Animated.View>
          );
        })}
      </View>
      {!!definition && (
        <Animated.View entering={FadeIn.delay(700)} style={styles.defCard}>
          <Text style={styles.defText}>{definition}</Text>
        </Animated.View>
      )}
      {!!archetype && ARCHETYPE_LABEL[archetype] && (
        <Animated.View entering={FadeIn.delay(800)} style={styles.twistPill}>
          <Text style={styles.twistText}>archetype: {ARCHETYPE_LABEL[archetype]}</Text>
        </Animated.View>
      )}
      <Animated.View entering={FadeIn.delay(900)} style={styles.scoreRow}>
        <Text style={styles.score}>{score.toLocaleString()}</Text>
        {bonus > 0 && <Text style={styles.bonus}>+{bonus.toLocaleString()} sworb bonus</Text>}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  verdict: { fontFamily: 'Fredoka_600SemiBold', fontSize: 16, color: '#9DA2B3' },
  row: { flexDirection: 'row', gap: 6 },
  block: { alignItems: 'center', justifyContent: 'center' },
  grayBlock: { backgroundColor: '#3A3A44', boxShadow: '0 3px 0 #26262E' },
  blockText: { fontFamily: 'Fredoka_600SemiBold', includeFontPadding: false },
  twistPill: {
    borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(137,113,255,0.14)',
  },
  twistText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#8971FF',
  },
  defCard: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderRadius: 14, borderCurve: 'continuous',
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: 340,
  },
  defText: {
    fontFamily: 'Fredoka_500Medium',
    fontSize: 14,
    color: '#C9CCDA',
    textAlign: 'center',
    lineHeight: 20,
  },
  scoreRow: { alignItems: 'center', gap: 2 },
  score: { fontFamily: 'Fredoka_600SemiBold', fontSize: 42, color: '#8971FF' },
  bonus: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14, color: '#F5B84A' },
});
