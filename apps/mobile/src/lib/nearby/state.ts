import { useSyncExternalStore } from 'react';

// Tiny shared store so the tab bar can show the rose dot while Nearby is on.
let on = false;
const listeners = new Set<() => void>();
export function setNearbyOn(v: boolean) { if (on !== v) { on = v; listeners.forEach((l) => l()); } }
export function useNearbyOn() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => on, () => on);
}
