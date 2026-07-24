// ABOUT A MODE (owner: info icons next to sworb of the day / storms /
// showdowns) — one content-height sheet, three faces. Plain words.
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { useTheme } from '@/game/theme';

const FACES: Record<string, { title: string; lines: string[] }> = {
  daily: {
    title: 'sworb of the day',
    lines: [
      'one word hides behind six clues. spell words on the board to catch them — every clue is intel.',
      'play 3-minute rounds all day. clues stack up across rounds; only your BEST round counts. no grinding.',
      'guess the word whenever you want — 6 tries for the whole day. the fewer clues and rounds you’ve used, the bigger the bonus. bravery pays.',
    ],
  },
  storms: {
    title: 'storms',
    lines: [
      'four fresh boards every day — diphthong drizzle, synonym squall, thesaurus thunder, homonym hurricane. same board for every player.',
      'harder as you climb: less time, harsher letters, and a steeper door — the drizzle is always free.',
      'best score holds the crown. boards reset daily; bragging rights don’t. private rooms let you set your own board and pot.',
    ],
  },
  showdowns: {
    title: 'showdowns',
    lines: [
      'mano a mano. post a score on a board and it becomes an open challenge on everyone’s home.',
      'take someone’s and you race their recorded run — unless they sealed their hand. then you play blind and find out after.',
      'both sides ante the poster’s stake; winner takes the whole pot. one open showdown at a time.',
    ],
  },
};

export default function AboutModeScreen() {
  const theme = useTheme();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const face = FACES[mode ?? ''] ?? FACES.daily;
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView edges={['bottom']}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.ink }]}>{face.title}</Text>
          {face.lines.map((l, i) => (
            <Text key={i} style={[styles.line, { color: theme.sub }]}>
              {l}
            </Text>
          ))}
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
    paddingBottom: 16,
    gap: 12,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 21,
  },
  line: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
    lineHeight: 20,
  },
});
