import React, { Children, Fragment, ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextProps,
  View,
  ViewStyle,
} from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColorName, type as typeScale, useTheme } from "../theme";

export type TextVariant = keyof typeof typeScale;

export function BText({
  variant = "body",
  color = "ink",
  style,
  ...rest
}: TextProps & { variant?: TextVariant; color?: ColorName }) {
  const { colors } = useTheme();
  return (
    <Text
      allowFontScaling
      {...rest}
      style={[typeScale[variant], { color: colors[color] }, style]}
    />
  );
}

export function Screen({
  children,
  footer,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const { colors, layout, space } = useTheme();
  const insets = useSafeAreaInsets();
  const body = (
    <View
      style={{
        paddingHorizontal: layout.gutter,
        paddingTop: space[3],
        paddingBottom: space[6] + insets.bottom,
        gap: layout.groupGap,
      }}
    >
      {children}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? (
        <View
          style={{
            paddingHorizontal: layout.gutter,
            paddingTop: layout.footerGap,
            paddingBottom: Math.max(space[4], insets.bottom),
            backgroundColor: colors.paper,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  left,
  right,
  accessory,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  accessory?: ReactNode;
}) {
  const { space, sizes } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      {left || right ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: sizes.touch,
            marginBottom: space[1],
          }}
        >
          {left ?? <View />}
          {right ?? <View />}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space[3],
        }}
      >
        <BText variant="display" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </BText>
        {accessory}
      </View>
      {subtitle ? (
        <BText variant="secondary" color="inkSoft">
          {subtitle}
        </BText>
      ) : null}
    </View>
  );
}

export function Section({
  label,
  action,
  children,
}: {
  label?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { layout, space } = useTheme();
  return (
    <View>
      {label ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: space[2],
            marginBottom: layout.labelGap,
          }}
        >
          <BText variant="label" color="inkSoft" accessibilityRole="header">
            {label}
          </BText>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Group({
  children,
  dashed = false,
  style,
}: {
  children: ReactNode;
  dashed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius, sizes } = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View
      style={[
        {
          backgroundColor: dashed ? colors.clear : colors.card,
          borderWidth: sizes.border,
          borderStyle: dashed ? "dashed" : "solid",
          borderColor: colors.cardEdge,
          borderRadius: radius.card,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <View
              style={{ height: sizes.border, backgroundColor: colors.rule }}
            />
          ) : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

export function Row({
  title,
  titleVariant = "rowText",
  subtitle,
  subtitleColor = "inkSoft",
  overline,
  trailing,
  chevron = false,
  onPress,
  accessibilityLabel,
  children,
}: {
  title: ReactNode;
  titleVariant?: TextVariant;
  subtitle?: string;
  subtitleColor?: ColorName;
  overline?: string;
  trailing?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const { colors, layout, space, sizes } = useTheme();
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[3],
        paddingVertical: layout.rowPadV,
        paddingHorizontal: layout.rowPadH,
        minHeight: layout.rowMinHeight,
      }}
    >
      <View style={{ flex: 1, minWidth: space[0], gap: space.half }}>
        {overline ? (
          <BText variant="label" color="inkSoft">
            {overline}
          </BText>
        ) : null}
        {typeof title === "string" ? (
          <BText variant={titleVariant}>{title}</BText>
        ) : (
          title
        )}
        {subtitle ? (
          <BText variant="secondary" color={subtitleColor}>
            {subtitle}
          </BText>
        ) : null}
        {children}
      </View>
      {trailing ??
        (chevron ? (
          <ChevronRight
            size={sizes.icon}
            color={colors.inkSoft}
            strokeWidth={sizes.iconStroke}
          />
        ) : null)}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.tab : colors.clear,
      })}
    >
      {content}
    </Pressable>
  );
}

export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const { colors, radius, sizes } = useTheme();
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? `Step ${value} of ${max}`}
      accessibilityValue={{ min: 0, max, now: value }}
      style={{
        height: sizes.progress,
        borderRadius: radius.chip,
        backgroundColor: colors.cardEdge,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: sizes.progress,
          backgroundColor: colors.ink,
        }}
      />
    </View>
  );
}

export function EmptyRow({
  title,
  actionLabel,
  onPress,
}: {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <Group dashed>
      <Row
        title={title}
        titleVariant="label"
        subtitle={actionLabel}
        subtitleColor="action"
        chevron={!!onPress}
        onPress={onPress}
      />
    </Group>
  );
}
