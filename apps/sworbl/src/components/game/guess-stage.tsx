// THE GUESS STAGE — the sworb guess, DECOUPLED from the gameboard (owner:
// "i keep finding bugs and they should be decoupled anyway"). Fully
// self-contained: its own stepper (guess face), its own card frame, the
// keyboard, and the engine guess logic. The board never knows guessing
// exists; play-sheet just swaps stages. Clue intel arrives as PROPS; the
// 3rd-miss freebie is reported UP (onMiss) — granting is the sheet's job.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import engine from '@sworbl/engine';

import { applyGuess } from '@/game/finale-logic';
import { ARCHETYPE_LABEL } from '@/components/game/result-view';
import { haptic } from '@/game/haptics';
import { GAME_DARK, type GameSurface } from '@/game/palette';
import { BoardKeyboard } from './board-keyboard';
import { ClueFan } from './clue-fan';
import { StepperCard } from './stepper-card';

// the guess's restore shape — lived in finale.tsx before the decoupling
export interface FinaleRestore {
  rows: { letters: string[]; colors: string[] }[];
  slots: string[];
  colors: (string | null)[];
  guessesUsed: number;
}


interface Props {
  sworb: string;
  archetype?: string | null; // the day's twist — CONTRACT intel, shown
  // before the guess (owner ruling: the rule is knowable, only the
  // answer is hidden — bravery needs a legible bet)
  rounds: number; // decays the solve bonus (engine law)
  restore?: FinaleRestore;
  found: string[]; // clue intel — reward tier + the fan
  clues: string[]; // active clue set (the fan display)
  clueTotal: number; // the AUTHORED six — the reward tier's denominator
  nudged?: string | null;
  size: number; // board tile size — keys ARE tiles, frames match
  gap: number;
  gs?: GameSurface;
  onProgress: (s: FinaleRestore) => void;
  onMiss?: (usedNow: number) => void; // the sheet may grant the freebie
  onDone: (r: { solved: boolean; guessesUsed: number; bonus: number }) => void;
}

export function GuessStage({
  sworb, archetype, rounds, restore, found, clues, clueTotal, nudged, size, gap, gs = GAME_DARK, onProgress, onMiss, onDone,
}: Props) {
  const twist = archetype ? ARCHETYPE_LABEL[archetype] : null;
  const len = sworb.length;
  const cell = size + gap;
  const boardW = 5 * cell - gap;
  const boardH = 6 * cell - gap;

  const [rows, setRows] = useState<{ letters: string[]; colors: string[] }[]>(restore?.rows ?? []);
  const [slots, setSlots] = useState<string[]>(
    restore?.slots?.length === len ? restore.slots : Array(len).fill('')
  );
  const [colors, setColors] = useState<(string | null)[]>(
    restore?.colors?.length === len ? restore.colors : Array(len).fill(null)
  );
  const [used, setUsed] = useState(restore?.guessesUsed ?? 0);
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(0);
  const [burst, setBurst] = useState(0);

  const key = useCallback(
    (ch: string) => {
      if (locked) return;
      const next = engine.daily.nextSlots({ slots, colors, ch, len });
      if (!next) return;
      setSlots(next.slots);
      setColors(next.colors || Array(len).fill(null));
      haptic.soft();
    },
    [locked, slots, colors, len]
  );

  const submit = useCallback(() => {
    if (locked) return;
    const out = applyGuess({
      slots, rows, guessesUsed: used,
      sworb, foundCount: found.length, clueTotal, rounds,
    });
    if (out.kind === 'reject') {
      haptic.bad();
      setShake((k) => k + 1);
      return;
    }
    setRows(out.rows);
    setUsed(out.usedNow);
    if (out.kind === 'solved' || out.kind === 'lockout') {
      const solved = out.kind === 'solved';
      setLocked(true);
      if (solved) {
        setColors(Array(len).fill('green'));
        setSlots([...sworb]);
        setBurst((k) => k + 1);
        haptic.good();
      } else {
        haptic.bad();
      }
      // BANK IMMEDIATELY (kill-window law): committed the instant it's
      // decided — the celebration is theater over a locked result
      onDone({ solved, guessesUsed: out.usedNow, bonus: solved ? out.bonus : 0 });
      return;
    }
    setSlots(out.slots);
    setColors(out.colors);
    onProgress({ rows: out.rows, slots: out.slots, colors: out.colors, guessesUsed: out.usedNow });
    setShake((k) => k + 1);
    haptic.bad();
    onMiss?.(out.usedNow);
  }, [locked, slots, rows, used, sworb, found.length, clueTotal, rounds, onProgress, onMiss, onDone]);

  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.wrap}>
      <StepperCard
        width={boardW + 24}
        traceWord=""
        verdict={null}
        countIn={null}
        gs={gs}
        sworb={{ slots, colors, guessesUsed: used, shakeKey: shake, burstKey: burst }}
      />
      {/* the keyboard wears the BOARD's card frame — same footprint, so
          the stage swap never moves the column */}
      <View
        style={[
          styles.card,
          {
            width: boardW + 24,
            height: boardH + 24 + Math.max(3, Math.round(size * 0.08)),
            backgroundColor: gs.card,
            boxShadow: `0 6px 0 ${gs.cardEdge}`,
          },
        ]}>
        <BoardKeyboard
          gs={gs}
          size={size}
          gap={gap}
          full={slots.length > 0 && slots.every(Boolean)}
          onKey={key}
          onBackspace={() => key(engine.daily.BACKSPACE)}
          onSubmit={submit}
        />
      </View>
      <ClueFan clues={clues} found={found} nudged={nudged} gs={gs} />
      {twist && (
        <View style={styles.twistPill}>
          <Text style={styles.twistText}>archetype: {twist}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  twistPill: {
    borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(137,113,255,0.14)',
    marginTop: 12,
  },
  twistText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#8971FF',
  },
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    marginTop: 12,
    padding: 12,
  },
});
