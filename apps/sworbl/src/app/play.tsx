// THE DAILY BOARD AS A NATIVE SHEET (owner: "yeah the native sheet
// conversion, lets get that out of the way") — the hand-built sheetY
// sheet retires; the board rides the same native fullScreenModal rise
// the storms use (the feel the owner already approved). PlaySheet is
// unchanged inside: it deals, arms, parks and banks exactly as before —
// only the HOST changed.
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, View, StyleSheet } from 'react-native';

import { CoachCover, wasCoached } from '@/components/coach-cover';
import { PlaySheet, type PlaySheetHandle } from '@/components/play-sheet';
import { dealDaily } from '@/game/daily';
import { gameSurface } from '@/game/palette';
import { saveSheetOpen } from '@/game/persist';
import { useTheme } from '@/game/theme';

export default function PlayScreen() {
  const theme = useTheme();
  const sheetRef = useRef<PlaySheetHandle>(null);

  // kill-restore: a mid-run kill reopens straight onto the board (the
  // unmount cleanup never runs on a kill — that's the mechanism).
  // NATIVE SWIPE-DISMISS (owner: "open the same way as GUESS"): the
  // cleanup also PARKS the round — pauseForClose runs synchronously at
  // unmount-start, so a swiped-away sheet banks its paused snapshot.
  useEffect(() => {
    const dk = dealDaily()?.dayKey;
    if (dk) saveSheetOpen(dk);
    return () => {
      sheetRef.current?.pauseForClose();
      saveSheetOpen(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the round only ARMS after the native rise settles (the storm
  // screen's lesson: building the count-in inside the transition janked)
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      t = setTimeout(() => setSettled(true), 120);
    });
    return () => {
      task.cancel();
      if (t) clearTimeout(t);
    };
  }, []);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  // THE FIRST-RUN COACH (audit): the very first board ever holds
  // un-armed under the how-it-works cover — the clock never starts
  // until the verb has been taught. Once, forever.
  const [coached, setCoachedState] = useState(() => wasCoached());

  return (
    <View style={[styles.root, { backgroundColor: gameSurface(theme.mode).bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <PlaySheet ref={sheetRef} active={settled && coached} onClose={close} />
      {!coached && <CoachCover onDone={() => setCoachedState(true)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
