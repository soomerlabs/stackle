// The play screen — Phase 2 increment 1: engine-dealt daily board, tier-2
// trace, clue fan, storm. (Timer, finale, hint aids: next increments.)
import React, { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { GameBoard } from '@/components/game/game-board';
import Storm from '@/components/game/storm';
import { BG_DARK } from '@/game/palette';

export default function PlayScreen() {
  const { width, height } = useWindowDimensions();
  const [score, setScore] = useState(0);

  // 5 cells + 4 gaps inside width-32; gap = 16% of tile (the web board's ratio)
  const tile = Math.min(64, Math.floor((Math.min(width, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Storm width={width} height={Math.min(280, height * 0.32)} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <Text style={styles.brand}>sworbl</Text>
          <Text style={styles.score}>{score.toLocaleString()}</Text>
        </View>
        <View style={styles.center}>
          <GameBoard size={tile} gap={gap} onScore={setScore} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  safe: {
    flex: 1,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  brand: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#A78BFA',
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#EDEFF7',
    fontVariant: ['tabular-nums'],
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
