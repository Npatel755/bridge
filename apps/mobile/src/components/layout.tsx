import { ChevronLeft } from 'lucide-react-native';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';

const MAX_WIDTH = 720;

/** paper background, 16 gutter, optional pinned full-width CTA. */
export function Screen({ children, scroll = true, cta, style, contentStyle }: PropsWithChildren<{ scroll?: boolean; cta?: ReactNode; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }>) {
  const { colors, sizes, space } = useTheme();
  const insets = useSafeAreaInsets();
  const inner = [styles.inner, { paddingHorizontal: sizes.phoneGutter, paddingTop: space[2], paddingBottom: space[8] + (cta ? 0 : insets.bottom), gap: space[3] }, contentStyle];
  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }, style]}>
      {scroll ? <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{children}</ScrollView> : <View style={[inner, { flex: 1 }]}>{children}</View>}
      {cta ? <View style={[styles.cta, { paddingHorizontal: sizes.phoneGutter, paddingBottom: Math.max(insets.bottom, space[3]), paddingTop: space[2], backgroundColor: colors.paper }]}>{cta}</View> : null}
    </View>
  );
}

export function ScreenTitle({ title, caption, right }: { title: string; caption?: string; right?: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[1], marginBottom: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[3] }}>
        <T variant="display" accessibilityRole="header" style={{ flex: 1 }}>{title}</T>
        {right}
      </View>
      {caption ? <T variant="body" color="inkSoft">{caption}</T> : null}
    </View>
  );
}

/** Back chevron, centered title, optional right action. Used instead of native headers so every platform matches the spec. */
export function TopBar({ title, onBack, right, left }: { title?: string; onBack?: () => void; right?: ReactNode; left?: ReactNode }) {
  const { colors, sizes, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + space[1], paddingHorizontal: space[2], minHeight: sizes.touch, backgroundColor: colors.paper }]}>
      <View style={styles.topSide}>{left ?? (onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.iconBtn}><ChevronLeft size={22} strokeWidth={1.75} color={colors.ink} /></Pressable> : null)}</View>
      {title ? <T variant="label" style={{ fontSize: 15 }}>{title}</T> : <View />}
      <View style={[styles.topSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function Card({ children, style, dashed, padded = true }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; dashed?: boolean; padded?: boolean }>) {
  const { colors, radius, space } = useTheme();
  return <View style={[{ backgroundColor: dashed ? 'transparent' : colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: radius.card, borderStyle: dashed ? 'dashed' : 'solid' }, padded && { paddingHorizontal: space[4], paddingVertical: 14, gap: space[2] }, style]}>{children}</View>;
}

/** Small `tab`-filled label, e.g. "Export importer, not a live connection". */
export function Flag({ label, tone = 'default' }: { label: string; tone?: 'default' | 'caution' | 'nearby' }) {
  const { colors, radius, space } = useTheme();
  const bg = tone === 'caution' ? colors.cautionWash : tone === 'nearby' ? colors.nearby : colors.tab;
  const fg = tone === 'caution' ? colors.cautionInk : tone === 'nearby' ? colors.onAction : colors.ink;
  return <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radius.chip, paddingHorizontal: space[2], paddingVertical: space[1] }}><T variant="caption" style={{ color: fg }}>{label}</T></View>;
}

/** Plain-words message: what happened and what to do. */
export function Notice({ children, tone = 'caution' }: PropsWithChildren<{ tone?: 'caution' | 'plain' | 'confirm' }>) {
  const { colors, radius, space } = useTheme();
  const bg = tone === 'caution' ? colors.cautionWash : colors.tab;
  const fg = tone === 'caution' ? colors.cautionInk : tone === 'confirm' ? colors.confirmInk : colors.ink;
  return <View accessibilityLiveRegion="polite" style={{ backgroundColor: bg, borderRadius: radius.card, padding: space[3] }}><T variant="body" style={{ color: fg }}>{children}</T></View>;
}

