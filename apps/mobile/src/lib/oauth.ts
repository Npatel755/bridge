import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Google sign-in. Web lets supabase-js redirect the page; native opens the system auth sheet
 * and finishes the PKCE/implicit exchange from the redirect URL (bridge://).
 */
export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) throw error;
    return;
  }
  const redirectTo = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in is not configured.');
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return;
  const url = new URL(res.url);
  const code = url.searchParams.get('code');
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const errDesc = url.searchParams.get('error_description') ?? hash.get('error_description');
  if (errDesc) throw new Error(errDesc);
  if (code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(code);
    if (e) throw e;
    return;
  }
  const access_token = hash.get('access_token'), refresh_token = hash.get('refresh_token');
  if (access_token && refresh_token) {
    const { error: e } = await supabase.auth.setSession({ access_token, refresh_token });
    if (e) throw e;
    return;
  }
  throw new Error('Google sign-in did not return a session.');
}
