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
            animation: 'fade',
          }}
        />
        <ToastHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
