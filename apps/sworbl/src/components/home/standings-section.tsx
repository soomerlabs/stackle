// HOME's STANDINGS section — head (title + the ONE tappable chart button,
// owner: "just that button haha"), the floating podium, and the list /
// empty-field line, wrapped in the data-arrival fade. Extracted from home
// (the index god-file split); pure display.
import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';

import { Arrive } from '@/components/arrive';
import { FloatingPodium } from '@/components/home/floating-podium';
import { StandingsList, type StandingRow } from '@/components/home/standings-list';
import { type LbEntry } from '@/game/standings';
import { type Theme } from '@/game/theme';

interface Props {
  theme: Theme;
  entries: LbEntry[];
  standings: { podium: LbEntry[]; list: StandingRow[]; youOutside: StandingRow | null };
  hasYou: boolean; // you (or your remote row) present in the field
  devCount: boolean; // gold diagnostics: show field size in the title
}

export function StandingsSection({ theme, entries, standings, hasYou, devCount }: Props) {
  return (
    <View style={styles.standingsWrap}>
      <View style={styles.standingsHead}>
        <Text style={[styles.standingsTitle, { color: theme.sub }]}>
          standings
          {devCount ? `  ·  ${entries.length} in field` : ''}
        </Text>
        <Pressable
          onPress={() => router.push('/leaderboard')}
          hitSlop={10}
          style={[styles.chartBtn, { backgroundColor: theme.card }]}>
          {Platform.OS === 'ios' ? (
            <SymbolView name={'chart.line.uptrend.xyaxis' as never} size={16} tintColor="#8971FF" />
          ) : (
            <Text style={styles.chartGlyph}>↗</Text>
          )}
        </Pressable>
      </View>
      <Arrive ready={entries.length > 0} style={styles.arriveWrap}>
        <FloatingPodium
          theme={theme}
          entries={standings.podium}
          you={null}
          showTitle={false}
          showFoot={false}
        />
        {standings.podium.length === 0 ? (
          // TRULY EMPTY field (audit): the ghost podium already says it —
          // piling dashed rows + a ghost-you underneath tripled the message
          // and walled the screen in wireframe
          <Text style={[styles.fieldAwait, { color: theme.faint }]}>
            first scores land here today
          </Text>
        ) : (
          <StandingsList
            theme={theme}
            rows={standings.list}
            youOutside={standings.youOutside}
            // the dashed seat only when you're truly ABSENT from the field —
            // a podium #1 doesn't need a placeholder chair (owner)
            ghost={!hasYou}
            emptyRows={entries.length <= 3 && entries.length > 0 ? 3 : 0}
          />
        )}
      </Arrive>
    </View>
  );
}

const styles = StyleSheet.create({
  standingsWrap: {
    alignSelf: 'stretch',
    gap: 12,
  },
  arriveWrap: {
    alignSelf: 'stretch',
    gap: 12, // same rhythm as standingsWrap — the wrapper is invisible
  },
  standingsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  standingsTitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
  },
  chartBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartGlyph: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#8971FF',
  },
  fieldAwait: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 6,
  },
});
