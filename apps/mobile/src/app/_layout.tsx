import { InterTight_400Regular, InterTight_500Medium } from '@expo-google-fonts/inter-tight';
import { Literata_400Regular, Literata_500Medium, useFonts } from '@expo-google-fonts/literata';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { palette } from '@/constants/theme';
import '@/lib/nearby/task';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Literata_400Regular, Literata_500Medium, InterTight_400Regular, InterTight_500Medium });
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <Navigation />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigation() {
  const scheme = useColorScheme();
  const { session, loading } = useSession();
  const colors = scheme === 'dark' ? palette.dark : palette.light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: colors.action, background: colors.paper, card: colors.card, text: colors.ink, border: colors.cardEdge } };
  useEffect(() => { if (!loading) SplashScreen.hideAsync().catch(() => {}); }, [loading]);
  if (loading) return null;
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="ask" />
          <Stack.Screen name="team" />
          <Stack.Screen name="contact/[id]" />
          <Stack.Screen name="contact/edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="note/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="import/csv" />
          <Stack.Screen name="import/phone" />
          <Stack.Screen name="draft" options={{ presentation: 'modal' }} />
          <Stack.Screen name="plugins/index" />
          <Stack.Screen name="plugins/[id]" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
