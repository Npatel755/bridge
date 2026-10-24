import { Mic, MicOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Card } from '@/components/layout';
import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';
import { startDictation, voiceSupport } from '@/lib/voice';

/** The question sits on a single ruled line in Literata 18/28. Footer states scope; mic dictates where the platform allows. */
export function AskField({ value, onChange, onSubmit, scope, placeholder = 'Who do I know who can help with…' }: { value: string; onChange: (v: string) => void; onSubmit: () => void; scope: string; placeholder?: string }) {
  const { colors, fonts, space, sizes } = useTheme();
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});
  const support = voiceSupport();
  useEffect(() => () => stop.current(), []);
  function toggleMic() {
    if (listening) { stop.current(); setListening(false); return; }
    if (support !== 'web_speech') { setHint(Platform.OS === 'web' ? 'This browser has no dictation. Type your question.' : 'Tap the microphone on your keyboard to dictate.'); return; }
    const base = value;
    setListening(true); setHint(null);
    stop.current = startDictation((finalText, interim) => onChange([base, finalText, interim].filter(Boolean).join(' ')), (err) => { setListening(false); if (err) setHint('Dictation stopped. You can keep typing.'); });
  }
  return (
    <Card style={{ gap: space[3] }}>
      <TextInput
        accessibilityLabel="Your question"
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        blurOnSubmit
        multiline
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        style={{ fontFamily: fonts.note, fontSize: 18, lineHeight: 28, color: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.rule, paddingBottom: space[1], minHeight: 40 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T variant="caption" color="inkSoft" style={{ flex: 1 }}>{hint ?? (listening ? 'Listening…' : scope)}</T>
        <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Stop dictation' : 'Dictate your question'} onPress={toggleMic} hitSlop={8} style={{ width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center', marginRight: -space[3] }}>
          {listening ? <MicOff size={20} strokeWidth={1.75} color={colors.nearbyInk} /> : <Mic size={20} strokeWidth={1.75} color={colors.action} />}
        </Pressable>
      </View>
    </Card>
  );
}
