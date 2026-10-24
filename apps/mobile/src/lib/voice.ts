import { Platform } from 'react-native';

export type VoiceSupport = 'web_speech' | 'record_only' | 'unsupported';

interface WebSpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getWebRecognition(): (new () => WebSpeechRecognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => WebSpeechRecognition; webkitSpeechRecognition?: new () => WebSpeechRecognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** On web, browsers with the Web Speech API can dictate directly. On native we record audio with expo-audio and attach it;
 *  transcription is left to the OS keyboard dictation (tap the mic on the keyboard), because no speech API is configured. */
export function voiceSupport(): VoiceSupport {
  if (getWebRecognition()) return 'web_speech';
  return Platform.OS === 'web' ? 'unsupported' : 'record_only';
}

export function startDictation(onText: (finalText: string, interim: string) => void, onEnd: (err?: string) => void): () => void {
  const Rec = getWebRecognition();
  if (!Rec) { onEnd('Dictation is not supported in this browser.'); return () => {}; }
  const rec = new Rec();
  rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    let finalText = ''; let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript;
    }
    onText(finalText.trim(), interim);
  };
  rec.onerror = (e) => onEnd(e.error);
  rec.onend = () => onEnd();
  rec.start();
  return () => rec.stop();
}
