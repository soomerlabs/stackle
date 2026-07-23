import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastHost } from '@/components/toast';
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { useEffect } from 'react';

import { initStorage } from '@/game/storage';
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
// full 135k dictionary swaps in behind the starter — fire-and-forget, off the
// boot path; validation generosity upgrades within seconds of launch
setTimeout(() => {
  loadFullDictionary();
}, 50);
// backend (when configured): anonymous identity + any queued submissions —
// entirely fire-and-forget; the app never waits on the network
setTimeout(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ensurePlayer } = require('@/net/supabase');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drainOutbox } = require('@/net/standings-remote');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPlayerName } = require('@/game/player');
  ensurePlayer(getPlayerName()).then(() => drainOutbox());
}, 400);

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
