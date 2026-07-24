// THE HERO CARD (owner: "do the A and B compose") — the daily IS home's
// one dominant object: a single card that carries the masthead, the
// hero word (the guess door), the day's contract, the standings glance,
// and the PLAY/GUESS buttons docked INSIDE it. Below this card, every
// mode is one card in the same grammar — home stops being a menu.
import { router } from 'expo-router';
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { ArchetypeBadge } from '@/components/home/archetype-badge';
import { CountdownDock } from '@/components/home/countdown-dock';
import { HeroWord } from '@/components/home/hero-word';
import { StandingsStrip } from '@/components/home/standings-strip';
import { gameSurface } from '@/game/palette';
import { ACCENT, ACCENT_EDGE, type Theme } from '@/game/theme';

interface Props {
  theme: Theme;
  deal: { dayKey: string; sworb: string; archetype?: string | null } | null;
  played: boolean;
  solved: boolean;
  sworbPending: boolean;
  width: number; // the card's INNER width (home hands it down)
  podium: React.ComponentProps<typeof StandingsStrip>['podium'];
  you: React.ComponentProps<typeof StandingsStrip>['you'];
  onPlay: () => void;
  onGuess?: () => void;
}

export function HeroCard({
  theme, deal, played, solved, sworbPending, width, podium, you, onPlay, onGuess,
}: Props) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      {/* the masthead lives ON the card now — the card IS the daily */}
      <View style={styles.mastheadRow}>
        <Text style={[styles.mastheadBrand, { color: theme.ink }]}>sworb</Text>
        <Text style={[styles.mastheadItalic, { color: theme.sub }]}>of the day</Text>
        <Pressable
          onPress={() => router.push('/about-mode?mode=daily')}
          hitSlop={10}
          style={[styles.infoDot, { backgroundColor: theme.pill }]}>
          <Text style={[styles.infoDotText, { color: theme.sub }]}>i</Text>
        </Pressable>
        <View style={styles.mastheadSpring} />
        {deal && <ArchetypeBadge theme={theme} archetype={deal.archetype} />}
      </View>

      {/* the word — tap anywhere to play; the guess door nests inside */}
      <Pressable onPress={!played ? onPlay : undefined} disabled={played}>
        <HeroWord
          theme={theme}
          deal={deal}
          played={played || solved}
          solved={solved}
          width={width}
          onGuess={onGuess}
        />
      </Pressable>

      {/* one glance of the field, ON the card — the strip IS the door
          to the full board (owner: no separate leaderboard button) */}
      <Pressable onPress={() => router.push('/leaderboard')} hitSlop={4}>
        <StandingsStrip theme={theme} podium={podium} you={you} />
      </Pressable>

      {/* a DONE day: the countdown moves onto the card (the dock's old
          job — the peek band died with the hand-built sheet) */}
      {played && <CountdownDock played />}

      {/* the buttons live IN the card (owner: no floating corner) */}
      {!played && (
        <View style={styles.btnRow}>
          <Pressable
            onPress={onPlay}
            style={[styles.play, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
            <Text style={styles.playText}>PLAY</Text>
          </Pressable>
          {sworbPending && !!onGuess && (
            // PLAY's twin in the board's mono gray — SAME 3d ledge (owner)
            <Pressable
              onPress={onGuess}
              style={[
                styles.guess,
                {
                  backgroundColor: gameSurface(theme.mode).mono.bg,
                  boxShadow: `0 4px 0 ${gameSurface(theme.mode).mono.edge}`,
                },
              ]}>
              <Text style={[styles.guessText, { color: theme.ink }]}>GUESS</Text>
            </Pressable>
          )}
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: 22, borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
  mastheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mastheadSpring: { flex: 1 },
  mastheadBrand: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  mastheadItalic: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    fontStyle: 'italic',
    letterSpacing: 0.2,
    includeFontPadding: false,
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
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  play: {
    flex: 1,
    borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 13,
    alignItems: 'center',
  },
  playText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  guess: {
    flex: 1,
    borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 13,
    alignItems: 'center',
  },
  guessText: {
    // PLAY's exact twin (owner) — same metrics, gray house, GUESS
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    letterSpacing: 1.2,
  },
});
