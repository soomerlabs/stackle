// The SCORING HEADER (web: the progress-to-top bar) — your score on the left,
// a dashed track filling toward the crown's points-to-beat on the right.
// Target is a STUB until Supabase standings land (then: today's #1).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface Props {
  score: number;
  target: number;
  width: number; // the shared rail (boardW + 24)
}

export function ScoreHeader({ score, target, width }: Props) {
  const ratio = Math.min(1, target > 0 ? score / target : 0);
  const fillStyle = useAnimatedStyle(() => ({
    width: withTiming(`${ratio * 100}%`, { duration: 350 }),
  }));

  return (
    <View style={[styles.row, { width }]}>
      <Text style={styles.score}>{score.toLocaleString()}</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      <View style={styles.targetWrap}>
        <Text style={styles.crown}>♛</Text>
        <Text style={styles.target}>{target.toLocaleString()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 17,
    color: '#EDEFF7',
    fontVariant: ['tabular-nums'],
    minWidth: 40,
  },
  track: {
    flex: 1,
    height: 0,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#3A3A44',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: -1,
    height: 2,
    backgroundColor: '#8971FF',
    borderRadius: 1,
  },
  targetWrap: {
    alignItems: 'center',
  },
  crown: {
    fontSize: 13,
    color: '#8971FF',
    lineHeight: 14,
  },
  target: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    color: '#9DA2B3',
    fontVariant: ['tabular-nums'],
  },
});
