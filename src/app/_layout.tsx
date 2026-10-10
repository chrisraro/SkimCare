import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { Newsreader_400Regular, Newsreader_500Medium, Newsreader_600SemiBold, useFonts } from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getEngine } from '@/ai/demoEngine';
import { openStorage } from '@/db/openStorage';
import { useModelDownload } from '@/features/model/downloadStore';
import { initPersistence } from '@/features/storage/persistence';
import { registerServiceWorker } from '@/features/pwa/pwa';
import { colors, fonts } from '@/theme/tokens';

/**
 * iOS headers are transparent and blurred, so content scrolls under them and,
 * on iOS 26 builds, back buttons render as Liquid Glass. Android keeps a solid bar.
 */
const headerChrome =
  Platform.OS === 'ios'
    ? { headerTransparent: true, headerBlurEffect: 'systemChromeMaterialLight' as const }
    : { headerStyle: { backgroundColor: colors.bg } };

export default function RootLayout() {
  const [loaded, error] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
  });
  // Saved reviews and settings load before any route renders, so Home and the
  // onboarding redirect see them. initPersistence never rejects: on failure the app
  // keeps working in memory and Settings says so.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void initPersistence(openStorage).then(() => setHydrated(true));
  }, []);
  // Android local engine: re-attach to a model download that kept running (or finished) while the app was closed.
  useEffect(() => {
    if (Platform.OS === 'android' && getEngine().info.kind === 'local') void useModelDownload.getState().reattach();
  }, []);
  // Web only, production only: lets the app shell open offline after one visit.
  useEffect(registerServiceWorker, []);
  // A failed font load falls back to system fonts rather than blocking the app.
  if ((!loaded && !error) || !hydrated) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          // Screens draw the floating glass header themselves (components/glass/GlassHeader).
          headerShown: false,
          ...headerChrome,
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.sans[600] },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="review/processing" options={{ gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
