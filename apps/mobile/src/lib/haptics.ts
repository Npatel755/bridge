import { Platform } from 'react-native';

type H = typeof import('expo-haptics');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Haptics: H | null = Platform.OS === 'web' ? null : (require('expo-haptics') as H);

/** Haptics are always paired with a visible change by the caller. No-ops on web. */
export const haptic = {
  light: () => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  selection: () => Haptics?.selectionAsync().catch(() => {}),
  success: () => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};
