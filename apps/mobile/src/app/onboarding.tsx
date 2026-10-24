import { normalizeTag, tagLabel } from '@bridge/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { BText, Button, Evidence, Field, Group, PersonCard, ProgressBar, Row, Screen, ScreenHeader, Section, Tag, TagList, useTheme } from '@/bridge-design-system';
import { Notice, Stack, surnameInitial } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { requestForeground } from '@/lib/nearby';
import { useSession, type Profile } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const TOTAL = 6;
const asListInit = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const LEVELS = ['Learning', 'Working', 'Expert'] as const;
const COMMON_SKILLS = ['Embedded systems', 'Computer vision', 'Robotics', 'Hardware prototyping', 'Product design', 'UX research', 'Python', 'TypeScript', 'Mobile apps', 'Data science', 'Marketing', 'Manufacturing', 'Fundraising', 'Mechanical engineering', 'Firmware'];
const COMMON_INTERESTS = ['Cycling', 'Climbing', 'Startups', 'Open source', 'Music', 'Sustainability', 'Gaming', 'Photography', 'Running', 'Cooking'];
const COMMON_GOALS = ['Find a cofounder', 'Join a startup', 'Learn hardware', 'Find a mentor', 'Get into manufacturing', 'Ship a side project'];
const COMMON_OFFERS = ['Code review', 'Design feedback', 'Intros to my network', 'Hardware help', 'Career advice', 'Beta testing'];
const CAREER = ['Student', 'Early career', 'Mid career', 'Senior', 'Founder'];
const COLLAB = ['Cofounding', 'Side projects', 'Hackathons', 'Mentoring', 'Freelance', 'Hiring'];
const NETWORKING = ['Coffee chats', 'Intros', 'Events', 'Async only'];

interface TagRowT { id?: string; kind: string; tag: string; label: string; hint?: string; status: string; discoverable: boolean }

