import { Archive, Home, Radio, User, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';
import { useNearbyOn } from '@/lib/nearby/state';

const ICONS: Record<string, LucideIcon> = { index: Home, network: Archive, nearby: Radio, profile: User };

/** Four tabs. card background, cardEdge hairline, accent for the active tab, coral dot on Nearby while on. */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigateToTab: (routeKey: string) => void;
}

export function TabBar({ state, descriptors, navigateToTab }: TabBarProps) {
  const { colors, space, sizes } = useTheme();
  const insets = useSafeAreaInsets();
  const nearbyOn = useNearbyOn();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.cardEdge, paddingBottom: insets.bottom, minHeight: 56 + insets.bottom }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const Icon = ICONS[route.name] ?? Home;
        const color = focused ? colors.action : colors.inkSoft;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${label}${route.name === 'nearby' && nearbyOn ? ', on' : ''}`}
            onPress={() => navigateToTab(route.key)}
            style={[styles.item, { minHeight: sizes.touch, paddingTop: space[2], paddingBottom: space[1] }]}>
            <View>
              <Icon size={22} strokeWidth={1.75} color={color} />
              {route.name === 'nearby' && nearbyOn ? <View style={[styles.dot, { backgroundColor: colors.nearby }]} /> : null}
            </View>
            <T variant="caption" style={{ color, marginTop: 2 }}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, alignItems: 'center' },
  dot: { position: 'absolute', top: -2, right: -4, width: 7, height: 7, borderRadius: 999 },
});
