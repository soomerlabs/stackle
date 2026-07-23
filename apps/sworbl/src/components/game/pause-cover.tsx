// Board-local pause cover — FULLY OPAQUE over the tiles (fairness: paused
// players don't get free scanning time). Tap resumes via the count-in re-arm.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

interface Props {
  clock: string;
  fresh?: boolean; // true on a resumed-from-kill boot ("welcome back")
  onResume: () => void;
}

export function PauseCover({ clock, fresh, onResume }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, styles.wrap]}>
      <Pressable style={styles.inner} onPress={onResume}>
        <Text style={styles.title}>{fresh ? 'welcome back' : 'paused'}</Text>
        <Text style={styles.clock}>{clock}</Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>TAP TO RESUME</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#101014', // opaque — the letters must not read through
    borderRadius: 18,
    zIndex: 20,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 22,
    color: '#EDEFF7',
  },
  clock: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 40,
    color: '#A78BFA',
    fontVariant: ['tabular-nums'],
  },
  cta: {
    marginTop: 8,
    backgroundColor: '#8971FF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#5A43C9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  ctaText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
});
