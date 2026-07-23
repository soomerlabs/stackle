// THE SWORBL TOAST — our own push-notification idiom (owner): drops from
// the top on a spring, candy accent block, swipe UP to flick it away
// (finger-glued, velocity carries), auto-dismisses otherwise. Shared-value
// motion only (house rule). Global: mount <ToastHost/> once at root, call
// toast('...') from anywhere.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { PALETTE } from '@/game/palette';
import { useTheme } from '@/game/theme';

export interface ToastT {
  message: string;
  title?: string;
  pal?: number; // PALETTE accent (default violet)
  ms?: number; // auto-dismiss (default 3200)
}

let push: ((t: ToastT) => void) | null = null;

export function toast(message: string, opts: Omit<ToastT, 'message'> = {}): void {
  push?.({ message, ...opts });
}

const HIDDEN = -160;

export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<(ToastT & { key: number }) | null>(null);
  const keyRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const y = useSharedValue(HIDDEN);

  const clear = useCallback(() => setCurrent(null), []);
  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    y.value = withTiming(HIDDEN, { duration: 180 }, (fin) => {
      'worklet';
      if (fin) runOnJS(clear)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear]);

  useEffect(() => {
    push = (t) => {
      if (timer.current) clearTimeout(timer.current);
      setCurrent({ ...t, key: ++keyRef.current });
      y.value = HIDDEN;
      y.value = withSpring(0, { mass: 0.7, damping: 18, stiffness: 240 });
      timer.current = setTimeout(() => dismissRef.current(), t.ms ?? 3200);
    };
    return () => {
      push = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const swipe = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((e) => {
      'worklet';
      // up = leaving (glued); down = rubber-banded resistance
      y.value = e.translationY < 0 ? e.translationY : e.translationY * 0.18;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY < -32 || e.velocityY < -600) {
        y.value = withTiming(HIDDEN, { duration: 150 }, (fin) => {
          'worklet';
          if (fin) runOnJS(clear)();
        });
      } else {
        y.value = withSpring(0, { mass: 0.6, damping: 18, stiffness: 260 });
      }
    });

  const pose = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  if (!current) return null;
  const pal = PALETTE[(current.pal ?? 0) % PALETTE.length];
  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        key={current.key}
        style={[
          styles.wrap,
          { top: insets.top + 6 },
          pose,
          {
            backgroundColor: theme.card,
            boxShadow:
              theme.mode === 'dark'
                ? '0 8px 24px rgba(0,0,0,0.45)'
                : '0 8px 24px rgba(31,20,66,0.2)',
          },
        ]}>
        <View
          style={[styles.block, { backgroundColor: pal.bg, boxShadow: `inset 0 -3px 0 ${pal.edge}` }]}>
          <Text style={styles.blockS}>s</Text>
        </View>
        <View style={styles.body}>
          {!!current.title && (
            <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
              {current.title}
            </Text>
          )}
          <Text style={[styles.msg, { color: current.title ? theme.sub : theme.ink }]} numberOfLines={2}>
            {current.message}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 99,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  block: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockS: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13.5,
  },
  msg: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    lineHeight: 17,
  },
});
