import React from "react";
import { TextInput, TextInputProps, View } from "react-native";
import { Mic, Search } from "lucide-react-native";
import { useTheme } from "../theme";
import { IconButton } from "./buttons";
import { BText } from "./primitives";

export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmit,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  onSubmit?: () => void;
}) {
  const { colors, radius, sizes, type, space, layout } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: layout.labelGap,
        minHeight: sizes.field,
        paddingHorizontal: layout.fieldPadH,
        backgroundColor: colors.card,
        borderWidth: sizes.border,
        borderColor: colors.cardEdge,
        borderRadius: radius.card,
      }}
    >
      <Search
        size={sizes.icon}
        color={colors.inkSoft}
        strokeWidth={sizes.iconStroke}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        returnKeyType="search"
        style={{
          flex: 1,
          minWidth: space[0],
          ...type.note,
          color: colors.ink,
          paddingVertical: space[2],
        }}
      />
    </View>
  );
}

export function AskField({
  value,
  onChangeText,
  onSubmit,
  onDictate,
  placeholder = "Who can help prototype a bike light?",
  embedded = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onDictate?: () => void;
  placeholder?: string;
  embedded?: boolean;
}) {
  const { colors, radius, sizes, type, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[1],
        paddingLeft: space[4],
        paddingRight: space[1],
        minHeight: sizes.askField,
        backgroundColor: embedded ? colors.clear : colors.card,
        borderWidth: embedded ? space[0] : sizes.border,
        borderColor: colors.cardEdge,
        borderRadius: radius.card,
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel="Ask your network"
        returnKeyType="search"
        multiline
        style={{
          flex: 1,
          minWidth: space[0],
          ...type.note,
          color: colors.ink,
          paddingVertical: space[3],
        }}
      />
      {onDictate ? (
        <IconButton
          icon={
            <Mic
              size={sizes.icon}
              color={colors.action}
              strokeWidth={sizes.iconStroke}
            />
          }
          onPress={onDictate}
          accessibilityLabel="Dictate a question"
        />
      ) : null}
    </View>
  );
}

/** Unframed inside a Group: labelled input, never a nested box. */
export function Field({
  label,
  value,
  onChangeText,
  multiline,
  placeholder,
  ...rest
}: TextInputProps & { label: string }) {
  const { colors, space, layout, sizes, type } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: layout.rowPadH,
        paddingVertical: layout.rowPadV,
        gap: space[2],
      }}
    >
      <BText variant="label" color="inkSoft">
        {label}
      </BText>
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        accessibilityLabel={label}
        style={{
          ...type.note,
          color: colors.ink,
          minHeight: multiline ? sizes.noteField : sizes.touch,
          padding: space[0],
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
