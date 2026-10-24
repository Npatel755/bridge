import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  role_title: string;
  career_stage: string;
  company: string;
  school: string;
  major: string;
  industry: string;
  city: string;
  region: string;
  languages: string[];
  collaboration_prefs: string[];
  working_style: string;
  availability: string;
  contact_method: string;
  networking_prefs: string[];
  portfolio_links: { label: string; url: string }[];
  onboarding_step: number;
  onboarding_complete: boolean;
  is_demo: boolean;
}

interface SessionState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState>({ session: null, profile: null, loading: true, refreshProfile: async () => {}, signOut: async () => {} });

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      // the auth trigger creates the profile row; retry briefly right after signup
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase.from('profiles').select('*').maybeSingle();
        if (cancelled) return;
        if (data) { setProfile(data as Profile); break; }
        await new Promise((r) => setTimeout(r, 300));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session?.user.id]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<SessionState>(() => ({
    session, profile, loading, refreshProfile,
    signOut: async () => { await supabase.auth.signOut(); },
  }), [session, profile, loading, refreshProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
