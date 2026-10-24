import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Platform, View } from "react-native";
import * as Haptics from "expo-haptics";
import { MoreHorizontal } from "lucide-react-native";
import { useTheme } from "../theme";
import { BText } from "./primitives";
import { Button, IconButton } from "./buttons";
import { MarkedText, PersonCard } from "./people";

export function distanceBand(meters: number): string {
  if (meters <= 50) return "within ~50 m";
  if (meters <= 100) return "within ~100 m";
  return "within ~250 m";
}

export function NearbyMatchCard({
  name,
  headline,
  meters,
  summary,
  sharedTopics,
  starter,
  source,
  simulated = false,
  hapticOnMount = true,
  elevated = false,
  onRequestIntro,
  onDismiss,
  onMore,
}: {
  name: string;
  headline?: string;
  meters: number;
  summary: string;
  sharedTopics: string[];
  starter?: string;
  source: string;
  simulated?: boolean;
  hapticOnMount?: boolean;
  elevated?: boolean;
  onRequestIntro: () => void;
  onDismiss: () => void;
  onMore: () => void;
}) {
  const { colors, space, sizes } = useTheme();
  useEffect(() => {
    if (hapticOnMount)
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
  }, [hapticOnMount]);
  const line = headline
    ? `${headline}, ${distanceBand(meters)}`
    : distanceBand(meters).replace(/^w/, "W");
  return (
    <PersonCard
      name={name}
      role={line}
      tab={simulated ? "Nearby, simulated" : "Nearby now"}
      tabTone="nearby"
      elevated={elevated}
      accessory={
        <IconButton
          icon={
            <MoreHorizontal
              size={sizes.icon}
              color={colors.inkSoft}
              strokeWidth={sizes.iconStroke}
            />
          }
          onPress={onMore}
          accessibilityLabel="More: mute, block, report"
        />
      }
    >
      <MarkedText text={summary} marks={sharedTopics} tone="nearby" />
      <BText variant="secondary" color="inkSoft">
        {source}
      </BText>
      {starter ? (
        <BText variant="secondary" color="inkSoft">
          {starter}
        </BText>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        <View style={{ flexGrow: 1 }}>
          <Button
            label="Request intro"
            size="sm"
            variant="primary"
            fullWidth
            onPress={onRequestIntro}
          />
        </View>
        <Button label="Not now" size="sm" onPress={onDismiss} />
      </View>
    </PersonCard>
  );
}

export function NearbyDot({ state }: { state: "on" | "paused" | "off" }) {
  const { colors, sizes, radius, motion } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (current) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    scale.setValue(1);
    if (reduce || state !== "on") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: motion.nearbyScale,
          duration: motion.nearbyBreatheMs / 2,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: motion.nearbyBreatheMs / 2,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      scale.setValue(1);
    };
  }, [state, reduce, scale, motion]);
  if (state === "off")
    return (
      <View
        style={{
          width: sizes.dot,
          height: sizes.dot,
          borderRadius: radius.round,
          borderWidth: sizes.borderStrong,
          borderColor: colors.inkSoft,
        }}
      />
    );
  return (
    <View
      style={{
        width: sizes.dotRing,
        height: sizes.dotRing,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: sizes.dotRing,
          height: sizes.dotRing,
          borderRadius: radius.round,
          backgroundColor: state === "on" ? colors.nearbyWash : colors.tab,
          transform: [{ scale }],
        }}
      />
      <View
        style={{
          width: sizes.dot,
          height: sizes.dot,
          borderRadius: radius.round,
          backgroundColor: state === "on" ? colors.nearby : colors.inkSoft,
        }}
      />
    </View>
  );
}
