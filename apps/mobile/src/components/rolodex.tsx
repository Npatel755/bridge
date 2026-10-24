import { useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';

import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Section header for a letter group. */
export function LetterDivider({ letter, current }: { letter: string; current: boolean }) {
  const { colors, space } = useTheme();
  return (
    <View accessibilityRole="header" accessibilityLabel={`Section ${letter}`} style={{ marginTop: space[4], marginBottom: space[2], paddingHorizontal: space[1] }}>
      <T variant="label" style={{ color: current ? colors.action : colors.inkSoft }}>{letter}</T>
    </View>
  );
}

/** Slim A–Z index on the right, 44px hit area. Dragging jumps between letters that have cards; haptic on each change. */
export function AZRail({ available, current, onLetter }: { available: Set<string>; current: string | null; onLetter: (letter: string) => void }) {
  const { colors, fonts, sizes } = useTheme();
  const [height, setHeight] = useState(0);
  const last = useRef<string | null>(null);
  const pick = (y: number) => {
    if (!height) return;
    const idx = Math.max(0, Math.min(LETTERS.length - 1, Math.floor((y / height) * LETTERS.length)));
    let l = LETTERS[idx];
    if (!available.has(l)) {
      const near = LETTERS.map((x, i) => ({ x, d: Math.abs(i - idx) })).filter((e) => available.has(e.x)).sort((a, b) => a.d - b.d)[0];
      if (!near) return;
      l = near.x;
    }
    if (l !== last.current) { last.current = l; haptic.selection(); onLetter(l); }
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => pick(e.nativeEvent.locationY),
    onPanResponderMove: (e) => pick(e.nativeEvent.locationY),
    onPanResponderRelease: () => { last.current = null; },
  })).current;
  return (
    <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Jump to letter" onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)} style={{ width: sizes.touch, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' }}>
      {LETTERS.map((l) => {
        const has = available.has(l); const cur = l === current;
        return <View key={l} style={{ height: 15, width: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: cur ? colors.action : 'transparent' }}><T style={{ fontFamily: fonts.uiMedium, fontSize: 10, lineHeight: 12, color: cur ? colors.onAction : has ? colors.inkSoft : colors.inkFaint, opacity: has ? 1 : 0.4 }}>{l}</T></View>;
      })}
    </View>
  );
}
