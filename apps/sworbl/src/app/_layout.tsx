import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { ToastHost } from '@/components/toast';
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { useEffect } from 'react';

import { initStorage } from '@/game/storage';

// Reanimated strict mode OFF (level stays warn): Skia components seed their
// first frame by reading a shared value's .value DURING render — that's the
// documented integration pattern, not a bug, but strict mode flags it every
// boot. Our own house rule (no render reads) still holds; audited 2026-07-23.
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });
import { loadFullDictionary } from '@/game/dictionary';

SplashScreen.preventAutoHideAsync();
// storage backing FIRST — everything downstream reads through the engine store
// (MMKV on native via setBacking; localStorage on web needs no injection)
initStorage();
// dev: cross-launch persistence canary — if this number ever fails to climb
// across cold starts, MMKV is not persisting on this install
if (__DEV__) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require('@sworbl/engine').default;
    engine.store.set('sworbl_rn_boots', (engine.store.getInt('sworbl_rn_boots', 0) || 0) + 1);
  } catch {}
}
// REAL CLIENTS ONLY (the phantom-user factory): expo-router's web server
// renderer executes this module in Node on every bundle — these timers were
// minting a fresh anonymous Supabase user per render (players table filled
// with PLAYERxxxx ghosts) and failing the dictionary fetch with node URL
// errors. Node has no window; browsers and Hermes do.
const IS_REAL_CLIENT = typeof window !== 'undefined';

// full 135k dictionary swaps in behind the starter — fire-and-forget, off the
// boot path; validation generosity upgrades within seconds of launch.
// AT 1200ms, NOT 50 (owner: "jenk in the loading"): the parse is a chunky
// synchronous JS bite and it was landing mid-boot-choreography — nothing
// needs the full dictionary before a human can possibly submit a word
if (IS_REAL_CLIENT) setTimeout(() => {
  loadFullDictionary();
}, 1200);
// backend (when configured): anonymous identity + any queued submissions —
// entirely fire-and-forget; the app never waits on the network. After the
// dictionary so the two JS bites can't stack.
if (IS_REAL_CLIENT) setTimeout(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ensurePlayer } = require('@/net/supabase');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drainOutbox } = require('@/net/standings-remote');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPlayerName } = require('@/game/player');
  ensurePlayer(getPlayerName()).then(() => drainOutbox());
}, 2000);
// FOREGROUND drain (owner networking audit): a round finished offline used
// to wait for the NEXT cold boot — now returning to the app delivers it
if (IS_REAL_CLIENT) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppState } = require('react-native');
  let last = AppState.currentState;
  AppState.addEventListener('change', (next: string) => {
    if (last !== 'active' && next === 'active') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drainOutbox } = require('@/net/standings-remote');
      setTimeout(() => drainOutbox(), 800);
    }
    last = next;
  });
}

export default function RootLayout() {
  const scheme = useColorScheme(); // light mode is real now (owner call)
  const [fontsLoaded] = useFonts({ Fredoka_500Medium, Fredoka_600SemiBold });
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={scheme === 'light' ? DefaultTheme : DarkTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: scheme === 'light' ? '#EDEFF7' : '#101014' },
            // NATIVE PUSH (owner: "i want that normal push") — the fade was
            // set explicitly; default iOS slide matches the back-swipe
          }}>
          {/* the guess rides up as a SHEET (owner) — iOS pageSheet, pull
              down to bail (intel parks on every guess regardless) */}
          {/* storm boards RISE (owner: "is the gameboard being pushed
              now? wtf") — full-screen modal slides up like the sheet,
              never a sideways push */}
          <Stack.Screen name="storm" options={{ presentation: 'fullScreenModal' }} />
          {/* the DAILY BOARD opens like GUESS (owner): native pageSheet,
              swipe down to dismiss — the run pauses itself on the way out */}
          <Stack.Screen name="play" options={{ presentation: 'modal' }} />
          <Stack.Screen name="guess" options={{ presentation: 'modal' }} />
          <Stack.Screen name="archetypes" options={{ presentation: 'modal' }} />
          <Stack.Screen
            name="about-mode"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              sheetCornerRadius: 24,
            }}
          />
          <Stack.Screen
            name="lobby"
            options={{
              // content-height sheet (owner: "not so massive") — iOS
              // formSheet sized to its children, grabber visible
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              sheetCornerRadius: 24,
            }}
          />
          {/* THE WALLET (owner: mock "pay for more") — content-height */}
          <Stack.Screen
            name="points"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              sheetCornerRadius: 24,
            }}
          />
          {/* PRIVATE ROOMS (owner: "the organizer dictates the money") —
              same content-height sheet grammar as the lobby */}
          <Stack.Screen
            name="rooms"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: 'fitToContents',
              sheetGrabberVisible: true,
              sheetCornerRadius: 24,
            }}
          />
        </Stack>
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
