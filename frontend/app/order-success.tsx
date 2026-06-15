/**
 * Order success screen.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function OrderSuccess() {
  const { id, eta } = useLocalSearchParams<{ id: string; eta: string }>();
  const router = useRouter();
  const { t } = useApp();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={64} color="#fff" />
        </View>
        <Text style={styles.title} testID="success-title">{t("order_placed")}</Text>
        <Text style={styles.sub}>{t("eta")} {eta} {t("minutes")}</Text>
        <View style={styles.idCard}>
          <Text style={styles.idLabel}>{t("order_id")}</Text>
          <Text style={styles.idVal} testID="success-order-id">#{id}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Pressable
          style={[styles.cta, styles.ctaSecondary]}
          onPress={() => router.replace("/(tabs)/orders")}
          testID="success-view-orders"
        >
          <Text style={styles.ctaSecondaryText}>{t("view_orders")}</Text>
        </Pressable>
        <Pressable
          style={styles.cta}
          onPress={() => router.replace("/(tabs)")}
          testID="success-continue"
        >
          <Text style={styles.ctaText}>{t("continue_shopping")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 12 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.textMain, marginTop: 8, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: colors.textMuted },
  idCard: { marginTop: spacing.lg, backgroundColor: colors.primaryLight, borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 14, alignItems: "center" },
  idLabel: { fontSize: 11, color: colors.primary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  idVal: { fontSize: 22, fontWeight: "700", color: colors.textMain, marginTop: 2 },
  footer: { padding: spacing.lg, gap: 10 },
  cta: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  ctaSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  ctaSecondaryText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
});
