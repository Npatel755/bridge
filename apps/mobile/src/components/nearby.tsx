import { MoreHorizontal } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';

import { Button } from '@/components/button';
import { EntryCard, Inset } from '@/components/entry-card';
import { MarkedText } from '@/components/evidence-quote';
import { Card, Row, Toggle } from '@/components/layout';
import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import type { MatchPayload } from '@/lib/nearby/publish';

export const BAND_LABEL: Record<MatchPayload['band'], string> = { very_close: 'Within ~50 m', close: 'Within ~100 m', nearby: 'Within ~250 m' };

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Rose dot with a soft ring. Breathes (1.6s) only while on and not under Reduce Motion. */
export function NearbyDot({ state }: { state: 'on' | 'paused' | 'off' }) {
  const { colors, motion } = useTheme();
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (state !== 'on' || reduce) { scale.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: motion.nearbyBreatheMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: motion.nearbyBreatheMs / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state, reduce, scale, motion.nearbyBreatheMs]);
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }} aria-hidden>
      {state === 'on' ? <Animated.View style={{ position: 'absolute', width: 16, height: 16, borderRadius: 999, backgroundColor: colors.nearbyWash, transform: [{ scale }] }} /> : null}
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: state === 'on' ? colors.nearby : state === 'paused' ? colors.inkFaint : 'transparent', borderWidth: state === 'off' ? 1.5 : 0, borderColor: colors.inkSoft }} />
    </View>
  );
}

export function NearbyStatusRow({ state, title, detail, enabled, onToggle, onSettings }: { state: 'on' | 'paused' | 'off'; title: string; detail: string; enabled: boolean; onToggle?: (v: boolean) => void; onSettings?: () => void }) {
  const { space } = useTheme();
  return (
    <Card>
      <Row between>
        <Row style={{ flex: 1 }} gap={space[3]}>
          <NearbyDot state={state} />
          <View style={{ flex: 1 }}>
            <T variant="body" style={{ fontFamily: 'InterTight_500Medium' }}>{title}</T>
            <T variant="caption" color="inkSoft">{detail}</T>
          </View>
        </Row>
        {state === 'off' && onSettings ? <Button size="sm" title="Settings" onPress={onSettings} /> : onToggle ? <Toggle tone="nearby" value={enabled} onValueChange={onToggle} label="Nearby" /> : null}
      </Row>
    </Card>
  );
}

/** Concentric distance bands. No pins, no trails. The band holding a match fills with nearbyWash. */
export function NearbyRings({ matchBands, radiusM }: { matchBands: MatchPayload['band'][]; radiusM: 50 | 100 | 250 }) {
  const { colors, fonts, space } = useTheme();
  const size = 220, c = size / 2;
  const rings: { band: MatchPayload['band']; r: number; label: string }[] = [{ band: 'very_close', r: 34, label: '~50 m' }, { band: 'close', r: 62, label: '~100 m' }, { band: 'nearby', r: 100, label: '~250 m' }];
  const counts = matchBands.reduce<Record<string, number>>((a, b) => ({ ...a, [b]: (a[b] ?? 0) + 1 }), {});
  const active: MatchPayload['band'] = radiusM === 50 ? 'very_close' : radiusM === 100 ? 'close' : 'nearby';
  return (
    <View style={{ alignItems: 'center', gap: space[2] }} accessible accessibilityLabel={`Distance bands. ${matchBands.length ? matchBands.map((b) => BAND_LABEL[b]).join(', ') : 'No matches right now'}.`}>
      <Svg width={size} height={size}>
        {[...rings].reverse().map((ring) => {
          const n = counts[ring.band] ?? 0;
          const within = rings.findIndex((r) => r.band === ring.band) <= rings.findIndex((r) => r.band === active);
          return (
            <Circle key={ring.band} cx={c} cy={c} r={ring.r} fill={n ? colors.nearbyWash : 'transparent'} stroke={n ? colors.nearby : within ? colors.cardEdge : colors.rule} strokeWidth={n ? 1.5 : 1} strokeDasharray={within ? undefined : '3 4'} />
          );
        })}
        <Circle cx={c} cy={c} r={5} fill={colors.ink} />
        <SvgText x={c} y={c + 22} fontFamily={fonts.ui} fontSize={12} fill={colors.inkSoft} textAnchor="middle">You</SvgText>
        {rings.map((ring) => {
          const n = counts[ring.band] ?? 0;
          return <SvgText key={ring.band} x={c + ring.r + 6} y={c - ring.r + 4} fontFamily={fonts.ui} fontSize={11} fill={n ? colors.nearbyInk : colors.inkSoft}>{ring.label}{n ? `: ${n} match${n > 1 ? 'es' : ''}` : ''}</SvgText>;
        })}
      </Svg>
      <T variant="caption" color="inkSoft" center>Distance bands only. No pins, no trails, nothing stored.</T>
    </View>
  );
}

