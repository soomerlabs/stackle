// BOARD AURA (owner handoff: Storm Riff 1d "board surround" default, 1e
// "ring" behind the flag) — a reusable ambient glow behind the live board
// whose HUE is game state and whose SPEED is urgency. Decoration only:
// absolute, pointer-events none, transform/opacity only, no layout shift.
// State table (v1, RN): danger (clock ≤ 12s) → charged (the finale's heat)
// → aurora (reserved: finished board) → calm. First match wins upstream.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas, Group, Paint, Blur, Circle, RadialGradient, SweepGradient, vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue, useAnimatedStyle, useDerivedValue, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';

export type AuraState = 'danger' | 'charged' | 'aurora' | 'calm';

// color = state, speed = urgency (the handoff's table, RN palette verbatim)
const AURA: Record<AuraState, { inner: string; outer: string; breathMs: number }> = {
  danger: { inner: 'rgba(229,72,77,0.55)', outer: 'rgba(245,101,79,0)', breathMs: 2600 },
  charged: { inner: 'rgba(245,143,184,0.5)', outer: 'rgba(245,184,74,0)', breathMs: 3600 },
  aurora: { inner: 'rgba(95,214,168,0.5)', outer: 'rgba(63,191,140,0)', breathMs: 5000 },
  calm: { inner: 'rgba(91,200,245,0.4)', outer: 'rgba(124,92,224,0)', breathMs: 6000 },
};

// 1e ring — one-line swap per the handoff; full-spectrum conic, spinning
const USE_RING = false;
const RING_HUES = ['#5FD6A8', '#5BC8F5', '#A78BFA', '#F58FB8', '#F5B84A', '#5FD6A8'];

export function BoardAura({ w, h, state, boardBg }: {
  w: number; // board card width
  h: number; // board card height
  state: AuraState;
  boardBg: string; // 1e punches the center out with the board's own color
}) {
  // the halo box: ~135% of the card, centered — the glow spills the edges
  const W = Math.round(w * 1.35);
  const H = Math.round(h * 1.35);
  const cx = W / 2;
  const cy = H / 2;

  // breath: scale 0.98↔1.1, opacity 0.55↔0.9, speed per state (urgency)
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: AURA[state].breathMs / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  // quieter than the handoff's web numbers (owner: "cool vibe... not
  // distracting"): lower ceiling, shallower swell. CALM IS SILENT (owner:
  // "the weird light hue") — opacity 0, but the Canvas STAYS MOUNTED: a
  // Skia teardown mid-close was a hitch on finale/danger closes (no
  // entering/exiting on persistent UI).
  const silent = state === 'calm';
  const breath = useAnimatedStyle(() => ({
    opacity: silent ? 0 : 0.35 + t.value * 0.25,
    transform: [{ scale: 0.99 + t.value * 0.08 }],
  }));

  const spin = useSharedValue(0);
  useEffect(() => {
    if (!USE_RING) return;
    spin.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ringSpin = useDerivedValue(() => [{ rotate: spin.value * Math.PI * 2 }]);

  const pal = AURA[state];
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { width: W, height: H, marginLeft: -W / 2, marginTop: -H / 2 },
        breath,
      ]}>
      <Canvas style={{ width: W, height: H }}>
        {USE_RING ? (
          <Group layer={<Paint><Blur blur={15} /></Paint>}>
            <Group transform={ringSpin} origin={vec(cx, cy)}>
              <Circle cx={cx} cy={cy} r={W * 0.36}>
                <SweepGradient c={vec(cx, cy)} colors={RING_HUES} />
              </Circle>
            </Group>
            {/* the punch-out: board color fills the middle, leaving a ring */}
            <Circle cx={cx} cy={cy} r={W * 0.24} color={boardBg} />
          </Group>
        ) : (
          <Circle cx={cx} cy={cy} r={Math.min(cx, cy)}>
            <RadialGradient
              c={vec(cx, cy)}
              r={Math.min(cx, cy)}
              colors={[pal.inner, pal.outer]}
              positions={[0, 0.72]}
            />
          </Circle>
        )}
      </Canvas>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // parked at the CARD's center — the card provides position:relative
  wrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
});
