import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { Newsreader_400Regular, Newsreader_500Medium, Newsreader_600SemiBold, useFonts } from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
  // A failed font load falls back to system fonts rather than blocking the app.
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
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
        <Stack.Screen name="review/processing" options={{ gestureEnabled: false, headerBackVisible: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
