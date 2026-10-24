import React, { ReactNode } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme";
import { BText } from "./primitives";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function Button({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  fullWidth = false,
  disabled = false,
  icon,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
}) {
  const { colors, radius, sizes, space, opacity } = useTheme();
  const minimum = size === "lg" ? sizes.buttonLg : sizes.touch;
  const textOnly = variant === "ghost" || variant === "danger";
  const backgroundColor =
    variant === "primary"
      ? colors.action
      : variant === "secondary"
        ? colors.card
        : colors.clear;
  const borderColor =
    variant === "primary"
      ? colors.action
      : variant === "secondary"
        ? colors.cardEdge
        : colors.clear;
  const color =
    variant === "primary"
      ? "onAction"
      : variant === "secondary"
        ? "ink"
        : variant === "ghost"
          ? "action"
          : "dangerInk";
  return (
    <Pressable
      onPress={() => {
        if (variant === "primary")
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
        onPress?.();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        minHeight: minimum,
        minWidth: sizes.touch,
        paddingVertical: space[3],
        paddingHorizontal: textOnly ? space[2] : space[4],
        borderRadius: radius.card,
        backgroundColor,
        borderWidth: sizes.border,
        borderColor,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space[2],
        alignSelf: fullWidth ? "stretch" : "flex-start",
        opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
      })}
    >
      {icon}
      <BText
        variant={size === "sm" ? "label" : "button"}
        color={color}
        style={{ flexShrink: 1, textAlign: "center" }}
      >
        {label}
      </BText>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const { colors, sizes, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        minWidth: sizes.touch,
        minHeight: sizes.touch,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.card,
        backgroundColor: pressed ? colors.tab : colors.clear,
      })}
    >
      {icon}
    </Pressable>
  );
}

export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  tone = "action",
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
  tone?: "action" | "nearby";
}) {
  const { colors, sizes, radius } = useTheme();
  const on = tone === "nearby" ? colors.nearby : colors.action;
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onValueChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      style={{
        minHeight: sizes.touch,
        minWidth: sizes.toggleWidth,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: sizes.toggleWidth,
          height: sizes.toggleHeight,
          borderRadius: radius.round,
          borderWidth: sizes.border,
          borderColor: value ? on : colors.cardEdge,
          backgroundColor: value ? on : colors.tab,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: sizes.toggleThumb,
            height: sizes.toggleThumb,
            borderRadius: radius.round,
            backgroundColor: colors.card,
            marginLeft: value ? sizes.toggleThumbOn : sizes.toggleThumbOff,
          }}
        />
      </View>
    </Pressable>
  );
}
