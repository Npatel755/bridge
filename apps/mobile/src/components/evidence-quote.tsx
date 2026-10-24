import { Text as RNText, View } from 'react-native';

import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';

export interface EvidenceQuoteProps {
  quote: string;
  /** 1–3 words or short phrases to mark. Never the whole sentence. */
  marks?: string[];
  /** "Your note", "LinkedIn export", "Their Bridge profile", … */
  source: string;
  date?: string | Date | null;
  /** AI-suggested or extracted and not confirmed yet. */
  unconfirmed?: boolean;
  /** Shared-topic marks for Nearby use the rose wash instead of the lime highlighter. */
  markTone?: 'highlight' | 'nearby';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(d: string | Date | null | undefined, now = new Date()): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear ? `${MONTHS[date.getMonth()]} ${date.getDate()}` : `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function staleness(d: string | Date | null | undefined, now = new Date()): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  const months = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 18) return null;
  const years = Math.floor(months / 12);
  return `Over ${years >= 2 ? `${years} years` : years === 1 ? 'a year' : `${Math.floor(months)} months`} old. Might be out of date.`;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits text so matching words get a highlighter mark. Imported text is rendered as plain text only. */
export function MarkedText({ text, marks = [], tone = 'highlight', variant = 'note' as const }: { text: string; marks?: string[]; tone?: 'highlight' | 'nearby'; variant?: 'note' | 'body' }) {
  const { colors, radius, type } = useTheme();
  const list = marks.filter(Boolean).slice(0, 3);
  const bg = tone === 'nearby' ? colors.nearbyWash : colors.highlight;
  const fg = tone === 'nearby' ? colors.nearbyInk : colors.onHighlight;
  if (!list.length) return <RNText style={[type[variant], { color: colors.ink }]}>{text}</RNText>;
  const re = new RegExp(`(${list.map(esc).join('|')})`, 'gi');
  const parts = text.split(re);
  return (
    <RNText style={[type[variant], { color: colors.ink }]}>
      {parts.map((p, i) => re.test(p) && list.some((m) => m.toLowerCase() === p.toLowerCase())
        ? <RNText key={i} style={{ backgroundColor: bg, color: fg, borderRadius: radius.chip, paddingHorizontal: 2, paddingVertical: 1 }}>{p}</RNText>
        : <RNText key={i}>{p}</RNText>)}
    </RNText>
  );
}

export function EvidenceQuote({ quote, marks, source, date, unconfirmed, markTone = 'highlight' }: EvidenceQuoteProps) {
  const { colors, space, radius } = useTheme();
  const when = shortDate(date);
  const caution = staleness(date) ?? (unconfirmed ? 'Suggested, not confirmed yet.' : null);
  return (
    <View style={{ gap: space[1] }}>
      <MarkedText text={`“${quote.trim().replace(/^[“"]|[”"]$/g, '')}”`} marks={marks} tone={markTone} />
      <T variant="caption" color="inkSoft">{source}{when ? `, ${when}` : ''}</T>
      {caution ? (
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.cautionWash, borderRadius: radius.chip, paddingHorizontal: space[2], paddingVertical: space[1] }}>
          <T variant="caption" style={{ color: colors.cautionInk }}>{caution}</T>
        </View>
      ) : null}
    </View>
  );
}
