/**
 * Admin Orders list — filter by status, date, and search by id/phone.
 * Tapping a row opens /admin/order-detail?id=...
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";

type Order = {
  id: string;
  status: string;
  total_lek: number;
  placed_at: string;
  address: any;
  customer_name?: string;
  customer_phone?: string;
  items: any[];
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  placed: { label: "Placed", color: "#B26A00", bg: "#FFF8E1" },
  confirmed: { label: "Confirmed", color: "#1565C0", bg: "#E3F2FD" },
  packed: { label: "Packed", color: "#6A1B9A", bg: "#F3E5F5" },
  out_for_delivery: { label: "Out for delivery", color: "#EF6C00", bg: "#FFF3E0" },
  delivered: { label: "Delivered", color: "#2E7D32", bg: "#E8F5E9" },
  cancelled: { label: "Cancelled", color: "#C62828", bg: "#FFEBEE" },
};
const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "placed", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "packed", label: "Packed" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

function fmtLek(n: number) {
  return `${Math.round(n).toLocaleString()} L`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AdminOrders() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(params.status || "all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") qs.set("status", statusFilter);
      if (debouncedQ) qs.set("q", debouncedQ);
      qs.set("limit", "200");
      const res = await api.get<{ orders: Order[]; count: number }>(`/admin/orders?${qs.toString()}`, true);
      setOrders(res.orders);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const totalRevenue = useMemo(
    () => orders.reduce((s, o) => (o.status === "cancelled" ? s : s + (o.total_lek || 0)), 0),
    [orders],
  );

  return (
    <View style={styles.wrap} testID="admin-orders">
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Orders</Text>
          <Text style={styles.subtitle}>
            {orders.length} order{orders.length === 1 ? "" : "s"} · {fmtLek(totalRevenue)} total
          </Text>
        </View>
        <Pressable onPress={onRefresh} style={styles.refreshBtn} testID="orders-refresh">
          <Ionicons name="refresh" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by order ID or phone…"
          placeholderTextColor={colors.textDisabled}
          style={styles.searchInput}
          testID="orders-search"
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Status filter chips */}
      <FlatList
        data={FILTERS}
        keyExtractor={(f) => f.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const active = statusFilter === item.key;
          const meta = item.key !== "all" ? STATUS_META[item.key] : null;
          return (
            <Pressable
              onPress={() => setStatusFilter(item.key)}
              style={[
                styles.chip,
                active && (meta ? { backgroundColor: meta.color, borderColor: meta.color } : { backgroundColor: colors.primary, borderColor: colors.primary }),
              ]}
              testID={`orders-chip-${item.key}`}
            >
              <Text style={[styles.chipText, active && { color: "#fff" }]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={colors.textDisabled} />
              <Text style={styles.emptyText}>No orders match this filter.</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status] || STATUS_META.placed;
            return (
              <Pressable
                onPress={() => router.push(`/admin/order-detail?id=${item.id}` as any)}
                style={styles.card}
                testID={`orders-row-${item.id}`}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardId}>#{item.id}</Text>
                    <Text style={styles.cardDate}>{fmtDate(item.placed_at)}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                    <Text style={{ color: meta.color, fontSize: 11, fontWeight: "800" }}>{meta.label}</Text>
                  </View>
                </View>
                <View style={styles.cardBody}>
                  <Ionicons name="person" size={14} color={colors.textMuted} />
                  <Text style={styles.cardCustomer} numberOfLines={1}>
                    {item.customer_name || "Customer"} · {item.customer_phone || item.address?.phone || "—"}
                  </Text>
                </View>
                <View style={styles.cardBody}>
                  <Ionicons name="location" size={14} color={colors.textMuted} />
                  <Text style={styles.cardAddr} numberOfLines={1}>
                    {[item.address?.line1, item.address?.city].filter(Boolean).join(", ") || "No address"}
                  </Text>
                </View>
                <View style={styles.cardFoot}>
                  <Text style={styles.cardItems}>{item.items?.length || 0} item{(item.items?.length || 0) === 1 ? "" : "s"}</Text>
                  <Text style={styles.cardTotal}>{fmtLek(item.total_lek)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 22, fontWeight: "800", color: colors.textMain, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: colors.textMain },
  filterRow: { gap: 8, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.textMain },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: 10, gap: 6,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardId: { fontSize: 14, fontWeight: "800", color: colors.textMain },
  cardDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  cardBody: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardCustomer: { flex: 1, fontSize: 12, color: colors.textMain, fontWeight: "600" },
  cardAddr: { flex: 1, fontSize: 12, color: colors.textMuted },
  cardFoot: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4,
  },
  cardItems: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  cardTotal: { fontSize: 15, fontWeight: "800", color: colors.textMain },
  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});
