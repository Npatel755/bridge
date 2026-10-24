import React, { ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { X } from "lucide-react-native";
import { routeMetrics as g, useTheme } from "../theme";
import { BText, Row, TextVariant } from "./primitives";

export type RouteKind = "direct" | "intro" | "suggested";

export function RouteLine({
  kind,
  label,
  showLabel = true,
}: {
  kind: RouteKind;
  label: string;
  showLabel?: boolean;
}) {
  const { colors, space, type } = useTheme();
  const color =
    kind === "direct"
      ? colors.action
      : kind === "intro"
        ? colors.ink
        : colors.inkSoft;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[2],
        flexShrink: 1,
      }}
    >
      <Svg
        width={kind === "intro" ? g.introWidth : g.directWidth}
        height={g.height}
        aria-hidden
      >
        {kind === "suggested" ? (
          <Line
            x1={g.suggestedStart}
            y1={g.y}
            x2={g.suggestedEnd}
            y2={g.y}
            stroke={color}
            strokeWidth={g.stroke}
            strokeDasharray={[g.dash, g.dash]}
          />
        ) : (
          <>
            <Circle cx={g.first} cy={g.y} r={g.radius} fill={color} />
            <Line
              x1={g.directLineStart}
              y1={g.y}
              x2={kind === "intro" ? g.introFirstLineEnd : g.directLineEnd}
              y2={g.y}
              stroke={color}
              strokeWidth={g.stroke}
            />
            {kind === "intro" ? (
              <>
                <Circle
                  cx={g.middle}
                  cy={g.y}
                  r={g.radius}
                  fill="none"
                  stroke={color}
                  strokeWidth={g.stroke}
                />
                <Line
                  x1={g.introLastLineStart}
                  y1={g.y}
                  x2={g.introLastLineEnd}
                  y2={g.y}
                  stroke={color}
                  strokeWidth={g.stroke}
                />
              </>
            ) : null}
            <Circle
              cx={kind === "intro" ? g.introEnd : g.directEnd}
              cy={g.y}
              r={g.radius}
              fill={color}
            />
          </>
        )}
      </Svg>
      {showLabel ? (
        <Text style={{ ...type.label, color, flexShrink: 1 }}>{label}</Text>
      ) : null}
    </View>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function splitMarks(
  text: string,
  marks: string[],
): { text: string; marked: boolean }[] {
  const clean = [...new Set(marks.map((m) => m.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (!clean.length) return [{ text, marked: false }];
  const re = new RegExp(`(${clean.map(escapeRegExp).join("|")})`, "gi");
  const lower = clean.map((m) => m.toLowerCase());
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      marked: lower.includes(part.toLowerCase()),
    }));
}

export function MarkedText({
  text,
  marks,
  tone = "evidence",
  variant = "note",
}: {
  text: string;
  marks: string[];
  tone?: "evidence" | "nearby";
  variant?: TextVariant;
}) {
  const { colors } = useTheme();
  const backgroundColor =
    tone === "evidence" ? colors.highlight : colors.nearbyWash;
  const color = tone === "evidence" ? colors.onHighlight : colors.nearbyInk;
  return (
    <BText variant={variant}>
      {splitMarks(text, marks).map((part, index) => (
        <Text
          key={index}
          style={part.marked ? { backgroundColor, color } : undefined}
        >
          {part.text}
        </Text>
      ))}
    </BText>
  );
}

export function Evidence({
  quote,
  marks,
  source,
  stale = false,
}: {
  quote: string;
  marks: string[];
  source: string;
  stale?: boolean;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      <MarkedText text={`“${quote}”`} marks={marks} />
      <BText variant="secondary" color={stale ? "cautionInk" : "inkSoft"}>
        {stale ? `${source}. Might be out of date.` : source}
      </BText>
    </View>
  );
}

