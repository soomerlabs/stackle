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

// the six hues — during the pull the emerging sheet's face IS this color
const WASH_HUES = ['#A78BFA', '#5BC8F5', '#5FD6A8', '#F58FB8', '#F5B84A', '#F58A66'] as const;

interface Props {
  sheetY: SharedValue<number>;
  sGlow: SharedValue<number>; // aurora intensity: muted → FULL GLOW on arm
  sBoot: SharedValue<number>; // the boot master clock (band blooms late)
  closedY: number;
  width: number;
  peekH: number;
}

export function SheetWeather({ sheetY, sGlow, sBoot, closedY, width, peekH }: Props) {
  // RIDE THE STORM UP: the crest is glued to the sheet's top edge, so the
  // pull literally drags the weather up the screen. Travel BRIGHTENS it to
  // full burn (a restrained swell — the big stretch smeared hues over the
  // board); near full-open it dissolves and the board stands alone.
  const stormRideStyle = useAnimatedStyle(() => {
    const travel = interpolate(sheetY.value, [0, closedY], [1, 0], Extrapolation.CLAMP);
    const calm = 0.45 + sGlow.value * 0.55; // parked: muted → armed: ignited
    const burn = interpolate(travel, [0, 0.3], [calm, 1], Extrapolation.CLAMP);
    // dissolve EARLY — the crest hands the screen to the board while the
    // pull still has momentum (owner: the late overlap smeared)
    const settle = interpolate(travel, [0.55, 0.8], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: bootWindow(sBoot.value, 0.45, 0.55) * burn * settle,
      transform: [{ scale: 1 + sGlow.value * 0.06 + travel * 0.35 }],
    };
  }, [closedY]);

  // the WASH, from the AURORA LINE down (owner): the strip above the glow
  // keeps the board's own clear surface; the hues begin where the blur
  // lives and run to the sheet's bottom. One static gradient, opacity-only
  // — the opaque game subtree beneath pays no alpha tax during the drag.
  const washStyle = useAnimatedStyle(() => {
    const travel = interpolate(sheetY.value, [0, closedY], [1, 0], Extrapolation.CLAMP);
    const build = interpolate(travel, [0.06, 0.32], [0, 1], Extrapolation.CLAMP);
    // hand the surface back BEFORE the animation ends (owner) — the board's
    // real colors are already standing when the sheet docks
    const reveal = interpolate(travel, [0.68, 0.9], [1, 0], Extrapolation.CLAMP);
    return { opacity: build * reveal };
  }, [closedY]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.washWrap, { top: Math.round(peekH * 0.7) }, washStyle]}>
        <LinearGradient
          colors={[...WASH_HUES]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.stormRide, { height: Math.round(peekH * 1.6) }, stormRideStyle]}>
        {/* 1.6× the band: the canvas's bottom-melt zone hangs BELOW the
            screen at park (lip stays full) and dissolves the glow into the
            board mid-pull — no hard stop line (owner) */}
        <Storm width={width} height={Math.round(peekH * 1.6)} zoom={2.2} />
      </Animated.View>
    </>
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
