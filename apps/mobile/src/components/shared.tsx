import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { BText, Button, Evidence, PersonCard, PersonRow, RouteKind, Tag, TagList, useTheme } from '@/bridge-design-system';

/** View model every screen hands to the kit's person components. */
export interface PersonView {
  id: string;
  name: string;
  role: string;
  route: { kind: RouteKind; label: string };
  quote?: string;
  source?: string;
  marks?: string[];
  stale?: boolean;
  skills?: string[];
}

export const surnameInitial = (name: string) => (name.trim().split(/\s+/).pop()?.[0] ?? '#').toUpperCase();
export const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
export const rowReason = (p: PersonView) => [p.role, p.source].filter(Boolean).join('. ') + (p.stale ? '; worth checking' : '');

export function Back({ fallback = '/(tabs)' }: { fallback?: string }) {
  const { colors, sizes } = useTheme();
  return (
    <Button size="sm" label="Back" variant="ghost" icon={<ArrowLeft size={sizes.icon} color={colors.action} strokeWidth={sizes.iconStroke} />}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))} />
  );
}

export function Stack({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return <View style={{ gap: space[3] }}>{children}</View>;
}

export function Notice({ children, tone = 'inkSoft' }: { children: string; tone?: 'inkSoft' | 'dangerInk' | 'confirmInk' | 'cautionInk' | 'nearbyInk' }) {
  return <BText variant="secondary" color={tone} accessibilityLiveRegion="polite">{children}</BText>;
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[3] }} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.inkSoft} />
      <BText variant="secondary" color="inkSoft">{label}</BText>
    </View>
  );
}

export function FocusPerson({ person, action, compact = false, mark = true, front = false, tabTone = 'highlight' as 'highlight' | 'card' | 'nearby' }: {
  person: PersonView; action?: ReactNode; compact?: boolean; mark?: boolean; front?: boolean; tabTone?: 'highlight' | 'card' | 'nearby';
}) {
  return (
    <PersonCard name={person.name} role={person.role} tab={surnameInitial(person.name)} tabTone={tabTone} route={person.route} nameVariant={compact ? 'rowName' : 'name'} front={front}>
      {person.quote ? (
        <Evidence quote={person.quote} marks={mark && !person.stale ? (person.marks ?? []) : []} source={`${person.source ?? 'Your note'} · private to you`} stale={person.stale} />
      ) : null}
      {!compact && person.skills?.length ? (
        <TagList>{person.skills.slice(0, 3).map((s) => <Tag key={s} label={s} />)}</TagList>
      ) : null}
      {action}
    </PersonCard>
  );
}

export function ContactRow({ person, onPress, overline, tab, tabOffset }: { person: PersonView; onPress?: () => void; overline?: string; tab?: string; tabOffset?: number }) {
  return (
    <PersonRow name={person.name} reason={rowReason(person)} stale={person.stale} overline={overline} route={person.route} tab={tab} tabOffset={tabOffset}
      onPress={onPress ?? (() => router.push({ pathname: '/contact/[id]', params: { id: person.id } }))} />
  );
}