export type TagVariant = "stated" | "suggested" | "selected";
export function Tag({
  label,
  variant = "stated",
  onPress,
  onRemove,
}: {
  label: string;
  variant?: TagVariant;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  const { colors, radius, sizes, type, space } = useTheme();
  const backgroundColor =
    variant === "selected"
      ? colors.ink
      : variant === "stated"
        ? colors.tab
        : colors.clear;
  const color =
    variant === "selected"
      ? colors.card
      : variant === "stated"
        ? colors.ink
        : colors.inkSoft;
  const borderColor =
    variant === "selected"
      ? colors.ink
      : variant === "stated"
        ? colors.tab
        : colors.cardEdge;
  const text = variant === "suggested" ? `Suggested: ${label}` : label;
  const body = (
    <View
      style={{
        minHeight: onPress || onRemove ? sizes.touch : sizes.chip,
        paddingVertical: space[2],
        paddingLeft: space[3],
        paddingRight: onRemove ? space[0] : space[3],
        borderRadius: radius.chip,
        backgroundColor,
        borderWidth: sizes.border,
        borderStyle: variant === "suggested" ? "dashed" : "solid",
        borderColor,
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        maxWidth: "100%",
      }}
    >
      <Text style={{ ...type.label, color, flexShrink: 1 }}>{text}</Text>
      {onRemove ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          style={{
            minWidth: sizes.touch,
            minHeight: sizes.touch,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X
            size={sizes.iconSmall}
            color={color}
            strokeWidth={sizes.iconStroke}
          />
        </Pressable>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: variant === "selected" }}
      accessibilityLabel={text}
      style={{ maxWidth: "100%" }}
    >
      {body}
    </Pressable>
  );
}
export function TagList({ children }: { children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {children}
    </View>
  );
}

export type TabTone = "card" | "highlight" | "nearby";
export function PersonCard({
  name,
  role,
  tab,
  tabTone = "card",
  route,
  accessory,
  front = false,
  elevated = false,
  onPress,
  children,
  tabOffset = 0,
  nameVariant = "name",
}: {
  name: string;
  role?: string;
  tab: string;
  tabTone?: TabTone;
  route?: { kind: RouteKind; label: string };
  accessory?: ReactNode;
  front?: boolean;
  elevated?: boolean;
  onPress?: () => void;
  children?: ReactNode;
  tabOffset?: number;
  nameVariant?: "name" | "rowName";
}) {
  const { colors, layout, radius, sizes, space, depth, opacity, type } =
    useTheme();
  const { fontScale } = useWindowDimensions();
  // README §§2/8 reserve lime for evidence, while §5 also asks for lime tabs.
  // Preserve the public tabTone name; use a neutral selected tab to honor the review checklist.
  const tabBg =
    tabTone === "highlight"
      ? colors.tab
      : tabTone === "nearby"
        ? colors.nearby
        : colors.card;
  const tabFg = tabTone === "nearby" ? "onNearby" : "inkSoft";
  const tabType = tabTone === "nearby" ? type.label : type.tabLetter;
  const tabHeight = Math.max(
    sizes.tabHeight,
    tabType.lineHeight * fontScale + sizes.borderStrong,
  );
  const top = tabHeight - sizes.border;
  const head = (
    <View
      style={{ flexDirection: "row", alignItems: "flex-start", gap: space[2] }}
    >
      <View
        accessible
        accessibilityLabel={[name, route?.label, role]
          .filter(Boolean)
          .join(", ")}
        style={{ flex: 1, minWidth: space[0], gap: space.half }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: space[2],
          }}
        >
          <BText variant={nameVariant} style={{ flex: 1, minWidth: space[0] }}>
            {name}
          </BText>
          {route ? (
            <View style={{ marginTop: layout.cardRouteOffset, flexShrink: 1 }}>
              <RouteLine kind={route.kind} label={route.label} />
            </View>
          ) : null}
        </View>
        {role ? (
          <BText variant="secondary" color="inkSoft">
            {role}
          </BText>
        ) : null}
      </View>
      {accessory}
    </View>
  );
  const body = (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: sizes.border,
          borderColor: colors.cardEdge,
          borderRadius: radius.card,
          padding: layout.cardPad,
          gap: space[3],
        },
        tabTone === "nearby"
          ? {
              borderTopWidth: sizes.borderStrong,
              borderTopColor: colors.nearby,
            }
          : null,
        elevated
          ? {
              shadowColor: colors.shadow,
              shadowOpacity: opacity.shadow,
              shadowRadius: depth.radius,
              shadowOffset: { width: depth.x, height: depth.y },
              elevation: depth.elevation,
            }
          : null,
      ]}
    >
      {head}
      {children}
    </View>
  );
  return (
    <View style={{ paddingTop: top }}>
      {front ? (
        <>
          <View
            style={{
              position: "absolute",
              top: top - space[2],
              left: layout.cardPeekFarInset,
              right: layout.cardPeekFarInset,
              height: sizes.cardPeekHeight,
              borderRadius: radius.card,
              backgroundColor: colors.stackEdge2,
            }}
          />
          <View
            style={{
              position: "absolute",
              top: top - space[1],
              left: layout.cardPeekNearInset,
              right: layout.cardPeekNearInset,
              height: sizes.cardPeekHeight,
              borderRadius: radius.card,
              backgroundColor: colors.stackEdge1,
            }}
          />
        </>
      ) : null}
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={route ? `${name}, ${route.label}` : name}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: "absolute",
          top: space[0],
          left: layout.cardTabInset + tabOffset,
          minHeight: tabHeight,
          minWidth: sizes.cardTabMinWidth,
          paddingHorizontal: layout.cardTabPad,
          backgroundColor: tabBg,
          borderWidth: sizes.border,
          borderBottomWidth: space[0],
          borderColor: tabTone === "nearby" ? colors.nearby : colors.cardEdge,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BText
          variant={tabTone === "nearby" ? "label" : "tabLetter"}
          color={tabFg}
        >
          {tab}
        </BText>
      </View>
    </View>
  );
}

export function PersonRow({
  name,
  reason,
  stale = false,
  overline,
  route,
  onPress,
  tab,
  tabOffset = 0,
}: {
  name: string;
  reason?: string;
  stale?: boolean;
  overline?: string;
  route?: { kind: RouteKind; label: string };
  onPress?: () => void;
  tab?: string;
  tabOffset?: number;
}) {
  const { colors, sizes, layout, radius, space, type } = useTheme();
  const { fontScale } = useWindowDimensions();
  const tabHeight = Math.max(
    sizes.tabHeight,
    type.tabLetter.lineHeight * fontScale,
  );
  const row = (
    <Row
      title={name}
      titleVariant="rowName"
      subtitle={reason}
      subtitleColor={stale ? "cautionInk" : "inkSoft"}
      overline={overline}
      trailing={
        route ? <RouteLine kind={route.kind} label={route.label} /> : undefined
      }
      onPress={onPress}
      accessibilityLabel={[overline, name, reason, route?.label]
        .filter(Boolean)
        .join(", ")}
    />
  );
  if (!tab) return row;
  return (
    <View style={{ paddingTop: tabHeight }}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: "absolute",
          left: layout.cardTabInset + tabOffset,
          top: space[0],
          minWidth: sizes.cardTabMinWidth,
          minHeight: tabHeight,
          backgroundColor: colors.tab,
          paddingHorizontal: layout.cardTabPad,
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
        }}
      >
        <BText variant="tabLetter" color="inkSoft">
          {tab}
        </BText>
      </View>
      {row}
    </View>
  );
}
