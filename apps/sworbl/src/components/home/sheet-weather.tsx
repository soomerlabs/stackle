// THE SHEET'S WEATHER — the color wash + the storm crest that dress the
// pull (owner pick: "ride the storm up"; frost/glass deleted). Pure
// display: home owns sheetY/sGlow/sBoot and this component derives every
// frame from them — all interpolation, no timers, no blur on the moving
// sheet.
import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle, interpolate, Extrapolation, type SharedValue,
} from 'react-native-reanimated';

import Storm from '@/components/game/storm';
import { bootWindow } from './home-motion';
import { gameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';

// the six hues — during the pull the emerging sheet's face IS this color
const WASH_HUES = ['#A78BFA', '#5BC8F5', '#5FD6A8', '#F58FB8', '#F5B84A', '#F58A66'] as const;

interface Props {
  sheetY: SharedValue<number>;
  sGlow: SharedValue<number>; // aurora intensity: muted → FULL GLOW on arm
  sBoot: SharedValue<number>; // the boot master clock (band blooms late)
  sReveal: SharedValue<number>; // TIME-based exit: 0 until the launch commits,
  // then home runs it to 1 after the dock — a flick can't flash the color away
  closedY: number;
  width: number;
  peekH: number;
}

// INSIDE the sheet's clip: the color wash on the emerging board
export function SheetWash({ sheetY, sGlow, sBoot, sReveal, closedY, width, peekH }: Props) {
  // the WASH, from the AURORA LINE down (owner): the strip above the glow
  // keeps the board's own clear surface; the hues begin where the blur
  // lives and run to the sheet's bottom. One static gradient, opacity-only
  // — the opaque game subtree beneath pays no alpha tax during the drag.
  const washStyle = useAnimatedStyle(() => {
    const travel = interpolate(sheetY.value, [0, closedY], [1, 0], Extrapolation.CLAMP);
    const build = interpolate(travel, [0.06, 0.32], [0, 1], Extrapolation.CLAMP);
    // TINT, not paint (owner: "such hard lines looks bad") — at 55% the
    // hues glow through the dark surface instead of reading as bands. The
    // exit is sReveal (time-based, after the dock) — never a mid-flick flash.
    return { opacity: build * (1 - sReveal.value) * 0.55 };
  }, [closedY]);
  const gs = gameSurface(useTheme().mode);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.washWrap, { top: 0 }, washStyle]}>
      {/* wash spans from the sheet's TOP — the surface-melt gradient blends
          board-color into hue, so there's no bare near-black strip (owner) */}
      <LinearGradient
        colors={[...WASH_HUES]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* the SURFACE MELT: sized to the glow's reach so the hues emerge
          right where the crest hands off — never a black gap (owner) */}
      <LinearGradient
        colors={[gs.bg, gs.bg + '00']}
        style={[styles.melt, { height: Math.round(peekH * 1.15) }]}
      />
    </Animated.View>
  );
}

// OUTSIDE the clip (the sheet's outer, unclipped layer): the aurora crest.
// Living out here lets it stand TALLER than the band (owner: "taller, more
// northern-light-ish") — it rises above the sheet's top edge over home.
export function StormCrest({ sheetY, sGlow, sBoot, sReveal, closedY, width, peekH }: Props) {
  const stormH = Math.round(peekH * 2.4);
  const stormRideStyle = useAnimatedStyle(() => {
    const travel = interpolate(sheetY.value, [0, closedY], [1, 0], Extrapolation.CLAMP);
    const calm = 0.45 + sGlow.value * 0.55; // parked: muted → armed: ignited
    const burn = interpolate(travel, [0, 0.3], [calm, 1], Extrapolation.CLAMP);
    return {
      opacity: bootWindow(sBoot.value, 0.45, 0.55) * burn * (1 - sReveal.value),
      transform: [{ scale: 1 + sGlow.value * 0.06 + travel * 0.35 }],
    };
  }, [closedY]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.stormRide,
        // the crest's head rises ~a band-height ABOVE the sheet's top edge;
        // its tail (the bottom melt) hangs past the screen at park
        { height: stormH, top: -Math.round(peekH * 0.9) },
        stormRideStyle,
      ]}>
      <Storm width={width} height={stormH} zoom={2.2} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // the wash owns the sheet BELOW the aurora line only — the top strip
  // stays the board's own surface (owner); anchored to the sheet's bottom
  washWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  melt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // the crest rides the sheet's TOP edge; scaling from that edge lets the
  // swell spread DOWN over the emerging board during the pull
  stormRide: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    transformOrigin: '50% 0%',
  },
});