export function Field({ label, hint, style, ...rest }: TextInputProps & { label?: string; hint?: string }) {
  const { colors, radius, space, type } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      {label ? <T variant="label" color="inkSoft">{label}</T> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkFaint}
        style={[type.body, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: radius.card, paddingHorizontal: space[3], paddingVertical: 11, minHeight: 44 }, rest.multiline && { minHeight: 96, textAlignVertical: 'top' }, style]}
        {...rest}
      />
      {hint ? <T variant="caption" color="inkSoft">{hint}</T> : null}
    </View>
  );
}

export function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  const { colors, radius, space } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: colors.tab, borderRadius: radius.card, padding: 2 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.key)} style={{ paddingHorizontal: space[3], minHeight: 36, justifyContent: 'center', borderRadius: radius.card, backgroundColor: on ? colors.card : 'transparent' }}>
            <T variant="label" style={{ color: on ? colors.ink : colors.inkSoft }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Progress({ step, total, onBack, onSkip }: { step: number; total: number; onBack?: () => void; onSkip?: () => void }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <View style={{ width: 96 }}>{onBack ? <Button variant="ghost" size="sm" title="Back" onPress={onBack} icon={<ChevronLeft size={18} strokeWidth={1.75} color={colors.action} />} style={{ alignSelf: 'flex-start' }} /> : null}</View>
        <T variant="label" color="inkSoft">Step {step} of {total}</T>
        <View style={{ width: 96, alignItems: 'flex-end' }}>{onSkip ? <Button variant="ghost" size="sm" title="Skip for now" onPress={onSkip} /> : null}</View>
      </View>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }} style={{ flexDirection: 'row', gap: space[1] }}>
        {Array.from({ length: total }, (_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.ink : colors.cardEdge }} />)}
      </View>
    </View>
  );
}

export function Toggle({ value, onValueChange, tone = 'default', label }: { value: boolean; onValueChange: (v: boolean) => void; tone?: 'default' | 'nearby'; label: string }) {
  const { colors } = useTheme();
  const on = tone === 'nearby' ? colors.nearby : colors.action;
  return <Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} trackColor={{ true: on, false: colors.cardEdge }} thumbColor={colors.card} ios_backgroundColor={colors.cardEdge} />;
}

export function CheckRow({ checked, onToggle, title, subtitle, children, tone = 'default', titleVariant = 'name' }: PropsWithChildren<{ checked: boolean; onToggle: () => void; title: string; subtitle?: string; tone?: 'default' | 'caution'; titleVariant?: 'name' | 'body' }>) {
  const { colors, radius, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space[3], padding: space[3], backgroundColor: tone === 'caution' ? colors.cautionWash : colors.card, borderBottomWidth: 1, borderBottomColor: colors.rule }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={title} onPress={onToggle} hitSlop={10} style={{ width: 22, height: 22, borderRadius: radius.chip, borderWidth: 1.5, borderColor: checked ? colors.action : colors.cardEdge, backgroundColor: checked ? colors.action : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        {checked ? <T variant="label" style={{ color: colors.onAction, lineHeight: 16 }}>✓</T> : null}
      </Pressable>
      <View style={{ flex: 1, gap: space[1] }}>
        <T variant={titleVariant} style={titleVariant === 'body' ? { fontFamily: 'InterTight_500Medium' } : undefined}>{title}</T>
        {subtitle ? <T variant="caption" color="inkSoft">{subtitle}</T> : null}
        {children}
      </View>
    </View>
  );
}

export function Row({ children, style, gap, wrap, between }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean; between?: boolean }>) {
  const { space } = useTheme();
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: gap ?? space[2] }, wrap && { flexWrap: 'wrap' }, between && { justifyContent: 'space-between' }, style]}>{children}</View>;
}

export function Loading({ label }: { label?: string }) {
  const { space } = useTheme();
  return <View style={{ padding: space[6], alignItems: 'center' }}><T variant="caption" color="inkSoft">{label ?? 'Working…'}</T></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  cta: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  topSide: { width: 110, minHeight: 44, justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
