import { Redirect, Tabs } from 'expo-router';

import { TabBar } from '@/components';
import { useSession } from '@/lib/session';

export default function TabLayout() {
  const { profile } = useSession();
  if (profile && !profile.onboarding_complete) return <Redirect href="/onboarding" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="network" options={{ title: 'Network' }} />
      <Tabs.Screen name="nearby" options={{ title: 'Nearby' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
