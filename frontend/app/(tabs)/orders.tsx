/**
 * Orders history list.
 *
 * Each order row expands to show item names, quantities, delivery address,
 * and totals — so users can see *what* they ordered, not just how many items.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Order } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

const STATUS_COLORS: Record<string, string> = {
  placed: "#2563EB",
  confirmed: "#F59E0B",
  packed: "#8B5CF6",
  out_for_delivery: "#0EA5E9",
  delivered: "#10B981",
  cancelled: "#DC2626",
};

const STATUS_LABELS: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function Orders() {
  const router = useRouter();
  const { t, currency } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which order cards are expanded (defaults to showing the top one).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      api
        .get<Order[]>("/orders", true)
        .then((d) => {
          if (!mounted) return;
          setOrders(d);
          // Auto-expand the most recent order for at-a-glance visibility.
          if (d.length > 0) setExpanded(new Set([d[0].id]));
        })
        .catch(() => {})
        .finally(() => mounted && setLoading(false));
      return () => {
        mounted = false;
      };
    }, []),
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
          renderItem={({ item }) => {
            const isOpen = expanded.has(item.id);
            const statusColor = STATUS_COLORS[item.status] || colors.primary;
            const statusLabel = STATUS_LABELS[item.status] || item.status.toUpperCase();
            const addr = item.address || {};
            const addrLine =
              [addr.line1, addr.area, addr.city].filter(Boolean).join(", ") ||
              addr.formatted_address ||
              "-";
            return (
              <Pressable
                style={styles.card}
                onPress={() => toggle(item.id)}
                testID={`order-card-${item.id}`}
              >
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderId}>#{item.id}</Text>
                    <Text style={styles.orderDate}>
                      {new Date(item.placed_at).toLocaleDateString()} ·{" "}
                      {new Date(item.placed_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${statusColor}1a` }]}>
                    <View style={[styles.dot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Always-visible summary */}
                <View style={styles.summaryLine}>
                  <Ionicons name="cube-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.summaryText} numberOfLines={1}>
                    {item.items.length} {item.items.length === 1 ? t("item") || "item" : t("items")} ·{" "}
                    {item.items
                      .slice(0, 3)
                      .map((i) => `${i.qty}× ${i.name}`)
                      .join(", ")}
                    {item.items.length > 3 ? `, +${item.items.length - 3} more` : ""}
                  </Text>
                </View>

                {/* Expanded details */}
                {isOpen && (
                  <View style={styles.details} testID={`order-details-${item.id}`}>
                    <Text style={styles.sectionLabel}>Items</Text>
                    <View style={styles.itemsList}>
                      {item.items.map((it) => (
                        <View key={it.product_id} style={styles.itemRow}>
                          <View style={styles.thumb}>
                            {it.image_url ? (
                              <Image
                                source={{ uri: resolveImageUrl(it.image_url) }}
                                style={styles.thumbImg}
                                resizeMode="contain"
                              />
                            ) : (
                              <Text style={styles.thumbEmoji}>{it.image_emoji || "🛒"}</Text>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemName} numberOfLines={2}>
                              {it.name}
                            </Text>
                            {it.unit ? <Text style={styles.itemUnit}>{it.unit}</Text> : null}
                          </View>
                          <View style={styles.itemQtyBox}>
                            <Text style={styles.itemQtyText}>×{it.qty}</Text>
                            <Text style={styles.itemLine}>
                              {formatPrice(it.line_lek, it.line_eur, currency)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    <View style={styles.sectionDivider} />

                    <Text style={styles.sectionLabel}>Delivery address</Text>
                    <View style={styles.addrRow}>
                      <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.addrText} numberOfLines={3}>
                        {addrLine}
                        {addr.state ? `, ${addr.state}` : ""}
                        {addr.country ? `, ${addr.country}` : ""}
                      </Text>
                    </View>
                    {addr.phone ? (
                      <View style={styles.addrRow}>
                        <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.addrText}>{addr.phone}</Text>
                      </View>
                    ) : null}

                    <View style={styles.sectionDivider} />

                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>{t("subtotal")}</Text>
                      <Text style={styles.priceValue}>
                        {formatPrice(item.subtotal_lek, item.subtotal_eur, currency)}
                      </Text>
                    </View>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>{t("delivery_fee")}</Text>
                      <Text
                        style={[
                          styles.priceValue,
                          item.delivery_fee_lek === 0 && { color: colors.success },
                        ]}
                      >
                        {item.delivery_fee_lek === 0
                          ? t("free")
                          : formatPrice(item.delivery_fee_lek, item.delivery_fee_eur, currency)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Footer: total + chevron */}
                <View style={styles.cardFooter}>
                  <View>
                    <Text style={styles.totalLabel}>{t("total")}</Text>
                    <Text style={styles.total}>
                      {formatPrice(item.total_lek, item.total_eur, currency)}
                    </Text>
                  </View>
                  <View style={styles.footerRight}>
                    <Text style={styles.cod}>{item.payment_method}</Text>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.textMuted}
                    />
                  </View>
                </View>
              </Pressable>
            );
          }}
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
  cta: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.lg,
    marginTop: 16,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: 4,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  orderId: { fontSize: 15, fontWeight: "700", color: colors.textMain, letterSpacing: 0.3 },
  orderDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  summaryLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryText: { fontSize: 12, color: colors.textMuted, flex: 1 },

  details: { marginTop: spacing.sm, gap: 4 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  itemsList: { gap: 8, marginTop: 6 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.background,
    padding: 8,
    borderRadius: radius.md,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  thumbImg: { width: 40, height: 40 },
  thumbEmoji: { fontSize: 22 },
  itemName: { fontSize: 13, fontWeight: "600", color: colors.textMain },
  itemUnit: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  itemQtyBox: { alignItems: "flex-end" },
  itemQtyText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  itemLine: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  sectionDivider: { height: 1, backgroundColor: colors.border, marginTop: spacing.sm },
  addrRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
  addrText: { flex: 1, fontSize: 12, color: colors.textMain, lineHeight: 16 },

  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  priceLabel: { fontSize: 12, color: colors.textMuted },
  priceValue: { fontSize: 13, fontWeight: "600", color: colors.textMain },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.5 },
  total: { fontSize: 18, fontWeight: "700", color: colors.textMain, marginTop: 2 },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  cod: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success,
    letterSpacing: 0.5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
