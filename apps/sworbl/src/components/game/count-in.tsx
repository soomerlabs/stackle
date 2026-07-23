// The COUNT-IN, round 3 (owner: overlay cards read as a loading modal) —
// HEADLESS. This component owns the drift-corrected timeline, the beat
// haptics, the dev stall injector, and the release; the VISUAL beat lives
// in the stepper (via onStep), and the board itself is the stage: masked
// blocks in full view, then the radial wake at GO.
import { useEffect } from 'react';
import engine from '@sworbl/engine';
import { haptic } from '@/game/haptics';
import { getCountInStall } from '@/game/dev-flags';
import { countInTick } from '@/game/count-in-tick';

interface Props {
  onStep: (step: '3' | '2' | '1') => void; // stepper renders the beat
  onRelease: () => void; // board unlocks + wakes (engine GO beat)
  onUnmount: () => void;
}

export function CountIn({ onStep, onRelease, onUnmount }: Props) {
  useEffect(() => {
    const MS = engine.run.COUNT_IN_MS;
    const t0 = Date.now();
    let released = false;
    let lastStep: string | null = null;
    // DEV stress: busy-block the JS thread across the GO beat (freeze repro)
    if (getCountInStall()) {
      setTimeout(() => {
        const until = Date.now() + 900;
        while (Date.now() < until) {
          /* deliberate stall */
        }
      }, MS.GO - 200);
    }
    const h = setInterval(() => {
      const t = countInTick(Date.now() - t0, MS);
      if (t.release && !released) {
        released = true;
        onRelease();
      }
      if (t.done) {
        clearInterval(h);
        onUnmount();
        return;
      }
      if (t.step && t.step !== lastStep) {
        lastStep = t.step;
        onStep(t.step);
        haptic.soft(); // each beat TAPS; GO's thump is the board wake
      }
    }, 40);
    return () => clearInterval(h);
  }, []);

  return null;
}
