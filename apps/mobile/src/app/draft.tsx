import { draftOutreach } from '@bridge/core';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { Button, Field, Group, Row, Screen, ScreenHeader, Section, Tag, TagList } from '@/bridge-design-system';
import { Loading, Notice, Stack } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { RELATIONSHIP_LABEL } from '@/lib/relationship';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface D { contactId: string; name: string; email: string | null; subject: string; body: string; context: string }

export default function Draft() {
  const p = useLocalSearchParams<{ contactId: string; ask?: string; via?: string; intro?: string }>();
  const { profile, session } = useSession();
  const [drafts, setDrafts] = useState<D[]>([]);
  const [i, setI] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const ids = (p.contactId ?? '').split(',').filter(Boolean);
        const asks = (p.ask ?? '').split('|');
        const { data: contacts, error } = await supabase.from('contacts').select('id, name, email, how_met, met_at, relationship, headline').in('id', ids);
        if (error) throw error;
        const via = p.via ? (await supabase.from('contacts').select('name').eq('id', p.via).maybeSingle()).data?.name ?? null : null;
        setDrafts(ids.map((id, k) => {
          const c = contacts?.find((x) => x.id === id);
          if (!c) return null;
          const ask = asks[k] || asks[0] || `Could we find 20 minutes this week?`;
          const context = [RELATIONSHIP_LABEL[c.relationship] ?? c.relationship, c.how_met].filter(Boolean).join(', ');
          const d = draftOutreach({ senderName: profile?.display_name ?? 'me', recipientName: via ?? c.name, howMet: c.how_met, relationshipContext: context, ask, route: p.intro ? { type: 'introduction', description: `via ${via}` } : { type: 'direct', description: 'direct' }, targetName: p.intro ? c.name : null });
          return { contactId: id, name: via && p.intro ? via : c.name, email: c.email, subject: d.subject, body: d.body, context };
        }).filter((x): x is D => !!x));
      } catch (e) { setError(errorMessage(e)); }
    })();
  }, [p.contactId, p.ask, p.via, p.intro, profile?.display_name]);

  const d = drafts[i];
  const update = (patch: Partial<D>) => setDrafts((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  async function record(st: 'copied' | 'sent_manually' | 'draft') {
    if (!session || !d) return;
    await supabase.from('outreach_drafts').insert({ owner_id: session.user.id, contact_id: d.contactId, via_contact_id: p.intro && p.via ? p.via : null, subject: d.subject, body: d.body, purpose: p.ask?.split('|')[0] ?? '', status: st });
  }
  async function copy() { if (!d) return; await Clipboard.setStringAsync(`${d.subject}\n\n${d.body}`); await record('copied'); setStatus('Copied. Paste it wherever you talk to them.'); }
  async function openMail() { if (!d) return; await record('sent_manually'); Linking.openURL(`mailto:${d.email ?? ''}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`); }
  async function openSms() { if (!d) return; await record('sent_manually'); Linking.openURL(`sms:${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(d.body)}`); }

  return (
    <Screen footer={d ? <Button variant="primary" size="sm" fullWidth label="Copy message" onPress={copy} /> : undefined}>
      <ScreenHeader left={<Button variant="ghost" size="sm" label="Close" onPress={() => router.back()} />} title={d ? `To ${d.name}` : 'Draft'} subtitle={d ? `Grounded in what you recorded: ${d.context || 'your card for them'}. Edit anything before you send it yourself. Bridge never sends anything for you.` : 'Bridge never sends anything for you.'} />
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}
      {!d && !error ? <Loading /> : null}
      {drafts.length > 1 ? <Section label="Drafts"><TagList>{drafts.map((x, k) => <Tag key={x.contactId} label={x.name.split(' ')[0]} variant={k === i ? 'selected' : 'stated'} onPress={() => setI(k)} />)}</TagList></Section> : null}
      {d ? (
        <>
          <Section label="Your message">
            <Stack>
              <Field label="Subject" value={d.subject} onChangeText={(v) => update({ subject: v })} />
              <Field label="Message" value={d.body} onChangeText={(v) => update({ body: v })} multiline />
              {status ? <Notice tone="confirmInk">{status}</Notice> : null}
            </Stack>
          </Section>
          <Section label="Send it yourself">
            <Group>
              <Row title={d.email ? 'Open in Mail' : 'Open in Mail (no email on card)'} titleVariant="label" chevron onPress={openMail} />
              {Platform.OS !== 'web' ? <Row title="Open in Messages" titleVariant="label" chevron onPress={openSms} /> : null}
              <Row title="Save as draft" titleVariant="label" subtitle="Keeps it on their card." chevron onPress={async () => { await record('draft'); setStatus('Saved to the card.'); }} />
            </Group>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
