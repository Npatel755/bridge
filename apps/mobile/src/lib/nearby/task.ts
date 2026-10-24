import { Platform } from 'react-native';

import { publishSample } from '@/lib/nearby/publish';

export const NEARBY_TASK = 'bridge-nearby-location';

// Background location task: must be defined at module top level (expo-task-manager). Not available on web.
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
  TaskManager.defineTask(NEARBY_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number }[] } | null)?.locations ?? [];
    const last = locations[locations.length - 1];
    if (!last) return;
    await publishSample({ lat: last.coords.latitude, lng: last.coords.longitude, accuracyM: last.coords.accuracy ?? 999, sampledAt: new Date(last.timestamp) }, false);
  });
}
