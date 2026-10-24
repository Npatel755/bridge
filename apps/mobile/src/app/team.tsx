import type { TeamRole } from '@bridge/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Flag, Loading, Notice, ResultCard, Row, Screen, T, Tag, TagRow, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { api, errorMessage, type TeamResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type EditableRole = Pick<TeamRole, 'title' | 'tags'>;

export default function Team() {
  const { colors, space } = useTheme();
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
  }, [params.id, params.description]);

  async function run(custom?: EditableRole[]) {
    if (!description.trim()) return;
    setBusy(true); setError(null); setEditing(false);
    try { const r = await api.team(description.trim(), custom, plan?.requestId); setPlan(r); setRoles(r.roles.map((m) => ({ title: m.role.title, tags: m.role.tags }))); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  const filled = plan?.roles.filter((r) => r.filled) ?? [];
  const title = description.length > 40 ? description.slice(0, 40).replace(/\s\S*$/, '') + '…' : description;

  return (
    <>
      <TopBar onBack={() => router.back()} right={plan && !editing ? <Button variant="ghost" size="sm" title="Edit roles" onPress={() => setEditing(true)} /> : null} />
      <Screen cta={plan && filled.length && !editing ? <Button variant="primary" size="lg" title={`Draft asks for all ${filled.length}`} onPress={() => router.push({ pathname: '/draft', params: { contactId: filled.map((r) => r.candidates[0].contactId).join(','), ask: filled.map((r) => r.candidates[0].suggestedAsk).join('|') } })} /> : !plan ? <Button variant="primary" size="lg" title="Find my team" loading={busy} disabled={!description.trim()} onPress={() => run()} /> : undefined}>
        <T variant="caption" color="inkSoft">Build my team</T>
        {plan && !editing ? <T variant="display" accessibilityRole="header">{title}</T> : <T variant="display" accessibilityRole="header">What are you building?</T>}
        {!plan || editing ? <Field value={description} onChangeText={setDescription} multiline placeholder="A smart bike light with a companion app, sold to commuters" /> : null}
        {plan && !editing ? <T variant="body" color="inkSoft">{plan.roles.length} kinds of help. {filled.length} have someone from your cards.</T> : null}
        {busy ? <Loading label="Splitting the project into roles and matching your cards…" /> : null}
        {error ? <Notice>{error}</Notice> : null}

        {editing ? (
          <Card>
            <T variant="name">Roles</T>
            {roles.map((r, i) => (
              <Row key={i} between>
                <View style={{ flex: 1 }}><T variant="body">{r.title}</T><T variant="caption" color="inkSoft">{r.tags.join(', ')}</T></View>
                <Button variant="ghost" size="sm" title="Remove" onPress={() => setRoles((x) => x.filter((_, j) => j !== i))} />
              </Row>
            ))}
            <Row><View style={{ flex: 1 }}><Field placeholder="Add a role, e.g. Cyclists to test it" value={newRole} onChangeText={setNewRole} /></View><Button size="sm" title="Add" disabled={!newRole.trim()} onPress={() => { setRoles((x) => [...x, { title: newRole.trim(), tags: [newRole.trim().toLowerCase().replace(/\s+/g, '-')] }]); setNewRole(''); }} /></Row>
            <Button variant="primary" title="Match these roles" loading={busy} onPress={() => run(roles)} />
          </Card>
        ) : null}

        {plan && !editing ? (
          <>
            <Flag label={plan.mode === 'llm' ? 'Roles suggested with AI, matches from your cards' : 'Roles from keyword rules, matches from your cards'} />
            {plan.roles.map((m) => (
              <View key={m.role.id} style={{ marginTop: space[2] }}>
                <Row between style={{ marginBottom: space[2] }}>
                  <T variant="label" style={{ color: m.filled ? colors.ink : colors.inkSoft }}>{m.role.title}</T>
                  <Flag label={m.filled ? 'Someone from your cards' : 'Open'} tone={m.filled ? 'default' : 'caution'} />
                </Row>
                {m.filled ? (
                  <View>
                    <ResultCard rec={m.candidates[0]} ask={m.candidates[0].suggestedAsk} expanded showNotes={false} />
                    {m.candidates.length > 1 ? <TagRow>{m.candidates.slice(1, 4).map((c) => <Tag key={c.contactId} label={`Also: ${c.name}`} onPress={() => router.push({ pathname: '/contact/[id]', params: { id: c.contactId } })} />)}</TagRow> : null}
                  </View>
                ) : (
                  <Card dashed>
                    <T variant="body">No one in your cards mentions {m.role.tags.slice(0, 2).map((t) => t.replace(/-/g, ' ')).join(' or ')} yet.</T>
                    <Row wrap>
                      <Button size="sm" title="Ask your cards who they know" onPress={() => router.push({ pathname: '/ask', params: { q: `Who could introduce me to someone who knows ${m.role.tags[0]?.replace(/-/g, ' ')}?` } })} />
                      <Button variant="ghost" size="sm" title="Add a note" onPress={() => router.push('/note/new')} />
                    </Row>
                  </Card>
                )}
              </View>
            ))}
            {plan.reciprocal.length ? (
              <View style={{ gap: space[2], marginTop: space[4] }}>
                <T variant="title">You could help too</T>
                {plan.reciprocal.slice(0, 3).map((o) => (
                  <Card key={o.contactId}>
                    <T variant="note">{o.name.split(' ')[0]} wants {o.youCanHelp[0]?.need.toLowerCase()}. You offer {o.youCanHelp[0]?.yourMatch.join(', ')}.</T>
                    <T variant="caption" color="inkSoft">Their goal, {o.youCanHelp[0]?.source}, {o.youCanHelp[0]?.date.slice(0, 10)}. Your offer, your profile.</T>
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </Screen>
    </>
  );
}
