import type { Citation, Recommendation } from '@bridge/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { CardSection, EntryCard, Inset, TagRow } from '@/components/entry-card';
import { EvidenceQuote, shortDate, staleness } from '@/components/evidence-quote';
import { Row } from '@/components/layout';
import { routeInfo } from '@/components/route-line';
import { Tag } from '@/components/tag';
import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';

/** Pick the citation that best carries a receipt: quoted excerpt first, then most recent. */
export function bestCitation(rec: Recommendation): Citation | undefined {
  const withExcerpt = rec.citations.filter((c) => c.excerpt);
  const pool = withExcerpt.length ? withExcerpt : rec.citations;
  return [...pool].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
}

const isFollower = (rec: Recommendation) => /follow/i.test(rec.howYouKnow);

export function ResultCard({ rec, ask, expanded, stacked, tabOffset, onPress, showNotes = true }: { rec: Recommendation; ask?: string; expanded: boolean; stacked?: boolean; tabOffset?: number; onPress?: () => void; showNotes?: boolean }) {
  const { space } = useTheme();
  const route = routeInfo(rec.route, { follower: isFollower(rec) });
  const cite = bestCitation(rec);
  const stale = cite ? staleness(cite.date) : null;
  const roleText = rec.headline || rec.howYouKnow;
  const collapsedRole = stale && cite ? `${roleText}, info from ${shortDate(cite.date)}` : roleText;
  const marks = rec.matchedTags.filter((m) => m.exact).map((m) => m.label).slice(0, 3);
  const via = rec.route.path?.hops[1]?.id;
  const openContact = () => router.push({ pathname: '/contact/[id]', params: { id: rec.contactId } });
  return (
    <EntryCard
      name={rec.name}
      role={expanded ? roleText : collapsedRole}
      cautionRole={!expanded && !!stale}
      route={route}
      collapsed={!expanded}
      stacked={stacked}
      tabOffset={tabOffset}
      onPress={onPress ?? openContact}>
      <View style={{ gap: space[4] }}>
        <CardSection>
          {cite ? (
            <EvidenceQuote quote={cite.excerpt ?? `${cite.field}: ${cite.value}`} marks={marks.length ? marks : [cite.value]} source={cite.sourceLabel} date={cite.date} unconfirmed={cite.status === 'suggested' || cite.sourceKind === 'ai_suggested'} />
          ) : <T variant="caption" color="inkSoft">No recorded evidence.</T>}
          {rec.uncertainties.length ? rec.uncertainties.map((u, i) => <T key={i} variant="caption" color="cautionInk">{u}</T>) : null}
        </CardSection>
        {rec.matchedTags.length ? (
          <TagRow>{rec.matchedTags.map((m) => <Tag key={m.tag} label={m.label} state={m.exact ? 'stated' : 'suggested'} />)}</TagRow>
        ) : null}
        <Inset>
          <T variant="caption" color="inkSoft">Suggested ask</T>
          <T variant="note">“{rec.suggestedAsk}”</T>
        </Inset>
        <Row>
          {rec.route.type !== 'none' ? <Button variant="primary" size="sm" title={rec.route.type === 'introduction' ? 'Draft an intro ask' : 'Draft an ask'} onPress={() => router.push({ pathname: '/draft', params: { contactId: rec.contactId, ask: ask ?? rec.suggestedAsk, via: via ?? '', intro: rec.route.type === 'introduction' ? '1' : '' } })} /> : null}
          {showNotes ? <Button size="sm" title="See all notes" onPress={openContact} /> : null}
        </Row>
      </View>
    </EntryCard>
  );
}