const announcedIds = new Set<string>();

export interface NearbyMatchCardProps {
  match: MatchPayload;
  starter?: string;
  onRequestIntro: () => void;
  onDismiss: () => void;
  onMute: () => void;
  onBlock: () => void;
  onReport: () => void;
  /** Fires the success haptic once when the card first rises in the foreground. */
  announce?: boolean;
}

export function NearbyMatchCard({ match, starter, onRequestIntro, onDismiss, onMute, onBlock, onReport, announce }: NearbyMatchCardProps) {
  const { colors, space } = useTheme();
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (announce && !announcedIds.has(match.event_id)) { announcedIds.add(match.event_id); haptic.success(); } }, [announce, match.event_id]);
  const p = match.profile;
  const shared = [...match.shared_skills, ...match.shared_interests];
  const sentence = `Also works on ${match.shared_skills.join(', ') || 'similar things'}${match.shared_interests.length ? ` and is into ${match.shared_interests.join(', ')}` : ''}.`;
  const role = [p.role_title, p.company || p.school, p.city].filter(Boolean).join(', ');
  return (
    <>
      <EntryCard
        tone="nearby"
        tabText={match.simulated ? 'Nearby, simulated for demo' : 'Nearby'}
        name={p.display_name}
        role={role}
        headRight={<T variant="label" style={{ color: colors.nearbyInk }}>{BAND_LABEL[match.band]}</T>}
        accessibilityLabel={`${p.display_name}, ${role}, ${BAND_LABEL[match.band]}${match.simulated ? ', simulated for demo' : ''}`}>
        <View style={{ gap: space[3] }}>
          <MarkedText text={sentence} marks={shared.slice(0, 3)} tone="nearby" />
          {match.is_existing_contact ? <T variant="caption" color="inkSoft">Already one of your cards.</T> : null}
          {starter ? <Inset><T variant="caption" color="inkSoft">Conversation starter</T><T variant="note">{starter}</T></Inset> : null}
          <Row>
            <Button variant="primary" title="Request intro" onPress={onRequestIntro} />
            <Button title="Dismiss" onPress={onDismiss} />
            <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setMenu(true)} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}>
              <MoreHorizontal size={22} strokeWidth={1.75} color={colors.inkSoft} />
            </Pressable>
          </Row>
        </View>
      </EntryCard>
      <Sheet visible={menu} onClose={() => setMenu(false)} title={p.display_name}>
        <Button title="Mute for a day" onPress={() => { setMenu(false); onMute(); }} />
        <Button variant="danger" title="Block" onPress={() => { setMenu(false); onBlock(); }} />
        <Button variant="danger" title="Report" onPress={() => { setMenu(false); onReport(); }} />
      </Sheet>
    </>
  );
}

/** Bottom sheet for confirmations and overflow menus. The only place a lift shadow is allowed. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const { colors, radius, space } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space[4], paddingBottom: space[8], gap: space[2], shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 8 }}>
        {title ? <T variant="name" style={{ marginBottom: space[2] }}>{title}</T> : null}
        {children}
        <Button variant="ghost" title="Cancel" onPress={onClose} />
      </View>
    </Modal>
  );
}
