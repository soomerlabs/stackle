// THE SWORBL GLOW — WEB (RNW): the same Apple-idiom edge weather as the
// native Skia variant (storm.native.tsx), built from CSS instead: one wide
// six-hue gradient band sweeping glacially under a heavy CSS blur filter,
// two soft radial blooms for depth. A blurred rect's edges feather
// themselves — no mask needed for the melt. KEEP THE TWO VARIANTS IN SYNC
// (the split-file trap has bitten twice: patch BOTH or state why not).
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';

const HUES = ['#A78BFA', '#5BC8F5', '#5FD6A8', '#F58FB8', '#F5B84A', '#F58A66'];

function useDrift(dur: number) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: dur / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur]);
  return t;
}

export default function Storm({ width, height = 260 }: {
  width: number; height?: number; zoom?: number; // zoom kept for API parity
  focusW?: number; focusH?: number; // eclipse row-wrap (native uses; web TBD)
}) {
  const sweep = useDrift(26000);
  const breath = useDrift(9000);
  const W = width * 1.7; // wider than the screen — the slide never shows an end

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: -(W - width) * sweep.value }],
  }));
  const glow = useAnimatedStyle(() => ({
    opacity: 0.8 + breath.value * 0.2,
  }));

  return (
    <View pointerEvents="none" style={[styles.wrap, { width, height }]}>
      <Animated.View style={[StyleSheet.absoluteFill, glow]}>
        {/* the hue field — blur(30) feathers every edge on its own */}
        <Animated.View
          style={[
            slide,
            styles.blurred,
            { top: height * 0.42, width: W, height: height * 0.85, borderRadius: height * 0.3 },
          ]}>
          <LinearGradient
            colors={[HUES[0], HUES[1], HUES[2], HUES[3], HUES[4], HUES[5], HUES[0], HUES[1]] as const}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        {/* two soft blooms for depth */}
        <View
          style={[
            styles.blurred,
            styles.bloom,
            {
              left: width * 0.22, top: height * 0.5,
              width: height * 0.9, height: height * 0.9, borderRadius: height * 0.45,
              backgroundColor: 'rgba(167,139,250,0.55)',
            },
          ]}
        />
        <View
          style={[
            styles.blurred,
            styles.bloom,
            {
              left: width * 0.64, top: height * 0.44,
              width: height * 0.8, height: height * 0.8, borderRadius: height * 0.4,
              backgroundColor: 'rgba(245,143,184,0.45)',
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  blurred: {
    position: 'absolute',
    // RNW passes this through as CSS; native never loads this file
    filter: 'blur(30px)',
  },
  bloom: {
    filter: 'blur(40px)',
  },
});
