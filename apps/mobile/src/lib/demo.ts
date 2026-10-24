import { supabase } from '@/lib/supabase';

/** Fictional demo account created by supabase/seed.sql (local stack only). */
export const DEMO_EMAIL = 'demo@bridge.local';
export const DEMO_PASSWORD = 'bridge-demo-2026';

export async function signInDemo() {
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (error) throw error;
}

export async function loadDemoNetwork(): Promise<{ contacts: number; notes: number }> {
  const { data, error } = await supabase.rpc('load_demo_network');
  if (error) throw error;
  return data as { contacts: number; notes: number };
}

export async function clearDemoData() {
  const { error } = await supabase.rpc('clear_demo_data');
  if (error) throw error;
}
