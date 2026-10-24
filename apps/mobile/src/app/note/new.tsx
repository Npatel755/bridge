import type { ExtractedPerson, NoteExtraction } from '@bridge/core';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { Mic, Square } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { BText, Button, EmptyRow, Group, MarkedText, Row, RouteLine, Screen, ScreenHeader, Section, Tag, TagList, Toggle, useTheme } from '@/bridge-design-system';
import { Notice, Stack } from '@/components/shared';
import { api, errorMessage } from '@/lib/api';
import { addClaims, addEvidence, createContact } from '@/lib/contacts-data';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { startDictation, voiceSupport } from '@/lib/voice';

type Choice = { contactId: string | null; name: string } | null; // null = unchecked

export default function NewNote() {
  const { colors, fonts, type, space, radius, sizes, layout } = useTheme();
  const { contactId } = useLocalSearchParams<{ contactId?: string }>();
  const { session } = useSession();
  const [text, setText] = useState('');
  const [found, setFound] = useState<NoteExtraction | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [tagOn, setTagOn] = useState<Record<string, boolean>>({});
  const [edgeOn, setEdgeOn] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<'extract' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const stopDictation = useRef<() => void>(() => {});
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder);
  const support = voiceSupport();
  useEffect(() => () => stopDictation.current(), []);

  const marks = useMemo(() => {
    if (!found) return [] as string[];
    const m = new Set<string>();
    for (const p of found.people) { m.add(p.mention); for (const t of p.tags) m.add(t.phrase); }
    return [...m].slice(0, 12);
  }, [found]);

  async function extract() {
    setBusy('extract'); setError(null);
    try {
      const r = await api.extractNote({ text });
      setFound(r);
      const ch: Record<string, Choice> = {}; const tg: Record<string, boolean> = {}; const eg: Record<string, boolean> = {};
      for (const p of r.people) {
        ch[p.key] = p.resolution === 'possible_match' && p.candidates.length === 1 ? { contactId: p.candidates[0].contactId, name: p.candidates[0].displayName } : p.resolution === 'new' ? { contactId: null, name: p.mention } : null;
        for (const t of p.tags) tg[`${p.key}:${t.tag}`] = true;
      }
      for (const c of r.connections) eg[`${c.fromKey}>${c.toKey}`] = true;
      setChoices(ch); setTagOn(tg); setEdgeOn(eg);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }

  async function save() {
    if (!session) return;
    setBusy('save'); setError(null);
    try {
      const me = session.user.id;
      const idFor = new Map<string, string>();
      const people = found?.people ?? [];
      // 1) resolve or create people the user checked
      for (const p of people) {
        const c = choices[p.key];
        if (!c) continue;
        const id = c.contactId ?? (await createContact(me, { name: c.name, how_met: found?.howMet ?? 'From a note', relationship: 'met_once', relationship_source: 'note', relationship_status: 'confirmed' }));
        idFor.set(p.key, id);
      }
      const primary = contactId ?? (people.length ? idFor.get(people[0].key) : undefined) ?? null;
      const { data: note, error: ne } = await supabase.from('notes').insert({ owner_id: me, contact_id: primary, body: text.trim(), captured_via: voiceNote || listening ? 'voice' : 'typed', extraction_status: found ? 'reviewed' : 'none', extraction: found }).select('id').single();
      if (ne) throw ne;
      // 2) evidence + confirmed claims for each checked person
      for (const p of people) {
        const id = idFor.get(p.key);
        if (!id) continue;
        const evId = await addEvidence(me, id, 'note', sentenceAbout(text, p), { note_id: note.id });
        await addClaims(me, id, evId, p.tags.filter((t) => tagOn[`${p.key}:${t.tag}`]).map((t) => ({ kind: t.kind, label: t.tag.replace(/-/g, ' '), status: 'confirmed' })));
        if (p.organizations.length) await addClaims(me, id, evId, p.organizations.map((o) => ({ kind: 'org', label: o })));
      }
      // 3) connections stay unconfirmed until one of them says so
      for (const c of found?.connections ?? []) {
        if (!edgeOn[`${c.fromKey}>${c.toKey}`]) continue;
        const from = idFor.get(c.fromKey), to = idFor.get(c.toKey);
        if (!from || !to || from === to) continue;
        await supabase.from('contact_edges').insert({ owner_id: me, from_contact_id: from, to_contact_id: to, kind: c.kind, source: 'note', status: 'suggested', note: 'From your note. Marked unconfirmed until one of them says so.' });
      }
      if (contactId && !idFor.size) await addEvidence(me, contactId, 'note', text.trim().slice(0, 240), { note_id: note.id });
      router.back();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }

  async function toggleVoice() {
    if (support === 'web_speech') {
      if (listening) { stopDictation.current(); setListening(false); return; }
      const base = text; setListening(true);
      stopDictation.current = startDictation((f, i) => setText([base, f, i].filter(Boolean).join(' ')), () => setListening(false));
      return;
    }
    if (support === 'unsupported') { setError('This browser cannot record audio or dictate. Type your note instead.'); return; }
    try {
      if (recState.isRecording) { await recorder.stop(); setVoiceNote(recorder.uri ?? null); return; }
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('Microphone access is off. You can still type the note.'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) { setError(errorMessage(e)); }
  }

  const anyChecked = Object.values(choices).some(Boolean);
  const voiceHint = listening ? 'Listening…' : recState.isRecording ? `Recording ${Math.round(recState.durationMillis / 1000)}s. Tap to stop.` : voiceNote ? 'Voice recording attached. Transcription is not available in this build, so type what was said.' : 'Private to you. Nothing is shared.';
  return (
    <Screen footer={<Button variant="primary" size="sm" fullWidth label={busy === 'extract' ? 'Reading…' : busy === 'save' ? 'Saving…' : found ? (anyChecked ? 'Save to cards' : 'Save note only') : 'Review note'} disabled={!!busy || !text.trim()} onPress={found ? save : extract} />}>
      <ScreenHeader left={<Button variant="ghost" size="sm" label="Cancel" onPress={() => router.back()} />} title={found ? 'Review note' : 'New note'} subtitle={found ? `Uncheck anything that isn't right. ${found.mode === 'llm' ? 'Names and skills were checked by the deterministic extractor first.' : 'Found with keyword rules, not AI.'}` : 'Write what you remember. Bridge finds the people and skills; nothing is saved until you confirm.'} />
      <Section label={found ? 'Your note' : 'What happened'}>
        <View style={{ backgroundColor: colors.card, borderWidth: sizes.border, borderColor: colors.cardEdge, borderRadius: radius.card, padding: layout.cardPad, gap: space[2] }}>
          {found ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Edit the note" onPress={() => setFound(null)} style={{ minHeight: 96 }}>
              <MarkedText text={text} marks={marks} />
            </Pressable>
          ) : (
            <TextInput accessibilityLabel="Note" value={text} onChangeText={setText} multiline autoFocus placeholder="Met Maya at a hackathon. She works on embedded systems, is interested in joining a startup, and knows Jordan, who manages a makerspace." placeholderTextColor={colors.inkFaint}
              style={{ fontFamily: fonts.note, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight, color: colors.ink, minHeight: 140, textAlignVertical: 'top' }} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <BText variant="caption" color="inkSoft" style={{ flex: 1 }}>{voiceHint}</BText>
            <Pressable accessibilityRole="button" accessibilityLabel={listening || recState.isRecording ? 'Stop recording' : 'Record or dictate'} onPress={toggleVoice} hitSlop={8} style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' }}>
              {listening || recState.isRecording ? <Square size={sizes.icon} strokeWidth={sizes.iconStroke} color={colors.nearbyInk} /> : <Mic size={sizes.icon} strokeWidth={sizes.iconStroke} color={colors.action} />}
            </Pressable>
          </View>
        </View>
        {Platform.OS !== 'web' && !found ? <BText variant="caption" color="inkFaint">Tip: the keyboard microphone dictates straight into the note.</BText> : null}
      </Section>
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}
      {found ? (
        <>
          <Section label="People">
            {found.people.length === 0 ? <EmptyRow title={`No names found. The note is saved on its own${contactId ? ' and attached to this card' : ''}.`} /> : (
              <Stack>
                {found.people.map((p) => {
                  const ch = choices[p.key];
                  const ambiguous = p.resolution === 'ambiguous' || (p.resolution === 'possible_match' && p.candidates.length > 1);
                  const tagsOn = p.tags.some((t) => tagOn[`${p.key}:${t.tag}`]);
                  return (
                    <Group key={p.key}>
                      {ambiguous && !ch ? (
                        <View style={{ padding: layout.rowPadH, backgroundColor: colors.cautionWash, gap: space[2] }}>
                          <BText variant="label" color="cautionInk">Which {p.mention}?</BText>
                          <TagList>
                            {p.candidates.map((c) => <Tag key={c.contactId} label={c.displayName} onPress={() => setChoices((x) => ({ ...x, [p.key]: { contactId: c.contactId, name: c.displayName } }))} />)}
                            <Tag label="New person" variant="suggested" onPress={() => setChoices((x) => ({ ...x, [p.key]: { contactId: null, name: p.mention } }))} />
                          </TagList>
                        </View>
                      ) : (
                        <Row title={ch?.name ?? p.mention} titleVariant="rowName" subtitle={ch?.contactId ? 'Matches your card. Add the note there.' : 'New card'} trailing={<Toggle value={!!ch} accessibilityLabel={`Save ${p.mention}`} onValueChange={() => setChoices((x) => ({ ...x, [p.key]: x[p.key] ? null : ambiguous ? null : { contactId: p.candidates[0]?.contactId ?? null, name: p.candidates[0]?.displayName ?? p.mention } }))} />} />
                      )}
                      {p.tags.length ? (
                        <View style={{ paddingHorizontal: layout.rowPadH, paddingVertical: layout.rowPadV, gap: space[2] }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                            <BText variant="label" color="inkSoft" style={{ flex: 1 }}>Skills and interests for {(ch?.name ?? p.mention).split(' ')[0]}</BText>
                            <Toggle value={tagsOn} accessibilityLabel="Save skills and interests" onValueChange={() => setTagOn((x) => { const y = { ...x }; for (const t of p.tags) y[`${p.key}:${t.tag}`] = !tagsOn; return y; })} />
                          </View>
                          <TagList>{p.tags.map((t) => <Tag key={t.tag} label={t.tag.replace(/-/g, ' ')} variant={tagOn[`${p.key}:${t.tag}`] ? 'selected' : 'suggested'} onPress={() => setTagOn((x) => ({ ...x, [`${p.key}:${t.tag}`]: !x[`${p.key}:${t.tag}`] }))} />)}</TagList>
                        </View>
                      ) : null}
                    </Group>
                  );
                })}
              </Stack>
            )}
          </Section>
          {found.connections.length ? (
            <Section label="Who knows whom">
              <Group dashed>
                {found.connections.map((c) => {
                  const k = `${c.fromKey}>${c.toKey}`;
                  const name = (key: string) => choices[key]?.name ?? found.people.find((p) => p.key === key)?.mention ?? key;
                  return <Row key={k} title={<RouteLine kind="suggested" label={`${name(c.fromKey)} ${c.kind === 'works_with' ? 'works with' : 'knows'} ${name(c.toKey)}`} />} subtitle={`“${c.phrase}” · Unconfirmed until one of them says so.`} trailing={<Toggle value={!!edgeOn[k]} accessibilityLabel="Save this link" onValueChange={() => setEdgeOn((x) => ({ ...x, [k]: !x[k] }))} />} />;
                })}
              </Group>
            </Section>
          ) : null}
          {found.ownerGoals.length ? <Section label="About you"><EmptyRow title={`Goals mentioned: ${found.ownerGoals.join('; ')}. Add them from your profile if you want them on your card.`} /></Section> : null}
        </>
      ) : null}
    </Screen>
  );
}

function sentenceAbout(text: string, p: ExtractedPerson): string {
  const s = text.split(/(?<=[.!?])\s+/).find((x) => x.toLowerCase().includes(p.mention.toLowerCase()));
  return (s ?? text).trim().slice(0, 400);
}
