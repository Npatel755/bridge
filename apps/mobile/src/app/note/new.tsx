import type { ExtractedPerson, NoteExtraction } from '@bridge/core';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { Mic, Square } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Button, Card, CheckRow, Flag, MarkedText, Notice, RouteGlyph, Screen, T, Tag, TagRow, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { api, errorMessage } from '@/lib/api';
import { addClaims, addEvidence, createContact } from '@/lib/contacts-data';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { startDictation, voiceSupport } from '@/lib/voice';

type Choice = { contactId: string | null; name: string } | null; // null = unchecked

export default function NewNote() {
  const { colors, fonts, space, radius } = useTheme();
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

  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const anyChecked = Object.values(choices).some(Boolean);
  return (
    <>
      <TopBar left={<Button variant="ghost" size="sm" title="Cancel" onPress={() => router.back()} />} title="New note" right={<T variant="caption" color="inkSoft">{today}</T>} />
      <Screen cta={<Button variant="primary" size="lg" title={found ? (anyChecked ? 'Save to cards' : 'Save note only') : 'Find people and skills'} loading={!!busy} disabled={!text.trim()} onPress={found ? save : extract} />}>
        <Card style={{ paddingVertical: space[3] }}>
          {found ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Edit the note" onPress={() => setFound(null)} style={{ minHeight: 96 }}>
              <MarkedText text={text} marks={marks} />
            </Pressable>
          ) : (
            <TextInput accessibilityLabel="Note" value={text} onChangeText={setText} multiline autoFocus placeholder="Met Maya at a hackathon. She works on embedded systems, is interested in joining a startup, and knows Jordan, who manages a makerspace." placeholderTextColor={colors.inkFaint}
              style={{ fontFamily: fonts.note, fontSize: 15, lineHeight: 24, color: colors.ink, minHeight: 120, textAlignVertical: 'top' }} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[2] }}>
            <T variant="caption" color="inkSoft" style={{ flex: 1 }}>{listening ? 'Listening…' : recState.isRecording ? `Recording ${Math.round(recState.durationMillis / 1000)}s. Tap to stop.` : voiceNote ? 'Voice recording attached. Transcription is not available in this build, so type what was said.' : 'Private to you. Nothing is saved until you confirm.'}</T>
            <Pressable accessibilityRole="button" accessibilityLabel={listening || recState.isRecording ? 'Stop recording' : 'Record or dictate'} onPress={toggleVoice} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              {listening || recState.isRecording ? <Square size={20} strokeWidth={1.75} color={colors.nearbyInk} /> : <Mic size={20} strokeWidth={1.75} color={colors.action} />}
            </Pressable>
          </View>
        </Card>
        {error ? <Notice>{error}</Notice> : null}
        {found ? (
          <>
            <View style={{ marginTop: space[2] }}>
              <T variant="title">Bridge found</T>
              <T variant="body" color="inkSoft">Uncheck anything that isn&apos;t right. {found.mode === 'llm' ? 'Names and skills were checked by the deterministic extractor first.' : 'Found with keyword rules, not AI.'}</T>
            </View>
            <Card padded={false}>
              {found.people.length === 0 ? <View style={{ padding: space[3] }}><T variant="body">No names found. The note is saved on its own{contactId ? ' and attached to this card' : ''}.</T></View> : null}
              {found.people.map((p) => {
                const ch = choices[p.key];
                const ambiguous = p.resolution === 'ambiguous' || (p.resolution === 'possible_match' && p.candidates.length > 1);
                return (
                  <View key={p.key}>
                    {ambiguous && !ch ? (
                      <View style={{ padding: space[3], backgroundColor: colors.cautionWash, gap: space[2], borderBottomWidth: 1, borderBottomColor: colors.rule }}>
                        <T variant="label" style={{ color: colors.cautionInk }}>Which {p.mention}?</T>
                        <TagRow>
                          {p.candidates.map((c) => <Tag key={c.contactId} label={c.displayName} onPress={() => setChoices((x) => ({ ...x, [p.key]: { contactId: c.contactId, name: c.displayName } }))} />)}
                          <Tag label="New person" state="suggested" onPress={() => setChoices((x) => ({ ...x, [p.key]: { contactId: null, name: p.mention } }))} />
                        </TagRow>
                      </View>
                    ) : (
                      <CheckRow checked={!!ch} onToggle={() => setChoices((x) => ({ ...x, [p.key]: x[p.key] ? null : ambiguous ? null : { contactId: p.candidates[0]?.contactId ?? null, name: p.candidates[0]?.displayName ?? p.mention } }))} title={ch?.name ?? p.mention}
                        subtitle={ch?.contactId ? 'Matches your card. Add the note there.' : 'New card'} />
                    )}
                    {p.tags.length ? (
                      <CheckRow checked={p.tags.some((t) => tagOn[`${p.key}:${t.tag}`])} onToggle={() => { const any = p.tags.some((t) => tagOn[`${p.key}:${t.tag}`]); setTagOn((x) => { const y = { ...x }; for (const t of p.tags) y[`${p.key}:${t.tag}`] = !any; return y; }); }} title={`Skills and interests for ${ch?.name?.split(' ')[0] ?? p.mention}`} titleVariant="body">
                        <TagRow>{p.tags.map((t) => <Tag key={t.tag} label={t.tag.replace(/-/g, ' ')} state={tagOn[`${p.key}:${t.tag}`] ? 'stated' : 'suggested'} onPress={() => setTagOn((x) => ({ ...x, [`${p.key}:${t.tag}`]: !x[`${p.key}:${t.tag}`] }))} />)}</TagRow>
                      </CheckRow>
                    ) : null}
                  </View>
                );
              })}
              {found.connections.map((c) => {
                const k = `${c.fromKey}>${c.toKey}`;
                const name = (key: string) => choices[key]?.name ?? found.people.find((p) => p.key === key)?.mention ?? key;
                return <CheckRow key={k} checked={!!edgeOn[k]} onToggle={() => setEdgeOn((x) => ({ ...x, [k]: !x[k] }))} title={`${name(c.fromKey)} ${c.kind === 'works_with' ? 'works with' : 'knows'} ${name(c.toKey)}`} titleVariant="body" subtitle="From your note. Marked unconfirmed until one of them says so.">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><RouteGlyph kind="intro" /><T variant="caption" color="inkSoft">“{c.phrase}”</T></View>
                </CheckRow>;
              })}
            </Card>
            {found.ownerGoals.length ? <Card><Flag label="About you" /><T variant="body">Goals mentioned: {found.ownerGoals.join('; ')}. Add them from your profile if you want them on your card.</T></Card> : null}
            <View style={{ borderRadius: radius.card }} />
          </>
        ) : null}
        {Platform.OS !== 'web' && !found ? <T variant="caption" color="inkSoft">Tip: the keyboard microphone dictates straight into the note.</T> : null}
      </Screen>
    </>
  );
}

function sentenceAbout(text: string, p: ExtractedPerson): string {
  const s = text.split(/(?<=[.!?])\s+/).find((x) => x.toLowerCase().includes(p.mention.toLowerCase()));
  return (s ?? text).trim().slice(0, 400);
}
