// The FINALE — full-screen guess phase (owner redesign 2026-07-23):
//   • guesses live at the TOP, attempts stack downward with room to breathe
//   • the KEYBOARD is real: branded mono candy blocks (face + ledge, the
//     board tiles' little siblings), big, pinned to the bottom
//   • every state lands with a subtle animation: new rows drop in from the
//     top, committed rows reveal their colors block-by-block, keys rise
//     bottom-up on the morph
// The ENGINE still decides everything (applyGuess/nextSlots/scoreGuess).
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn, FadeIn, SlideInUp, SlideInDown } from 'react-native-reanimated';
import engine from '@sworbl/engine';
import { INK, MONO_DARK, MONO_INK } from '@/game/palette';
import { haptic } from '@/game/haptics';
import { applyGuess } from '@/game/finale-logic';
import { ClueFan } from './clue-fan';

const C = {
  green: { bg: '#5FD6A8', edge: '#38AD7F', ink: INK },
  yellow: { bg: '#F5B84A', edge: '#CE9022', ink: INK },
  gray: { bg: '#3A3A44', edge: '#26262E', ink: '#8A8A96' },
  typed: { bg: '#42424F', edge: '#22222A', ink: '#FFFFFF' },
};

export interface FinaleResult {
  solved: boolean;
  guessesUsed: number;
  bonus: number;
  rows: { letters: string[]; colors: string[] }[];
}

export interface FinaleRestore {
  rows: { letters: string[]; colors: string[] }[];
  slots: string[];
  colors: (string | null)[];
  guessesUsed: number;
}

interface Props {
  entry: { sworb: string };
  clues: string[];
  found: string[];
  size: number;
  restore?: FinaleRestore;
  onProgress?: (s: FinaleRestore) => void;
  onDone: (r: FinaleResult) => void;
}

