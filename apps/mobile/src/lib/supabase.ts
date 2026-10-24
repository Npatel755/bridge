import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Native: persist the session in expo-sqlite's AsyncStorage-compatible key/value store. Web: localStorage (default).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const storage = Platform.OS === 'web' ? undefined : (require('expo-sqlite/kv-store').default as Storage);

export const supabase = createClient(SUPABASE_URL, anonKey, {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
});

export const isConfigured = anonKey.length > 0;
