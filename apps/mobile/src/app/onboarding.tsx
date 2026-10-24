import { normalizeTag, tagLabel } from '@bridge/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CardSection, EntryCard, Field, Notice, Progress, Row, Screen, T, Tag, TagRow } from '@/components';
import { useTheme } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { requestForeground } from '@/lib/nearby';
import { useSession, type Profile } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const TOTAL = 6;
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
  const { space } = useTheme();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { profile, session, refreshProfile } = useSession();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<Profile>>({});
  const [tags, setTags] = useState<TagRowT[]>([]);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nearbyMsg, setNearbyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setForm(profile);
    setStep(edit ? 1 : Math.min(Math.max(profile.onboarding_step || 1, 1), TOTAL));
    supabase.from('profile_tags').select('id, kind, tag, label, status, discoverable').neq('status', 'rejected').then(({ data }) => setTags((data ?? []) as TagRowT[]));
  }, [profile?.id, edit]);

  const set = (k: keyof Profile, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const toggleList = (k: 'collaboration_prefs' | 'networking_prefs' | 'languages', v: string) => { const cur = (form[k] as string[] | undefined) ?? []; set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]); };
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
    <Screen cta={<Button variant="primary" size="lg" title={step === TOTAL ? 'Finish' : 'Continue'} loading={busy} onPress={next} />}>
      <Progress step={step} total={TOTAL} onBack={step > 1 ? () => setStep(step - 1) : edit ? () => router.back() : undefined} onSkip={!profile?.onboarding_complete ? skipAll : undefined} />
      <T variant="display" accessibilityRole="header">{titles[step][0]}</T>
      <T variant="body" color="inkSoft">{titles[step][1]}</T>
      {error ? <Notice>{error}</Notice> : null}

      {step === 1 ? (
        <Card>
          <Field label="Name" value={form.display_name ?? ''} onChangeText={(v) => set('display_name', v)} />
          <Field label="Role or title" value={form.role_title ?? ''} onChangeText={(v) => set('role_title', v)} placeholder="CS student, embedded engineer…" />
          <T variant="label" color="inkSoft">Career stage</T>
          <TagRow>{CAREER.map((c) => <Tag key={c} label={c} state={form.career_stage === c ? 'selected' : 'stated'} onPress={() => set('career_stage', c)} />)}</TagRow>
          <Field label="Company" value={form.company ?? ''} onChangeText={(v) => set('company', v)} />
          <Field label="School" value={form.school ?? ''} onChangeText={(v) => set('school', v)} />
          <Field label="Major or field" value={form.major ?? ''} onChangeText={(v) => set('major', v)} />
          <Field label="Industry" value={form.industry ?? ''} onChangeText={(v) => set('industry', v)} />
          <Row><View style={{ flex: 1 }}><Field label="City" value={form.city ?? ''} onChangeText={(v) => set('city', v)} /></View><View style={{ flex: 1 }}><Field label="Region" value={form.region ?? ''} onChangeText={(v) => set('region', v)} /></View></Row>
          <Field label="Short bio" value={form.bio ?? ''} onChangeText={(v) => set('bio', v)} multiline placeholder="What you are building or learning right now" />
        </Card>
      ) : null}

      {step === 2 ? (
        <>
          <Field placeholder="Search skills or add your own" value={custom} onChangeText={setCustom} onSubmitEditing={() => { if (custom.trim()) { toggleTag('skill', custom); setCustom(''); } }} returnKeyType="done" />
          <T variant="label" color="inkSoft">On your card</T>
          <TagRow>
            {tags.filter((t) => t.kind === 'skill' || t.kind === 'tool').map((t) => <Tag key={t.kind + t.tag} label={t.label} hint={t.hint ?? 'Working'} state="selected" onPress={() => cycleLevel(t.kind, t.tag)} accessibilityLabel={`${t.label}, ${t.hint ?? 'Working'}. Tap to change level, long press to remove`} />)}
            {tags.filter((t) => t.kind === 'skill').length === 0 ? <T variant="caption" color="inkSoft">Nothing yet. Tap a suggestion or type your own.</T> : null}
          </TagRow>
          {tags.filter((t) => t.kind === 'skill').length ? <Button variant="ghost" size="sm" title="Remove last" onPress={() => setTags((ts) => { const i = ts.map((t) => t.kind).lastIndexOf('skill'); return i < 0 ? ts : ts.filter((_, j) => j !== i); })} style={{ alignSelf: 'flex-start' }} /> : null}
          <T variant="label" color="inkSoft">{form.school ? `Common at ${form.school}` : 'Common skills'}</T>
          <TagRow>{COMMON_SKILLS.filter((s) => !has('skill', s) && (!custom || s.toLowerCase().includes(custom.toLowerCase()))).map((s) => <Tag key={s} label={s} onPress={() => toggleTag('skill', s)} />)}{custom.trim() && !has('skill', custom) ? <Tag label={`+ Add “${custom.trim()}”`} state="suggested" onPress={() => { toggleTag('skill', custom); setCustom(''); }} /> : null}</TagRow>
          <T variant="label" color="inkSoft" style={{ marginTop: space[2] }}>How your card looks to others</T>
          <EntryCard name={form.display_name || 'You'} role={[form.role_title, form.company || form.school].filter(Boolean).join(', ') || 'Add a role'}>
            <CardSection>{form.bio ? <T variant="note">{form.bio}</T> : null}<TagRow>{shown.map((t) => <Tag key={t.kind + t.tag} label={t.label} />)}</TagRow></CardSection>
          </EntryCard>
          <T variant="caption" color="inkSoft">Your email and private notes are never on your card.</T>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <T variant="label" color="inkSoft">Interests</T>
          <TagRow>{[...new Set([...COMMON_INTERESTS, ...tags.filter((t) => t.kind === 'interest').map((t) => t.label)])].map((s) => <Tag key={s} label={s} state={has('interest', s) ? 'selected' : 'stated'} onPress={() => toggleTag('interest', s)} />)}</TagRow>
          <Field placeholder="Add an interest" value={custom} onChangeText={setCustom} onSubmitEditing={() => { if (custom.trim()) { toggleTag('interest', custom); setCustom(''); } }} returnKeyType="done" />
          <T variant="label" color="inkSoft" style={{ marginTop: space[2] }}>Goals</T>
          <TagRow>{COMMON_GOALS.map((s) => <Tag key={s} label={s} state={has('goal', s) ? 'selected' : 'stated'} onPress={() => toggleTag('goal', s)} />)}</TagRow>
          <T variant="label" color="inkSoft" style={{ marginTop: space[2] }}>What you can offer</T>
          <TagRow>{COMMON_OFFERS.map((s) => <Tag key={s} label={s} state={has('offer', s) ? 'selected' : 'stated'} onPress={() => toggleTag('offer', s)} />)}</TagRow>
        </>
      ) : null}

      {step === 4 ? (
        <Card>
          <T variant="label" color="inkSoft">Open to</T>
          <TagRow>{COLLAB.map((c) => <Tag key={c} label={c} state={form.collaboration_prefs?.includes(c) ? 'selected' : 'stated'} onPress={() => toggleList('collaboration_prefs', c)} />)}</TagRow>
          <Field label="Working style" value={form.working_style ?? ''} onChangeText={(v) => set('working_style', v)} placeholder="Evenings and weekends, async first…" />
          <Field label="Availability" value={form.availability ?? ''} onChangeText={(v) => set('availability', v)} placeholder="A few hours a week" />
          <Field label="Preferred contact" value={form.contact_method ?? ''} onChangeText={(v) => set('contact_method', v)} placeholder="Email, Signal, LinkedIn message" />
          <Field label="Languages" value={(form.languages ?? []).join(', ')} onChangeText={(v) => set('languages', v.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="English, Spanish" />
          <T variant="label" color="inkSoft">Networking</T>
          <TagRow>{NETWORKING.map((c) => <Tag key={c} label={c} state={form.networking_prefs?.includes(c) ? 'selected' : 'stated'} onPress={() => toggleList('networking_prefs', c)} />)}</TagRow>
        </Card>
      ) : null}

      {step === 5 ? (
        <View style={{ gap: space[2] }}>
          <Card><T variant="name">LinkedIn export</T><T variant="body" color="inkSoft">Upload the Connections.csv LinkedIn gives you. Export importer, not a live connection.</T><Button size="sm" title="Import a LinkedIn export" onPress={() => { save(step); router.push('/plugins/linkedin-export'); }} style={{ alignSelf: 'flex-start' }} /></Card>
          <Card><T variant="name">CSV file</T><T variant="body" color="inkSoft">Any spreadsheet with names. You map the columns and review duplicates first.</T><Button size="sm" title="Import a CSV" onPress={() => { save(step); router.push('/import/csv'); }} style={{ alignSelf: 'flex-start' }} /></Card>
          <Card><T variant="name">Phone contacts</T><T variant="body" color="inkSoft">Pick the people you want. Nothing is uploaded until you choose them.</T><Button size="sm" title="Choose phone contacts" onPress={() => { save(step); router.push('/import/phone'); }} style={{ alignSelf: 'flex-start' }} /></Card>
        </View>
      ) : null}

      {step === 6 ? (
        <Card>
          <T variant="body">Bridge asks for location only while Nearby is on. Exact coordinates stay on the server and are removed when you turn it off. Other people only ever see a coarse band like “within ~100 m”.</T>
          {nearbyMsg ? <Notice tone="plain">{nearbyMsg}</Notice> : null}
          <Button title="Allow location while using the app" onPress={async () => { const c = await requestForeground(); setNearbyMsg(c === 'denied' ? 'Location is off. You can turn Nearby on later from the Nearby tab.' : c === 'unsupported' ? 'This device cannot share location.' : 'Location allowed. Turn Nearby on from the Nearby tab whenever you like.'); }} />
          <T variant="caption" color="inkSoft">You can skip this. Nearby stays off until you turn it on.</T>
        </Card>
      ) : null}
    </Screen>
  );
}
