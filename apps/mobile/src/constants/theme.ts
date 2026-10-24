// Bridge design tokens. The only source of colors, fonts, spacing and radii for the app.
// Fonts: @expo-google-fonts/inter-tight (UI), @expo-google-fonts/literata (quoted human text).

import { useColorScheme } from 'react-native';

export const palette = {
  light: {
    paper: '#F6F5F2',       // screen background
    card: '#FFFFFF',        // cards, sheets, inputs
    cardEdge: '#E6E3DC',    // 1px borders; dashed = suggested/unconfirmed
    tab: '#EEECE7',         // chips, selected rows, segmented track
    rule: '#EFEDE8',        // dividers inside a card
    ink: '#1C1B19',         // primary text
    inkSoft: '#6B6760',     // roles, sources, dates
    inkFaint: '#9A968E',    // placeholders only
    action: '#4F46E5',      // buttons, links, confirmed relationship lines
    onAction: '#FFFFFF',
    highlight: '#FFE8A3',   // evidence marks only
    onHighlight: '#1C1B19',
    nearby: '#E4573D',      // Nearby only
    nearbyInk: '#B23A24',
    nearbyWash: '#FDE9E4',
    cautionInk: '#8A5A12',  // stale / uncertain evidence
    cautionWash: '#FBF1DC',
    confirmInk: '#2F7A48',
    dangerInk: '#B4322A',
    stackEdge1: '#EEECE7',
    stackEdge2: '#E6E3DC',
  },
  dark: {
    paper: '#141413',
    card: '#1E1E1C',
    cardEdge: '#2F2E2B',
    tab: '#2A2927',
    rule: '#2A2927',
    ink: '#F1EFEA',
    inkSoft: '#A9A59D',
    inkFaint: '#7E7A73',
    action: '#A5B4FC',
    onAction: '#141413',
    highlight: '#5A4A14',
    onHighlight: '#F1EFEA',
    nearby: '#F0836C',
    nearbyInk: '#F7B3A3',
    nearbyWash: '#3C241E',
    cautionInk: '#E8BE74',
    cautionWash: '#3A2F1C',
    confirmInk: '#8ED0A2',
    dangerInk: '#F09A92',
    stackEdge1: '#2A2927',
    stackEdge2: '#2F2E2B',
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

export const radius = { chip: 8, card: 12, round: 999 } as const;

// Inter Tight for the interface. Literata only for text a person wrote (quotes, notes).
export const fonts = {
  note: 'Literata_400Regular',
  noteMedium: 'Literata_500Medium',
  ui: 'InterTight_400Regular',
  uiMedium: 'InterTight_500Medium',
} as const;

export const type = {
  display:   { fontFamily: fonts.uiMedium, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  title:     { fontFamily: fonts.uiMedium, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  name:      { fontFamily: fonts.uiMedium, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  note:      { fontFamily: fonts.note,     fontSize: 15, lineHeight: 24 },
  tabLetter: { fontFamily: fonts.uiMedium, fontSize: 13, lineHeight: 16 },
  body:      { fontFamily: fonts.ui,       fontSize: 15, lineHeight: 22 },
  label:     { fontFamily: fonts.uiMedium, fontSize: 13, lineHeight: 18 },
  caption:   { fontFamily: fonts.ui,       fontSize: 12, lineHeight: 16 },
} as const;

export const sizes = {
  touch: 44,
  button: 44,
  buttonSm: 36,
  buttonLg: 52,
  tabHeight: 0,     // no card tabs in this design
  avatar: 40,
  phoneGutter: 16,
} as const;

// Route lines (also used in the network graph).
export const routeStyle = {
  direct: { color: 'action', dashed: false, hollowMiddle: false },
  intro: { color: 'ink', dashed: false, hollowMiddle: true },
  suggested: { color: 'inkSoft', dashed: true, hollowMiddle: false },
} as const;

export const motion = {
  cardFlipMs: 180,
  nearbyBreatheMs: 1600,
} as const;

export function useTheme() {
  const scheme = useColorScheme();
  const colors: Colors = scheme === 'dark' ? palette.dark : palette.light;
  return { colors, space, radius, type, sizes, fonts, motion };
}
