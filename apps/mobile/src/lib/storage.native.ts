// iOS/Android: persist the auth session in expo-sqlite's AsyncStorage-compatible key/value store.
import Storage from 'expo-sqlite/kv-store';

export const sessionStorage = Storage as unknown as {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
