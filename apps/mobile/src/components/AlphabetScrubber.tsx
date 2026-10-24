import React, { useState } from "react";
import { Platform, Pressable, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import { BText, useTheme } from "../bridge-design-system";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
type KeyDownEvent = Parameters<
  NonNullable<React.ComponentProps<typeof Pressable>["onKeyDown"]>
>[0];
/** One adjustable control with a 44px-wide target; letters aren't 26 overlapping buttons. */
// README §6 asks for inkFaint; §§3/8 reserve it for placeholders and require contrast.
// Use inkSoft for the alphabet and keep selection neutral, as with selected card tabs.
export function AlphabetScrubber({
  value,
  onChange,
}: {
  value: string;
  onChange: (letter: string) => void;
}) {
  const { sizes, type, colors, radius } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [height, setHeight] = useState<number>(sizes.alphaHeight);
  const choose = (index: number) => {
    const letter = alphabet[Math.max(0, Math.min(alphabet.length - 1, index))];
    if (letter === value) return;
    void Haptics.selectionAsync().catch(() => {});
    onChange(letter);
  };
  // Native adjustable actions have explicit ARIA and keyboard equivalents on web.
  const webProps =
    Platform.OS === "web"
      ? {
          "aria-valuemin": 0,
          "aria-valuemax": alphabet.length - 1,
          "aria-valuenow": Math.max(0, alphabet.indexOf(value)),
          "aria-valuetext": value || "All surnames",
          onKeyDown: (event: KeyDownEvent) => {
            const key = (event.nativeEvent as { key?: string }).key;
            if (!key) return;
            if (
              [
                "ArrowDown",
                "ArrowRight",
                "ArrowUp",
                "ArrowLeft",
                "Home",
                "End",
              ].includes(key)
            ) {
              event.preventDefault();
              choose(
                key === "Home"
                  ? 0
                  : key === "End"
                    ? alphabet.length - 1
                    : alphabet.indexOf(value) +
                      (["ArrowDown", "ArrowRight"].includes(key) ? 1 : -1),
              );
            }
          },
        }
      : {};
  return (
    <Pressable
      {...webProps}
      focusable
      accessibilityRole="adjustable"
      accessibilityLabel="Browse by surname. Swipe up or down to change letter."
      accessibilityValue={{
        min: 0,
        max: alphabet.length - 1,
        now: Math.max(0, alphabet.indexOf(value)),
        text: value || "All surnames",
      }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) =>
        choose(
          alphabet.indexOf(value) +
            (event.nativeEvent.actionName === "increment" ? 1 : -1),
        )
      }
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      onPress={(event) =>
        choose(
          Math.floor((event.nativeEvent.locationY / height) * alphabet.length),
        )
      }
      style={{
        minWidth: sizes.touch,
        minHeight: Math.max(
          sizes.alphaHeight,
          type.scrubber.lineHeight * fontScale * alphabet.length,
        ),
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {alphabet.map((letter) => (
        <View
          key={letter}
          style={{
            borderRadius: radius.chip,
            backgroundColor: letter === value ? colors.tab : colors.clear,
          }}
        >
          <BText variant="scrubber" color="inkSoft">
            {letter}
          </BText>
        </View>
      ))}
    </Pressable>
  );
}
