import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useBridgeFonts, useTheme } from '@/bridge-design-system';
import '@/lib/nearby/task';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const ready = useBridgeFonts();
  if (!ready) return null;
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
  const { colors, layout, scheme } = useTheme();
  const { session, loading, recovering } = useSession();
  useEffect(() => { if (!loading && session && recovering) router.replace('/reset-password'); }, [loading, session, recovering]);
  useEffect(() => { if (!loading) SplashScreen.hideAsync().catch(() => {}); }, [loading]);
  if (loading) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? layout.previewMaxWidth : undefined, alignSelf: 'center', backgroundColor: colors.paper }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'none' }}>
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
            <Stack.Screen name="reset-password" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </SafeAreaView>
    </View>
  );
}
