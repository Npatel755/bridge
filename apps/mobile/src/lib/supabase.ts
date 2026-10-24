import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { sessionStorage } from '@/lib/storage';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// storage.native.ts uses expo-sqlite's key/value store; storage.ts (web) leaves supabase-js on localStorage.
export const supabase = createClient(SUPABASE_URL, anonKey, {
  auth: { storage: sessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
});

export const isConfigured = anonKey.length > 0;
