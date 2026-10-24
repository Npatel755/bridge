import { Redirect, Tabs, useSegments } from 'expo-router';
import { House, Radar, UserRound, Waypoints } from 'lucide-react-native';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nearbyBadgeStyle, tabBarOptions, useTheme } from '@/bridge-design-system';
import { useNearbyOn } from '@/lib/nearby/state';
import { useSession } from '@/lib/session';

export default function TabLayout() {
  const { profile } = useSession();
  const { colors, sizes, type, space } = useTheme();
  const nearbyOn = useNearbyOn();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const options = tabBarOptions(colors);
  const isNearby = segments.some((s) => s === 'nearby');
  const icon = (Icon: typeof House) =>
    function TabIcon({ focused }: { focused: boolean }) {
      return <Icon size={sizes.iconTab} color={focused ? colors.ink : colors.inkSoft} strokeWidth={sizes.iconStroke} />;
    };
  if (profile && !profile.onboarding_complete) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        ...options,
        tabBarStyle: {
          ...options.tabBarStyle,
          height: Math.max(sizes.tabBar, sizes.iconTab + type.navigation.lineHeight * fontScale + space[4]) + insets.bottom,
          paddingBottom: space[2] + insets.bottom,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon(House) }} />
      <Tabs.Screen name="network" options={{ title: 'Network', tabBarIcon: icon(Waypoints) }} />
      <Tabs.Screen name="nearby" options={{ title: 'Nearby', tabBarIcon: icon(Radar), tabBarBadge: nearbyOn && isNearby ? '' : undefined, tabBarBadgeStyle: nearbyBadgeStyle(colors) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon(UserRound) }} />
    </Tabs>
  );
}