// a keyboard KEY: the board tile's little sibling — mono face on a ledge
function Key({
  ch, w, h, onPress,
}: { ch: string; w: number; h: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: w, height: h + 3 }}>
      {({ pressed }) => (
        <>
          <View style={[styles.keyLedge, { width: w, height: h, borderRadius: Math.round(h * 0.2) }]} />
          <View
            style={[
              styles.keyFace,
              { width: w, height: h, borderRadius: Math.round(h * 0.2) },
              pressed && { transform: [{ translateY: 2 }], backgroundColor: MONO_DARK.hi },
            ]}>
            <Text style={[styles.keyText, { fontSize: Math.min(20, h * 0.42) }]}>{ch}</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

export function Finale({ entry, clues, found, size, restore, onProgress, onDone }: Props) {
  const { width } = useWindowDimensions();
  const foundCount = found.length;
  const clueTotal = clues.length;
  const len = entry.sworb.length;
  const [rows, setRows] = useState<{ letters: string[]; colors: string[] }[]>(restore?.rows ?? []);
  const [slots, setSlots] = useState<string[]>(
    restore?.slots?.length === len ? restore.slots : Array(len).fill('')
  );
  const [colors, setColors] = useState<(string | null)[]>(
    restore?.colors?.length === len ? restore.colors : Array(len).fill(null)
  );
  const [guessesUsed, setGuessesUsed] = useState(restore?.guessesUsed ?? 0);
  const [locked, setLocked] = useState(false);

  const keyIn = useCallback(
    (ch: string) => {
      if (locked) return;
      const next = engine.daily.nextSlots({ slots, colors, ch, len });
      if (!next) return;
      setSlots(next.slots);
      setColors(next.colors || Array(len).fill(null));
      haptic.soft();
    },
    [slots, colors, len, locked]
  );

  const submit = useCallback(() => {
    if (locked) return;
    const out = applyGuess({ slots, rows, guessesUsed, sworb: entry.sworb, foundCount, clueTotal });
    if (out.kind === 'reject') {
      haptic.bad();
      return;
    }
    setRows(out.rows);
    setGuessesUsed(out.usedNow);
    if (out.kind === 'solved' || out.kind === 'lockout') {
      const solved = out.kind === 'solved';
      setLocked(true);
      haptic[solved ? 'good' : 'bad']();
      setTimeout(
        () => onDone({ solved, guessesUsed: out.usedNow, bonus: solved ? out.bonus : 0, rows: out.rows }),
        solved ? 1100 : 1700 // let the color reveal finish before the beat
      );
      return;
    }
    setSlots(out.slots);
    setColors(out.colors);
    onProgress &&
      onProgress({ rows: out.rows, slots: out.slots, colors: out.colors, guessesUsed: out.usedNow });
    haptic.bad();
  }, [slots, rows, guessesUsed, locked, entry, foundCount, clueTotal, onDone, onProgress]);

  // web-guard: springified/slide entering animations strand invisible on RNW
  const theater = !restore;
  const D = (ms: number) => (theater ? ms : 0);
  const E = <T,>(a: T): T | undefined => (Platform.OS === 'web' ? undefined : a);

  // guess blocks: sized so 6 rows breathe at the top
  const bs = Math.min(44, Math.floor((width - 60 - (len - 1) * 6) / len));
  const block = (letter: string, color: string | null, i: number, active: boolean, reveal: boolean) => {
    const pal = color ? C[color as keyof typeof C] : letter ? C.typed : null;
    const isHint = active && color === 'yellow';
    const inner = (
      <View
        style={[
          styles.block,
          { width: bs, height: bs * 1.14, borderRadius: Math.round(bs * 0.22) },
          pal && !isHint
            ? { backgroundColor: pal.bg, boxShadow: `0 3px 0 ${pal.edge}` }
            : isHint
              ? styles.blockHint
              : styles.blockEmpty,
        ]}>
        <Text
          style={[
            styles.blockText,
            { fontSize: Math.round(bs * 0.52) },
            { color: isHint ? '#F5B84A' : pal ? pal.ink : '#9DA2B3' },
            isHint && { opacity: 0.75 },
          ]}>
          {letter.toUpperCase()}
        </Text>
      </View>
    );
    // committed rows REVEAL block-by-block (the Wordle beat, 70ms stagger)
    return reveal ? (
      <Animated.View key={i} entering={E(ZoomIn.delay(i * 70))}>
        {inner}
      </Animated.View>
    ) : (
      <View key={i}>{inner}</View>
    );
  };

  // the KEYBOARD: three rows, keys sized to fill the width like a real one
  const KEY_ROWS = useMemo(() => ['QWERTYUIOP', 'ASDFGHJKL', '⌫ZXCVBNM⏎'], []);
  const kbPad = 8;
  const keyGap = 5;
  const keyW = Math.floor((width - kbPad * 2 - 9 * keyGap) / 10);
  const keyH = Math.round(keyW * 1.42);
  const wideW = Math.floor(keyW * 1.45);

  return (
    <Animated.View entering={E(FadeIn.duration(220).delay(D(120)))} style={styles.wrap}>
      {/* GUESSES — the top of the screen, attempts stacking downward */}
      <View style={styles.rowsArea}>
        {rows.map((r, ri) => (
          <View key={ri} style={styles.row}>
            {r.letters.map((l, i) => block(l, r.colors[i], i, false, ri === rows.length - 1))}
          </View>
        ))}
        {!locked && (
          // each new round's row DROPS IN from the top — one beat per attempt
          <Animated.View
            key={`active-${rows.length}`}
            entering={E(SlideInDown.springify().mass(0.55).damping(16))}
            style={styles.row}>
            {slots.map((l, i) => block(l, colors[i], i, true, false))}
          </Animated.View>
        )}
        <Animated.View entering={E(FadeIn.delay(D(500)))} style={styles.pips}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={[styles.pip, i < guessesUsed && styles.pipUsed]} />
          ))}
        </Animated.View>
      </View>

      {/* your intel, mid-screen */}
      <Animated.View entering={E(FadeIn.delay(D(600)))}>
        <ClueFan clues={clues} found={found} />
      </Animated.View>

      {/* THE KEYBOARD — branded mono blocks, big, bottom, rising on the morph */}
      <View style={[styles.kb, { paddingHorizontal: kbPad }]}>
        {KEY_ROWS.map((krow, ki) => (
          <Animated.View
            key={ki}
            entering={E(SlideInUp.springify().mass(0.55).damping(15).delay(D(320 + ki * 80)))}
            style={[styles.kbRow, { gap: keyGap }]}>
            {[...krow].map((k) => {
              const wide = k === '⌫' || k === '⏎';
              return (
                <Key
                  key={k}
                  ch={k}
                  w={wide ? wideW : keyW}
                  h={keyH}
                  onPress={() =>
                    k === '⏎' ? submit() : keyIn(k === '⌫' ? engine.daily.BACKSPACE : k.toLowerCase())
                  }
                />
              );
            })}
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
  },
  rowsArea: {
    alignItems: 'center',
    gap: 7,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  block: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockEmpty: { borderWidth: 2.5, borderStyle: 'dashed', borderColor: '#3A3A44' },
  blockHint: { borderWidth: 2.5, borderStyle: 'dashed', borderColor: '#CE9022' },
  blockText: { fontFamily: 'Fredoka_600SemiBold', includeFontPadding: false },
  pips: { flexDirection: 'row', gap: 5, marginTop: 4 },
  pip: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2a2446' },
  pipUsed: { backgroundColor: '#ff6b5a' },
  kb: {
    gap: 7,
    alignItems: 'center',
  },
  kbRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  keyLedge: {
    position: 'absolute',
    top: 3,
    left: 0,
    backgroundColor: MONO_DARK.edge,
  },
  keyFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: MONO_DARK.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  keyText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: MONO_INK,
    includeFontPadding: false,
  },
});
