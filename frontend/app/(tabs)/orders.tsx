/**
 * Orders history list.
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type Order } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Orders() {
  const router = useRouter();
  const { t, currency } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      api
        .get<Order[]>("/orders", true)
        .then((d) => mounted && setOrders(d))
        .catch(() => {})
        .finally(() => mounted && setLoading(false));
      return () => {
        mounted = false;
      };
    }, []),
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("tab_orders")}</Text>
      </View>
      {orders.length === 0 ? (
        <View style={styles.empty} testID="orders-empty">
          <Ionicons name="receipt-outline" size={56} color={colors.textDisabled} />
          <Text style={styles.emptyTitle}>{t("no_orders")}</Text>
          <Text style={styles.emptySub}>{t("no_orders_sub")}</Text>
          <Pressable onPress={() => router.push("/(tabs)")} style={styles.cta} testID="orders-shop-now">
            <Text style={styles.ctaText}>{t("continue_shopping")}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable style={styles.card} testID={`order-card-${item.id}`}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.orderId}>#{item.id}</Text>
                  <Text style={styles.orderDate}>
                    {new Date(item.placed_at).toLocaleDateString()} ·{" "}
                    {new Date(item.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <Text style={styles.itemsLine} numberOfLines={1}>
                {item.items.length} {t("items")} · {item.items.map((i) => i.image_emoji).slice(0, 5).join(" ")}
              </Text>
              <View style={styles.cardFooter}>
                <Text style={styles.total}>{formatPrice(item.total_lek, item.total_eur, currency)}</Text>
                <Text style={styles.cod}>{item.payment_method}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { padding: spacing.lg },
  title: { fontSize: 26, fontWeight: "700", color: colors.textMain, letterSpacing: -0.5 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.textMain, marginTop: 12 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  cta: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.lg, marginTop: 16 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orderId: { fontSize: 15, fontWeight: "700", color: colors.textMain },
  orderDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.primary, letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  itemsLine: { fontSize: 13, color: colors.textMuted },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  total: { fontSize: 18, fontWeight: "700", color: colors.textMain },
  cod: { fontSize: 11, color: colors.success, fontWeight: "700", letterSpacing: 0.5 },
});
