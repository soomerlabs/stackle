// THE PLAY FAB (owner: "i'm over the PLAY button mechanic — we overused
// it and it's not fun, i want it gone") — the swipe-to-spell hockey
// stick retires. One candy tap remains: accent squircle, ledge shadow,
// PLAY. It still recedes as the sheet rises (it lives over home).
import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle, interpolate, Extrapolation, type SharedValue,
} from 'react-native-reanimated';

import { haptic } from '@/game/haptics';
import { ACCENT, ACCENT_EDGE } from '@/game/theme';

interface Props {
  sheetY: SharedValue<number>;
  closedY: number;
  onCommit: () => void; // openToPlay — spring the sheet up + markOpen
  enabled: boolean; // a consumed day never launches
}

export function PlayFab({ sheetY, closedY, onCommit, enabled }: Props) {
  // the FAB recedes once the sheet is up (it lives over home)
  const fabPose = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [closedY * 0.45, closedY * 0.9], [0, 1], Extrapolation.CLAMP),
  }));

  if (!enabled) return null;
  return (
    <Animated.View style={[styles.wrap, fabPose]} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          haptic.soft();
          onCommit();
        }}
        style={({ pressed }) => [styles.btn, pressed && { transform: [{ scale: 0.97 }] }]}>
        <Text style={styles.text}>PLAY</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 46, // where the stick's foot sat — muscle memory holds
  },
  btn: {
    backgroundColor: ACCENT,
    boxShadow: `0 4px 0 ${ACCENT_EDGE}`,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 26,
    paddingVertical: 16,
    alignItems: 'center',
  },
  text: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 17,
    letterSpacing: 1.4,
    color: '#FFFFFF',
    includeFontPadding: false,
  },
});
