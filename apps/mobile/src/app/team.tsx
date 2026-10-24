import type { TeamRole } from '@bridge/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, EmptyRow, Evidence, Field, Group, PersonCard, Row, Screen, ScreenHeader, Section, Tag, TagList, useTheme } from '@/bridge-design-system';
import { Back, Loading, Notice, Stack, surnameInitial } from '@/components/shared';
import { routeInfo } from '@/lib/relationship';
import { api, errorMessage, type TeamResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type EditableRole = Pick<TeamRole, 'title' | 'tags'>;

export default function Team() {
  useTheme();
  const params = useLocalSearchParams<{ description?: string; id?: string }>();
  const [description, setDescription] = useState(params.description ?? '');
  const [plan, setPlan] = useState<TeamResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<EditableRole[]>([]);
  const [newRole, setNewRole] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) supabase.from('project_requests').select('description, plan, id').eq('id', params.id).single().then(({ data }) => { if (data?.plan) { setDescription(data.description); setPlan({ ...(data.plan as TeamResponse), requestId: data.id, reciprocal: (data.plan as TeamResponse).reciprocal ?? [] }); } });
    else if (params.description) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, params.description]);

  async function run(custom?: EditableRole[]) {
    if (!description.trim()) return;
    setBusy(true); setError(null); setEditing(false);
    try { const r = await api.team(description.trim(), custom, plan?.requestId); setPlan(r); setRoles(r.roles.map((m) => ({ title: m.role.title, tags: m.role.tags }))); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const filled = plan?.roles.filter((r) => r.filled) ?? [];
  const title = description.length > 40 ? description.slice(0, 40).replace(/\s\S*$/, '') + '…' : description;

  const ctaDraft = () => router.push({ pathname: '/draft', params: { contactId: filled.map((r) => r.candidates[0].contactId).join(','), ask: filled.map((r) => r.candidates[0].suggestedAsk).join('|') } });
  return (
    <Screen footer={plan && filled.length && !editing ? <Button variant="primary" size="sm" fullWidth label={`Draft asks for all ${filled.length}`} onPress={ctaDraft} /> : undefined}>
      <ScreenHeader left={<Back />} right={plan && !editing ? <Button variant="ghost" size="sm" label="Edit roles" onPress={() => setEditing(true)} /> : undefined}
        title={plan && !editing ? title : 'Build a team'} subtitle={plan && !editing ? `${plan.roles.length} kinds of help. ${filled.length} have someone from your cards. ${plan.mode === 'llm' ? 'Roles suggested with AI, matches from your cards.' : 'Roles from keyword rules, matches from your cards.'}` : 'Describe what you want to build. Bridge splits it into roles and looks for each in your cards.'} />
      {!plan || editing ? (
        <Section label="Your idea">
          <Stack>
            <Field label="What you are building" value={description} onChangeText={setDescription} multiline placeholder="A smart bike light with a companion app, sold to commuters" accessibilityLabel="Your idea" />
            {!editing ? <Button variant="primary" size="sm" fullWidth label={busy ? 'Matching…' : 'Find roles and people'} disabled={!description.trim() || busy} onPress={() => run()} /> : null}
          </Stack>
        </Section>
      ) : null}
      {busy ? <Loading label="Splitting the project into roles and matching your cards…" /> : null}
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}

      {editing ? (
        <Section label="Roles">
          <Stack>
            <Group>
              {roles.map((r, i) => <Row key={i} title={r.title} titleVariant="label" subtitle={r.tags.join(', ')} trailing={<Button variant="ghost" size="sm" label="Remove" onPress={() => setRoles((x) => x.filter((_, j) => j !== i))} />} />)}
            </Group>
            <Field label="Role" placeholder="Add a role, e.g. Cyclists to test it" value={newRole} onChangeText={setNewRole} accessibilityLabel="Add a role" />
            <Button size="sm" fullWidth label="Add role" disabled={!newRole.trim()} onPress={() => { setRoles((x) => [...x, { title: newRole.trim(), tags: [newRole.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')] }]); setNewRole(''); }} />
            <Button variant="primary" size="sm" fullWidth label={busy ? 'Matching…' : 'Match these roles'} disabled={busy} onPress={() => run(roles)} />
          </Stack>
        </Section>
      ) : null}

      {plan && !editing ? (
        <>
          {plan.roles.map((m) => {
            const c = m.candidates[0];
            const cite = c?.citations.find((x) => x.excerpt) ?? c?.citations[0];
            const excerpt = cite?.excerpt ?? cite?.value ?? c?.why ?? '';
            return (
              <Section key={m.role.id} label={m.role.title} action={<Tag label={m.filled ? 'Someone from your cards' : 'Open'} variant={m.filled ? 'stated' : 'suggested'} />}>
                {m.filled && c ? (
                  <Stack>
                    <PersonCard name={c.name} role={c.headline ?? c.howYouKnow} tab={surnameInitial(c.name)} tabTone="highlight" route={routeInfo(c.route, { howYouKnow: c.howYouKnow })}>
                      {excerpt ? <Evidence quote={excerpt} marks={c.matchedTags.map((t) => t.label).filter((l) => excerpt.toLowerCase().includes(l.toLowerCase()))} source={`${cite?.sourceLabel ?? 'Your note'}${cite?.date ? `, ${cite.date.slice(0, 10)}` : ''} · private to you`} /> : null}
                      <Row title={c.suggestedAsk} titleVariant="note" overline="Suggested ask" />
                      <Button size="sm" variant="primary" label="Open card" onPress={() => router.push({ pathname: '/contact/[id]', params: { id: c.contactId } })} />
                    </PersonCard>
                    {m.candidates.length > 1 ? <TagList>{m.candidates.slice(1, 4).map((x) => <Tag key={x.contactId} label={`Also: ${x.name}`} onPress={() => router.push({ pathname: '/contact/[id]', params: { id: x.contactId } })} />)}</TagList> : null}
                  </Stack>
                ) : (
                  <Group dashed>
                    <EmptyRow title={`No one in your cards mentions ${m.role.tags.slice(0, 2).map((t) => t.replace(/-/g, ' ')).join(' or ')} yet.`} actionLabel="Ask who they know" onPress={() => router.push({ pathname: '/ask', params: { q: `Who could introduce me to someone who knows ${m.role.tags[0]?.replace(/-/g, ' ')}?` } })} />
                    <Row title="Add a note about someone" titleVariant="label" chevron onPress={() => router.push('/note/new')} />
                  </Group>
                )}
              </Section>
            );
          })}
          {plan.reciprocal.length ? (
            <Section label="You could help too">
              <Group>
                {plan.reciprocal.slice(0, 3).map((o) => <Row key={o.contactId} title={`${o.name.split(' ')[0]} wants ${o.youCanHelp[0]?.need.toLowerCase()}. You offer ${o.youCanHelp[0]?.yourMatch.join(', ')}.`} titleVariant="note" subtitle={`Their goal, ${o.youCanHelp[0]?.source}, ${o.youCanHelp[0]?.date.slice(0, 10)}.`} chevron onPress={() => router.push({ pathname: '/contact/[id]', params: { id: o.contactId } })} />)}
              </Group>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
