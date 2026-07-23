import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { useEffect } from 'react';

import { initStorage } from '@/game/storage';
import { loadFullDictionary } from '@/game/dictionary';

SplashScreen.preventAutoHideAsync();
// storage backing FIRST — everything downstream reads through the engine store
// (MMKV on native via setBacking; localStorage on web needs no injection)
initStorage();
// full 135k dictionary swaps in behind the starter — fire-and-forget, off the
// boot path; validation generosity upgrades within seconds of launch
setTimeout(() => {
  loadFullDictionary();
}, 50);

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
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
