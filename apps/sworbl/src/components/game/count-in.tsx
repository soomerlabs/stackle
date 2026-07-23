// The 3·2·1·GO count-in, board-local. Timeline and step meaning come from the
// ENGINE (COUNT_IN_MS + countInStepAt) — this component only renders the beats.
// 700ms per beat, GO holds 650ms, 'out' fade at 2750ms, unmount at 3300ms.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn, FadeOut } from 'react-native-reanimated';
import engine from '@sworbl/engine';
import { PALETTE } from '@/game/palette';

interface Props {
  onRelease: () => void; // board unlocks (engine RELEASE step)
  onUnmount: () => void;
}

export function CountIn({ onRelease, onUnmount }: Props) {
  const [step, setStep] = useState<string>('3');
  const [out, setOut] = useState(false);

  useEffect(() => {
    const MS = engine.run.COUNT_IN_MS;
    const at = (ms: number, fn: () => void) => setTimeout(fn, ms);
    const timers = [
      at(MS.STEP2, () => setStep(String(engine.run.countInStepAt(MS.STEP2, {}).countIn))),
      at(MS.STEP1, () => setStep(String(engine.run.countInStepAt(MS.STEP1, {}).countIn))),
      at(MS.GO, () => setStep(String(engine.run.countInStepAt(MS.GO, {}).countIn))),
      at(MS.RELEASE, () => {
        setOut(true);
        onRelease();
      }),
      at(MS.UNMOUNT, () => onUnmount()),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const ci = step === 'GO' ? 2 : step === '1' ? 1 : step === '2' ? 0 : 3;
  const pal = PALETTE[ci];

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap, out && styles.out]}>
      <Animated.Text
        key={step}
        entering={ZoomIn.springify().mass(0.6).damping(12)}
        exiting={FadeOut.duration(140)}
        style={[styles.digit, { color: pal.bg, textShadowColor: pal.edge }]}>
        {step}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,16,20,0.55)',
    borderRadius: 18,
    zIndex: 10,
  },
  out: {
    opacity: 0, // RELEASE → the overlay fades while GO's exit plays underneath
  },
  digit: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 96,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
});
