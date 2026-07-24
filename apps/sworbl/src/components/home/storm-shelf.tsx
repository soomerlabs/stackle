// THE STORM SHELF (owner ruling): four FRESH boards every day, each with
// its own persistent leaderboard — jump in, place, own the crown. Cards
// show the current holder and YOUR best; a board you haven't run yet is
// an invitation. Sits under the 'storms' section name with the SHOWDOWN
// rail (open 1v1 posts) behind it.
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';

import { PALETTE } from '@/game/palette';
import { dailyStormBoards } from '@/game/storm-seeds';
import { ACCENT, type Theme } from '@/game/theme';
import { fetchStormCrowns } from '@/net/duels';

type Crowns = Record<string, { top: { name: string; score: number } | null; mine: number | null }>;

// the warning flag, ALIVE (owner: "make hurricane pulse red haha") — a
// slow red breath on the glow, UI-thread only
function HurricaneFlag() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pulse = useAnimatedStyle(() => ({
    opacity: 0.35 + t.value * 0.65,
  }));
  return (
    <View style={styles.bigFlagWrap}>
      <Animated.View style={[styles.flagGlow, pulse]} />
      <View style={styles.bigFlag}>
        <View style={styles.bigFlagCenter} />
      </View>
    </View>
  );
}

export function StormShelf({ theme, refreshNonce }: { theme: Theme; refreshNonce?: number }) {
  const boards = useMemo(() => dailyStormBoards(), []);
  const [crowns, setCrowns] = useState<Crowns | null>(null);
  useEffect(() => {
    let live = true;
    fetchStormCrowns(boards.map((b) => b.seed)).then((c) => live && c && setCrowns(c));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.ink }]}>storms</Text>
        <Pressable
          onPress={() => router.push('/about-mode?mode=storms')}
          hitSlop={10}
          style={[styles.infoDot, { backgroundColor: theme.pill }]}>
          <Text style={[styles.infoDotText, { color: theme.sub }]}>i</Text>
        </Pressable>
      </View>
      <Text style={[styles.subtitle, { color: theme.faint }]}>pick your weather</Text>
      <View style={styles.scrollerWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}>
        {boards.map((b) => {
          const c = crowns?.[b.seed];
          const mins = Math.floor(b.intensity.clockSecs / 60);
          const secs = b.intensity.clockSecs % 60;
          return (
            <Pressable
              key={b.seed}
              onPress={() => router.push(`/lobby?seed=${b.seed}`)}
              style={[styles.block, { backgroundColor: theme.card }]}>
              {/* SPLIT CELL (owner): the weather OWNS the left half —
                  big emoji (the flag for hurricane, pulsing red); data
                  stacks on the right */}
              <View style={styles.iconZone}>
                {b.intensity.key === 'hurricane' ? (
                  <HurricaneFlag />
                ) : (
                  <Text style={styles.bigWeather}>{b.intensity.emoji}</Text>
                )}
              </View>
              <View style={styles.dataZone}>
                <Text style={[styles.name, { color: theme.ink }]} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={[styles.stat, { color: theme.sub }]} numberOfLines={1}>
                  {c?.top
                    ? `${c.top.score.toLocaleString()} · ${c.top.name.toLowerCase()}`
                    : 'no crown yet'}
                </Text>
                <Text style={[styles.meta, { color: c?.mine != null ? theme.faint : ACCENT }]}>
                  {mins}:{String(secs).padStart(2, '0')}
                  {c?.mine != null ? ` · best ${c.mine.toLocaleString()}` : ' · play ›'}
                </Text>
              </View>
            </Pressable>
          );
        })}

      </ScrollView>
      {/* the PEEK fade (owner: "hurricane is totally hidden") — cards
          scroll under a bg-colored gradient at the true screen edge */}
      <LinearGradient
        pointerEvents="none"
        colors={[`${theme.bg}00`, theme.bg]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.edgeFade}
      />
      {/* the LEFT fade (owner: "i hate hard lines") — scrolled-past cards
          dissolve at the leading edge too */}
      <LinearGradient
        pointerEvents="none"
        colors={[theme.bg, `${theme.bg}00`]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.edgeFadeLeft}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    gap: 4,
  },
  // rhymes with the masthead — the two section names wear the same type
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.3,
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
  subtitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  // bleeds to the TRUE screen edge (home pads 18) so hidden cards peek
  scrollerWrap: {
    marginRight: -18,
    marginLeft: -18, // both edges bleed — scrolled cards dissolve, never clip
  },
  rowContent: {
    gap: 10,
    paddingLeft: 18,
    paddingRight: 44, // the last card clears the fade fully when scrolled
    paddingBottom: 6,
    paddingTop: 2,
  },
  edgeFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 36,
  },
  edgeFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 22,
  },
  block: {
    width: 170,
    minHeight: 86,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingLeft: 8,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconZone: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigWeather: {
    fontSize: 34,
  },
  dataZone: {
    flex: 1,
    gap: 2,
  },
  bigFlagWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 12,
    boxShadow: '0 0 14px 3px #E5484D',
  },
  bigFlag: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: '#E5484D',
    boxShadow: 'inset 0 -4px 0 #8C2328',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigFlagCenter: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: '#17171C',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
  },
  // the maritime hurricane warning AS the logo: red square, black center
  name: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14.5,
  },
  stat: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
