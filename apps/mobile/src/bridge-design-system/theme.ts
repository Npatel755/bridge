// Bridge design tokens. The only source of colors, type, spacing, radii and sizes.
import { useColorScheme } from "react-native";

export const palette = {
  light: {
    paper: "#E9EDE3", // screen background
    card: "#F7F9F3", // cards, groups, inputs, sheets
    cardEdge: "#CBD2C2", // 1px borders; dashed = suggested / unconfirmed / empty
    tab: "#DCE3D2", // card tabs, chip fills, pressed rows
    rule: "#D9DFCF", // hairline between rows inside a group
    ink: "#2B2E2A", // primary text
    inkSoft: "#565B53", // secondary text: roles, sources, dates, section labels
    inkFaint: "#6C7266", // placeholders only
    action: "#2F4F8F", // primary buttons, links, confirmed relationship lines
    onAction: "#F7F9F3",
    highlight: "#D8F35A", // evidence marks ONLY
    onHighlight: "#2B2E2A",
    nearby: "#E0607E", // Nearby ONLY
    nearbyInk: "#A3304F",
    nearbyWash: "#FBE4EA",
    cautionInk: "#8A5A12", // stale or uncertain information
    cautionWash: "#F8EDD3",
    confirmInk: "#33693F",
    dangerInk: "#A33A2C",
    stackEdge1: "#DDE3D3", // Rolodex peek edges behind a front card
    stackEdge2: "#D2D9C7",
    onNearby: "#1E211D",
    shadow: "#000000",
    clear: "transparent",
  },
  dark: {
    paper: "#1E211D",
    card: "#2A2E28",
    cardEdge: "#40463C",
    tab: "#343A31",
    rule: "#363B33",
    ink: "#E6EAE0",
    inkSoft: "#A9B0A2",
    inkFaint: "#8E9588",
    action: "#9DB6EA",
    onAction: "#1E211D",
    highlight: "#C9E64C",
    onHighlight: "#1E211D",
    nearby: "#F0879F",
    nearbyInk: "#F6B1C1",
    nearbyWash: "#47262F",
    cautionInk: "#E8BE74",
    cautionWash: "#3D3220",
    confirmInk: "#93CDA1",
    dangerInk: "#F0A094",
    stackEdge1: "#30352D",
    stackEdge2: "#2A2E27",
    onNearby: "#1E211D",
    shadow: "#000000",
    clear: "transparent",
  },
} as const;

export type Colors = { [K in keyof typeof palette.light]: string };
export type ColorName = keyof Colors;

export const space = {
  0: 0,
  half: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
} as const;

export const layout = {
  gutter: 20, // screen side padding
  groupGap: 24, // between groups / sections
  labelGap: 10, // section label to its group
  rowPadV: 13, // row vertical padding
  rowPadH: 16, // row horizontal padding
  cardPad: 18, // person card padding
  rowMinHeight: 48,
  fieldPadH: 14,
  cardPeekNearInset: 5,
  cardPeekFarInset: 10,
  cardTabInset: 16,
  cardTabPad: 10,
  cardRouteOffset: 5,
  footerGap: 12,
  previewMaxWidth: 440,
} as const;

export const radius = { chip: 4, card: 6, round: 999 } as const;

// Literata = anything a person wrote or would write (names, notes, quotes, questions, titles).
// Inter Tight = anything the app says (buttons, labels, captions, settings).
export const fonts = {
  note: "Literata_400Regular",
  noteMedium: "Literata_500Medium",
  ui: "InterTight_400Regular",
  uiMedium: "InterTight_500Medium",
} as const;

export const type = {
  display: {
    fontFamily: fonts.noteMedium,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  title: { fontFamily: fonts.noteMedium, fontSize: 22, lineHeight: 28 },
  name: { fontFamily: fonts.noteMedium, fontSize: 20, lineHeight: 26 },
  rowName: { fontFamily: fonts.noteMedium, fontSize: 16, lineHeight: 22 },
  note: { fontFamily: fonts.note, fontSize: 16, lineHeight: 26 },
  tabLetter: { fontFamily: fonts.noteMedium, fontSize: 13, lineHeight: 16 },
  body: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22 },
  rowText: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21 },
  secondary: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.uiMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: fonts.uiMedium, fontSize: 15, lineHeight: 20 },
  navigation: { fontFamily: fonts.uiMedium, fontSize: 13, lineHeight: 18 },
  scrubber: { fontFamily: fonts.note, fontSize: 10, lineHeight: 12 },
} as const;

export const sizes = {
  touch: 44,
  buttonSm: 36,
  button: 44,
  buttonLg: 52,
  tabHeight: 18,
  chip: 34,
  border: 1,
  borderStrong: 2,
  progress: 3,
  icon: 20,
  iconTab: 22,
  iconSmall: 14,
  iconStroke: 1.75,
  field: 46,
  askField: 54,
  noteField: 156,
  cardTabMinWidth: 30,
  cardPeekHeight: 20,
  toggleWidth: 50,
  toggleHeight: 30,
  toggleThumb: 22,
  toggleThumbOff: 3,
  toggleThumbOn: 23,
  dot: 10,
  dotRing: 18,
  badge: 8,
  alphaHeight: 312,
  graphHeight: 248,
  graphNodeWidth: 68,
  graphNodeHeight: 44,
  tabBar: 72,
} as const;

export const opacity = { disabled: 0.5, pressed: 0.85, shadow: 0.12 } as const;
export const depth = { radius: 12, x: 0, y: 6, elevation: 4 } as const;
export const routeMetrics = {
  height: 8,
  y: 4,
  radius: 2.5,
  stroke: 1.5,
  directWidth: 22,
  introWidth: 34,
  first: 3,
  directEnd: 19,
  introEnd: 31,
  middle: 17,
  directLineStart: 5,
  directLineEnd: 17,
  introFirstLineEnd: 14,
  introLastLineStart: 20,
  introLastLineEnd: 29,
  suggestedStart: 1,
  suggestedEnd: 21,
  dash: 3,
} as const;
export const graphLayout = {
  you: { x: 0.5, y: 0.5 },
  maya: { x: 0.19, y: 0.15 },
  jordan: { x: 0.81, y: 0.15 },
  priya: { x: 0.81, y: 0.84 },
  alex: { x: 0.19, y: 0.84 },
} as const;

export const motion = {
  cardFlipMs: 180,
  nearbyBreatheMs: 1600, // the only looping animation; disable under Reduce Motion
  nearbyScale: 1.35,
} as const;

export function useTheme() {
  const scheme = useColorScheme();
  const colors: Colors = scheme === "dark" ? palette.dark : palette.light;
  return {
    colors,
    space,
    layout,
    radius,
    type,
    sizes,
    fonts,
    motion,
    opacity,
    depth,
    scheme: scheme ?? "light",
  };
}
