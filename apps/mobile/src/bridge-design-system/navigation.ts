// Tab bar styling for Expo Router <Tabs screenOptions={tabBarOptions(colors)} />.
// Four tabs: Home, Network, Nearby, Profile. Lucide icons at 22px, strokeWidth 1.75.
// While Nearby is on, show a small rose badge on the Nearby tab (tabBarBadge with tabBarBadgeStyle below).
import type { Colors } from "./theme";
import { type, sizes, radius, space } from "./theme";

export function tabBarOptions(colors: Colors) {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.ink,
    tabBarInactiveTintColor: colors.inkSoft,
    tabBarStyle: {
      backgroundColor: colors.card,
      borderTopColor: colors.cardEdge,
      borderTopWidth: sizes.border,
      minHeight: sizes.tabBar,
      paddingTop: space[2],
    },
    tabBarLabelStyle: type.navigation,
    tabBarItemStyle: { minHeight: sizes.touch },
  } as const;
}

export function nearbyBadgeStyle(colors: Colors) {
  return {
    backgroundColor: colors.nearby,
    minWidth: sizes.badge,
    maxHeight: sizes.badge,
    borderRadius: radius.chip,
    top: space[1],
  } as const;
}
