import { safeEmail, safePhone } from './normalize.ts';
import type { Route } from './ask.ts';

export interface OutreachInput {
  senderName: string;
  recipientName: string;
  relationshipContext?: string | null;
  howMet?: string | null;
  ask: string;
  goal?: string | null;
  route?: Route | null;
  targetName?: string | null;
}

export interface OutreachDraft {
  subject: string;
  body: string;
  kind: 'direct' | 'introduction_request';
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Editable outreach draft grounded in the recorded relationship context. Never sent automatically. */
export function draftOutreach(input: OutreachInput): OutreachDraft {
  const r = first(input.recipientName);
  const me = first(input.senderName);
  const context = input.howMet
    ? `It was great meeting you ${input.howMet.replace(/^(at|during)\s/i, (m) => m.toLowerCase())}.`
    : input.relationshipContext
      ? `Hope you're doing well since ${input.relationshipContext}.`
      : 'Hope you are doing well.';
  if (input.route?.type === 'introduction' && input.targetName) {
    const t = first(input.targetName);
    return {
      kind: 'introduction_request',
      subject: `Would you be open to introducing me to ${t}?`,
      body: [
        `Hi ${r},`,
        '',
        context,
        `I'm working on ${input.goal ?? 'a project'} and noticed you know ${input.targetName}. ${input.ask}`,
        '',
        `No pressure at all if it isn't a good fit. If it helps, here's a short blurb you could forward: "${me} is working on ${input.goal ?? 'a project'} and would value 20 minutes of ${t}'s perspective."`,
        '',
        'Thanks!',
        me,
      ].join('\n'),
    };
  }
  return {
    kind: 'direct',
    subject: input.goal ? `Quick question about ${input.goal}` : 'Quick question',
    body: [`Hi ${r},`, '', context, input.goal ? `I'm working on ${input.goal}.` : '', input.ask, '', 'Thanks!', me]
      .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n'),
  };
}

export function mailtoUrl(draft: OutreachDraft, email?: string | null): string {
  const to = safeEmail(email);
  return `mailto:${to ? encodeURIComponent(to).replace('%40', '@') : ''}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

export function smsUrl(draft: OutreachDraft, phone?: string | null): string {
  return `sms:${safePhone(phone)}?&body=${encodeURIComponent(draft.body)}`;
}