export default function Onboarding() {
  useTheme();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { profile, session, refreshProfile } = useSession();
  const [step, setStep] = useState(() => (edit || !profile ? 1 : Math.min(Math.max(profile.onboarding_step || 1, 1), TOTAL)));
  const [form, setForm] = useState<Partial<Profile>>(() => profile ?? {});
  const [tags, setTags] = useState<TagRowT[]>([]);
  const [custom, setCustom] = useState('');
  const [langText, setLangText] = useState(() => asListInit(profile?.languages).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nearbyMsg, setNearbyMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('profile_tags').select('id, kind, tag, label, status, discoverable').neq('status', 'rejected').then(({ data }) => setTags((data ?? []) as TagRowT[]));
  }, []);

  const set = (k: keyof Profile, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const toggleList = (k: 'collaboration_prefs' | 'networking_prefs' | 'languages', v: string) => { const cur = asList(form[k]); set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]); };
  const has = (kind: string, label: string) => tags.some((t) => t.kind === kind && t.tag === normalizeTag(label));
  const toggleTag = (kind: string, label: string) => {
    const tag = normalizeTag(label);
    setTags((ts) => (ts.some((t) => t.kind === kind && t.tag === tag) ? ts.filter((t) => !(t.kind === kind && t.tag === tag)) : [...ts, { kind, tag, label: tagLabel(tag) || label.trim(), status: 'confirmed', discoverable: true }]));
  };
  const cycleLevel = (kind: string, tag: string) => setTags((ts) => ts.map((t) => (t.kind === kind && t.tag === tag ? { ...t, hint: LEVELS[(LEVELS.indexOf((t.hint as typeof LEVELS[number]) ?? 'Working') + 1) % LEVELS.length] } : t)));

  async function save(nextStep: number, complete = false) {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const { id: _id, is_demo: _d, onboarding_complete, ...rest } = form as Profile;
      const { error: pe } = await supabase.from('profiles').update({ ...rest, onboarding_step: nextStep, onboarding_complete: complete || onboarding_complete || false, updated_at: new Date().toISOString() }).eq('id', session.user.id);
      if (pe) throw pe;
      const { data: existing } = await supabase.from('profile_tags').select('id, kind, tag').eq('source', 'self_reported');
      const keep = new Set(tags.map((t) => `${t.kind}:${t.tag}`));
      const gone = (existing ?? []).filter((e) => !keep.has(`${e.kind}:${e.tag}`)).map((e) => e.id);
      if (gone.length) await supabase.from('profile_tags').delete().in('id', gone);
      const rows = tags.map((t) => ({ owner_id: session.user.id, kind: t.kind, tag: t.tag, label: t.hint ? `${t.label}` : t.label, source: 'self_reported', status: 'confirmed', discoverable: t.discoverable }));
      if (rows.length) { const { error: te } = await supabase.from('profile_tags').upsert(rows, { onConflict: 'owner_id,kind,tag' }); if (te) throw te; }
      await refreshProfile();
      if (complete) router.replace('/'); else setStep(nextStep);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const next = () => (step === TOTAL ? save(TOTAL, true) : save(step + 1));
  const skipAll = () => save(step, true);
  const shown = useMemo(() => tags.filter((t) => t.discoverable && (t.kind === 'skill' || t.kind === 'interest')).slice(0, 6), [tags]);

  const titles: Record<number, [string, string]> = {
    1: ['Tell us about you', 'Role, company, and school help Bridge spot shared ground. All optional.'],
    2: ['What are you good at?', 'These go on your card. The more specific, the better your matches.'],
    3: ['What are you into, and after?', 'Interests make Nearby matches warmer. Goals and offers power reciprocity.'],
    4: ['How do you like to work?', 'Shown on your card so people know how to reach you.'],
    5: ['Bring in people you know', 'Optional. Imports stay private to you and are labeled with their source.'],
    6: ['Nearby', 'Optional. Notice people within a coarse distance who share a skill and an interest. Both must have it on.'],
  };

  return (
    <Screen footer={<Button variant="primary" size="sm" fullWidth label={busy ? 'Saving…' : step === TOTAL ? 'Finish' : 'Continue'} disabled={busy} onPress={next} />}>
      <ScreenHeader left={step > 1 ? <Button variant="ghost" size="sm" label="Back" onPress={() => setStep(step - 1)} /> : edit ? <Button variant="ghost" size="sm" label="Close" onPress={() => router.back()} /> : undefined}
        right={!profile?.onboarding_complete ? <Button variant="ghost" size="sm" label="Skip for now" onPress={skipAll} /> : undefined}
        title={titles[step][0]} subtitle={titles[step][1]} accessory={<ProgressBar value={step} max={TOTAL} label={`Step ${step} of ${TOTAL}`} />} />
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}

      {step === 1 ? (
        <>
          <Section label="About you">
            <Stack>
              <Field label="Name" value={form.display_name ?? ''} onChangeText={(v) => set('display_name', v)} />
              <Field label="Role or title" value={form.role_title ?? ''} onChangeText={(v) => set('role_title', v)} placeholder="CS student, embedded engineer…" />
              <Field label="Short bio" value={form.bio ?? ''} onChangeText={(v) => set('bio', v)} multiline placeholder="What you are building or learning right now" />
            </Stack>
          </Section>
          <Section label="Career stage"><TagList>{CAREER.map((c) => <Tag key={c} label={c} variant={form.career_stage === c ? 'selected' : 'stated'} onPress={() => set('career_stage', c)} />)}</TagList></Section>
          <Section label="Where">
            <Stack>
              <Field label="Company" value={form.company ?? ''} onChangeText={(v) => set('company', v)} />
              <Field label="School" value={form.school ?? ''} onChangeText={(v) => set('school', v)} />
              <Field label="Major or field" value={form.major ?? ''} onChangeText={(v) => set('major', v)} />
              <Field label="Industry" value={form.industry ?? ''} onChangeText={(v) => set('industry', v)} />
              <Field label="City" value={form.city ?? ''} onChangeText={(v) => set('city', v)} />
              <Field label="Region" value={form.region ?? ''} onChangeText={(v) => set('region', v)} />
            </Stack>
          </Section>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Section label="Search or add a skill">
            <Field label="Skill" placeholder="Search skills or add your own" value={custom} onChangeText={setCustom} onSubmitEditing={() => { if (custom.trim()) { toggleTag('skill', custom); setCustom(''); } }} returnKeyType="done" accessibilityLabel="Search skills or add your own" />
          </Section>
          <Section label="On your card" action={tags.filter((t) => t.kind === 'skill').length ? <Button variant="ghost" size="sm" label="Remove last" onPress={() => setTags((ts) => { const i = ts.map((t) => t.kind).lastIndexOf('skill'); return i < 0 ? ts : ts.filter((_, j) => j !== i); })} /> : undefined}>
            <TagList>
              {tags.filter((t) => t.kind === 'skill' || t.kind === 'tool').map((t) => <Tag key={t.kind + t.tag} label={`${t.label} · ${t.hint ?? 'Working'}`} variant="selected" onPress={() => cycleLevel(t.kind, t.tag)} onRemove={() => toggleTag(t.kind, t.label)} />)}
            </TagList>
            {tags.filter((t) => t.kind === 'skill').length === 0 ? <BText variant="secondary" color="inkSoft">Nothing yet. Tap a suggestion or type your own.</BText> : null}
          </Section>
          <Section label={form.school ? `Common at ${form.school}` : 'Common skills'}>
            <TagList>{COMMON_SKILLS.filter((s) => !has('skill', s) && (!custom || s.toLowerCase().includes(custom.toLowerCase()))).map((s) => <Tag key={s} label={s} onPress={() => toggleTag('skill', s)} />)}{custom.trim() && !has('skill', custom) ? <Tag label={`+ Add “${custom.trim()}”`} variant="suggested" onPress={() => { toggleTag('skill', custom); setCustom(''); }} /> : null}</TagList>
          </Section>
          <Section label="How your card looks to others">
            <PersonCard name={form.display_name || 'You'} role={[form.role_title, form.company || form.school].filter(Boolean).join(', ') || 'Add a role'} tab={surnameInitial(form.display_name || 'You')} tabTone="card">
              {form.bio ? <Evidence quote={form.bio} marks={[]} source="Your bio" /> : null}
              {shown.length ? <TagList>{shown.map((t) => <Tag key={t.kind + t.tag} label={t.label} />)}</TagList> : null}
              <BText variant="caption" color="inkFaint">Your email and private notes are never on your card.</BText>
            </PersonCard>
          </Section>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Section label="Interests">
            <Stack>
              <TagList>{[...new Set([...COMMON_INTERESTS, ...tags.filter((t) => t.kind === 'interest').map((t) => t.label)])].map((s) => <Tag key={s} label={s} variant={has('interest', s) ? 'selected' : 'stated'} onPress={() => toggleTag('interest', s)} />)}</TagList>
              <Field label="Interest" placeholder="Add an interest" value={custom} onChangeText={setCustom} onSubmitEditing={() => { if (custom.trim()) { toggleTag('interest', custom); setCustom(''); } }} returnKeyType="done" accessibilityLabel="Add an interest" />
            </Stack>
          </Section>
          <Section label="Goals"><TagList>{COMMON_GOALS.map((s) => <Tag key={s} label={s} variant={has('goal', s) ? 'selected' : 'stated'} onPress={() => toggleTag('goal', s)} />)}</TagList></Section>
          <Section label="What you can offer"><TagList>{COMMON_OFFERS.map((s) => <Tag key={s} label={s} variant={has('offer', s) ? 'selected' : 'stated'} onPress={() => toggleTag('offer', s)} />)}</TagList></Section>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <Section label="Open to"><TagList>{COLLAB.map((c) => <Tag key={c} label={c} variant={asList(form.collaboration_prefs).includes(c) ? 'selected' : 'stated'} onPress={() => toggleList('collaboration_prefs', c)} />)}</TagList></Section>
          <Section label="How you work">
            <Stack>
              <Field label="Working style" value={form.working_style ?? ''} onChangeText={(v) => set('working_style', v)} placeholder="Evenings and weekends, async first…" />
              <Field label="Availability" value={form.availability ?? ''} onChangeText={(v) => set('availability', v)} placeholder="A few hours a week" />
              <Field label="Preferred contact" value={form.contact_method ?? ''} onChangeText={(v) => set('contact_method', v)} placeholder="Email, Signal, LinkedIn message" />
              <Field label="Languages" value={langText} onChangeText={(v) => { setLangText(v); set('languages', v.split(',').map((s) => s.trim()).filter(Boolean)); }} placeholder="English, Spanish" />
            </Stack>
          </Section>
          <Section label="Networking"><TagList>{NETWORKING.map((c) => <Tag key={c} label={c} variant={asList(form.networking_prefs).includes(c) ? 'selected' : 'stated'} onPress={() => toggleList('networking_prefs', c)} />)}</TagList></Section>
        </>
      ) : null}

      {step === 5 ? (
        <Section label="Sources, all private to you">
          <Group>
            <Row title="LinkedIn export" titleVariant="label" subtitle="Upload the Connections.csv LinkedIn gives you. Export importer, not a live connection." chevron onPress={() => { save(step); router.push('/plugins/linkedin-export'); }} />
            <Row title="CSV file" titleVariant="label" subtitle="Any spreadsheet with names. You map the columns and review duplicates first." chevron onPress={() => { save(step); router.push('/import/csv'); }} />
            <Row title="Phone contacts" titleVariant="label" subtitle="Pick the people you want. Nothing is uploaded until you choose them." chevron onPress={() => { save(step); router.push('/import/phone'); }} />
          </Group>
        </Section>
      ) : null}

      {step === 6 ? (
        <Section label="Nearby">
          <Stack>
            <BText variant="body">Bridge asks for location only while Nearby is on. Exact coordinates stay on the server and are removed when you turn it off. Other people only ever see a coarse band like “within ~100 m”.</BText>
            {nearbyMsg ? <Notice tone="confirmInk">{nearbyMsg}</Notice> : null}
            <Button size="sm" fullWidth label="Allow location while using the app" onPress={async () => { const c = await requestForeground(); setNearbyMsg(c === 'denied' ? 'Location is off. You can turn Nearby on later from the Nearby tab.' : c === 'unsupported' ? 'This device cannot share location.' : 'Location allowed. Turn Nearby on from the Nearby tab whenever you want.'); }} />
            <BText variant="caption" color="inkFaint">You can skip this. Nearby stays off until you turn it on.</BText>
          </Stack>
        </Section>
      ) : null}
    </Screen>
  );
}
