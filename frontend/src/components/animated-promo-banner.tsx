/**
 * AnimatedPromoBanner
 *
 * A visually-prominent free-shipping banner shown on the Home tab.
 * Uses react-native-reanimated for:
 *   • A shimmer gradient sweep that slides across the banner (~2.5s loop).
 *   • A subtle pulse (scale + opacity) on the "2000 L" highlight chip so
 *     the threshold catches the user's eye without being distracting.
 *
 * The heavier text ("FREE shipping" and "2000 L") is split from the base
 * label and rendered inline, so localization still works — everything after
 * the highlighted parts is passed through as the `sub` prop.
 */
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "@/src/theme";

type Props = {
  headline: string; // e.g. "FREE shipping"
  amount: string; // e.g. "2000 L"
  sub: string; // e.g. "Cash on delivery available"
  testID?: string;
};

export function AnimatedPromoBanner({ headline, amount, sub, testID }: Props) {
  const shimmer = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(shimmer);
      cancelAnimation(pulse);
    };
  }, [pulse, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(shimmer.value, [0, 1], [-200, 500]),
      },
    ],
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0, 0.55, 0]),
  }));

  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.08]) }],
    // Chip highlight background gets slightly brighter at peak.
    backgroundColor: pulse.value > 0.5 ? "#FFECB3" : "#FFF8E1",
  }));

  return (
    <View style={styles.wrap} testID={testID}>
      {/* Base gradient background */}
      <LinearGradient
        colors={[colors.primary, "#FF7A45", "#FF9059"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Moving shimmer highlight */}
      <Animated.View style={[styles.shimmerBand, shimmerStyle]} pointerEvents="none">
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Content */}
      <View style={styles.iconBadge}>
        <Ionicons name="rocket" size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.line}>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.headlineSub}> · </Text>
          <Animated.View style={[styles.chip, chipStyle]}>
            <Text style={styles.chipText}>{amount}</Text>
          </Animated.View>
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.lg,
    padding: spacing.base,
    overflow: "hidden",
    marginBottom: spacing.md,
    // Slight elevation for prominence
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  shimmerBand: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 120,
    transform: [{ skewX: "-20deg" }],
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  headline: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  headlineSub: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 14 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FFCA28",
  },
  chipText: { color: "#B26A00", fontWeight: "800", fontSize: 13, letterSpacing: 0.3 },
  sub: { color: "rgba(255,255,255,0.92)", fontSize: 11, marginTop: 3, fontWeight: "500" },
});
