// SUPERLATIVES PAGER (handoff 6a/6b): completed-day recap — a crossfade
// pager between WHAT YOU GOT and WHAT GOT AWAY (no "superlatives" title;
// the page labels carry it). GOT: best word = indigo candy pill, caught
// clue words = green pills, other top words = flat pills. GOT AWAY: missed
// clue words = green-dashed pills (par-bot big words arrive with the
// server). The old hint-chips row is absorbed into this — clue intel lives
// here now. Swipe or tap the dots to flip.
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { type Theme, ACCENT, ACCENT_EDGE, CLUE_GREEN, CLUE_GREEN_EDGE } from '@/game/theme';
import { type BestWord } from '@/game/persist';

interface Props {
  theme: Theme;
  bestWords: BestWord[]; // top-5 by pts (persisted superlatives)
  foundClues: string[]; // clue words the player caught
  clues: string[]; // the full clue set for the day
}

function Pill({
  word, pts, kind, theme,
}: {
  word: string;
  pts?: number;
  kind: 'best' | 'clue' | 'flat' | 'missedClue';
  theme: Theme;
}) {
  const dashed = kind === 'missedClue';
  const box =
    kind === 'best'
      ? { backgroundColor: ACCENT, boxShadow: `0 3px 0 ${ACCENT_EDGE}, inset 0 1.5px 0 rgba(255,255,255,0.35)` }
      : kind === 'clue'
        ? { backgroundColor: CLUE_GREEN, boxShadow: `inset 0 -3px 0 ${CLUE_GREEN_EDGE}` }
        : dashed
          ? { borderWidth: 2, borderStyle: 'dashed' as const, borderColor: CLUE_GREEN }
          : { backgroundColor: theme.pill };
  const ink =
    kind === 'best' ? '#FFFFFF' : kind === 'clue' ? '#123D2C' : dashed ? '#3E9E77' : theme.sub;
  const ptsInk =
    kind === 'best'
      ? 'rgba(255,255,255,0.78)'
      : kind === 'clue'
        ? 'rgba(18,61,44,0.6)'
        : dashed
          ? '#8FC9B0'
          : theme.faint;
  return (
    <View style={[styles.pill, box]}>
      <Text style={[styles.pillWord, { color: ink }]}>{word}</Text>
      {pts != null && <Text style={[styles.pillPts, { color: ptsInk }]}>+{pts}</Text>}
    </View>
  );
}

export function SuperlativesPager({ theme, bestWords, foundClues, clues }: Props) {
  const [page, setPage] = useState(0);
  // BOTH pages stay mounted, absolutely stacked; the container holds the
  // TALLER page's measured height — cycling can never shift the layout
  // (owner). Crossfade is pure opacity.
  const [h, setH] = useState<[number, number]>([0, 0]);
  const onPageLayout = (i: 0 | 1) => (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setH((cur) => (Math.abs(cur[i] - next) < 1 ? cur : i === 0 ? [next, cur[1]] : [cur[0], next]));
  };
  const sPage = useSharedValue(0);
  useEffect(() => {
    sPage.value = withTiming(page, { duration: 220 });
  }, [page]);
  const gotStyle = useAnimatedStyle(() => ({ opacity: 1 - sPage.value }));
  const awayStyle = useAnimatedStyle(() => ({ opacity: sPage.value }));
  const flip = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .runOnJS(true)
    .onEnd((e) => {
      if (Math.abs(e.translationX) >= 30) setPage(e.translationX < 0 ? 1 : 0);
    });

  const best = bestWords[0];
  const clueSet = new Set(foundClues);
  const others = bestWords.slice(1).filter((w) => !clueSet.has(w.word));
  const ptsFor = (w: string) => bestWords.find((b) => b.word === w)?.pts;
  const missedClues = clues.filter((c) => !clueSet.has(c));

  return (
    <GestureDetector gesture={flip}>
      <View style={styles.wrap}>
        <View style={{ height: Math.max(h[0], h[1]) || undefined, minHeight: 60 }}>
          <Animated.View
            pointerEvents={page === 0 ? 'auto' : 'none'}
            onLayout={onPageLayout(0)}
            style={[styles.pageWrap, gotStyle]}>
            <Text style={[styles.label, { color: theme.faint }]}>WHAT YOU GOT</Text>
            <View style={styles.pills}>
              {best && <Pill theme={theme} word={best.word} pts={best.pts} kind="best" />}
              {foundClues.map((c) => (
                <Pill key={c} theme={theme} word={c} pts={ptsFor(c)} kind="clue" />
              ))}
              {others.map((w) => (
                <Pill key={w.word} theme={theme} word={w.word} pts={w.pts} kind="flat" />
              ))}
              {!best && foundClues.length === 0 && (
                <Text style={[styles.emptyLine, { color: theme.sub }]}>
                  nothing landed today
                </Text>
              )}
            </View>
          </Animated.View>
          <Animated.View
            pointerEvents={page === 1 ? 'auto' : 'none'}
            onLayout={onPageLayout(1)}
            style={[styles.pageWrap, awayStyle]}>
            <Text style={[styles.label, { color: theme.faint }]}>WHAT GOT AWAY</Text>
            <View style={styles.pills}>
              {missedClues.map((c) => (
                <Pill key={c} theme={theme} word={c} kind="missedClue" />
              ))}
              {missedClues.length === 0 && (
                <Text style={[styles.emptyLine, { color: theme.sub }]}>
                  you caught every clue ✦
                </Text>
              )}
            </View>
          </Animated.View>
        </View>
        <View style={styles.dots}>
          {[0, 1].map((i) => (
            <Pressable key={i} onPress={() => setPage(i)} hitSlop={8}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: i === page ? ACCENT : theme.dashed },
                ]}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    gap: 8,
  },
  pageWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    gap: 9,
  },
  label: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.3,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  pillWord: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
  },
  pillPts: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
  },
  emptyLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
