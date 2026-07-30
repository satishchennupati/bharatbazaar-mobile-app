/**
 * Admin Dashboard — KPIs, recent orders, top products, low-stock alerts.
 * Fetches from GET /api/admin/dashboard/summary.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { colors, radius, spacing } from "@/src/theme";
import { useApp } from "@/src/store/app-context";

type Summary = {
  today_orders: number;
  today_revenue_lek: number;
  pending_orders: number;
  total_orders: number;
  total_customers: number;
  status_breakdown: Record<string, number>;
  top_products: { product_id: string; name: string; qty: number; revenue_lek: number }[];
  recent_orders: { id: string; status: string; total_lek: number; placed_at: string; address: any }[];
  order_statuses: string[];
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  placed: { label: "Placed", color: "#B26A00", bg: "#FFF8E1", icon: "receipt" },
  confirmed: { label: "Confirmed", color: "#1565C0", bg: "#E3F2FD", icon: "checkmark-circle" },
  packed: { label: "Packed", color: "#6A1B9A", bg: "#F3E5F5", icon: "cube" },
  out_for_delivery: { label: "Out for delivery", color: "#EF6C00", bg: "#FFF3E0", icon: "bicycle" },
  delivered: { label: "Delivered", color: "#2E7D32", bg: "#E8F5E9", icon: "checkmark-done-circle" },
  cancelled: { label: "Cancelled", color: "#C62828", bg: "#FFEBEE", icon: "close-circle" },
};

function fmtLek(n: number) {
  return `${Math.round(n).toLocaleString()} L`;
}

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  } catch {
    return "";
  }
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useApp();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Summary>("/admin/dashboard/summary", true);
      setData(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const kpis = [
    { key: "today", icon: "today", label: "Today's orders", value: `${data?.today_orders ?? 0}`, tint: "#E3F2FD", color: "#1565C0" },
    { key: "rev", icon: "cash", label: "Today's revenue", value: fmtLek(data?.today_revenue_lek ?? 0), tint: "#E8F5E9", color: "#2E7D32" },
    { key: "pending", icon: "hourglass", label: "Pending orders", value: `${data?.pending_orders ?? 0}`, tint: "#FFF3E0", color: "#EF6C00" },
    { key: "total", icon: "receipt-outline", label: "Total orders", value: `${data?.total_orders ?? 0}`, tint: "#F3E5F5", color: "#6A1B9A" },
    { key: "cust", icon: "people", label: "Customers", value: `${data?.total_customers ?? 0}`, tint: "#FFF0ED", color: colors.primary },
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      testID="admin-dashboard"
    >
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hi}>Welcome back,</Text>
          <Text style={styles.name}>{user?.full_name || "Admin"} 👋</Text>
          <Text style={styles.hint}>Snapshot of your store today. Pull to refresh.</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="analytics" size={30} color={colors.primary} />
        </View>
      </View>

      {/* KPI cards */}
      <View style={styles.kpiGrid}>
        {kpis.map((k) => (
          <View key={k.key} style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: k.tint }]}>
              <Ionicons name={k.icon as any} size={20} color={k.color} />
            </View>
            <Text style={styles.kpiValue}>{k.value}</Text>
            <Text style={styles.kpiLabel}>{k.label}</Text>
          </View>
        ))}
      </View>

      {/* Status breakdown */}
      <SectionHeader title="Orders by status" />
      <View style={styles.pills}>
        {(data?.order_statuses || Object.keys(STATUS_META)).map((s) => {
          const meta = STATUS_META[s] || { label: s, color: colors.textMuted, bg: colors.surfaceMuted, icon: "ellipse" };
          const count = data?.status_breakdown?.[s] ?? 0;
          return (
            <Pressable
              key={s}
              onPress={() => router.push({ pathname: "/admin/orders", params: { status: s } } as any)}
              style={[styles.pill, { backgroundColor: meta.bg }]}
              testID={`admin-status-pill-${s}`}
            >
              <Ionicons name={meta.icon as any} size={14} color={meta.color} />
              <Text style={[styles.pillLabel, { color: meta.color }]}>{meta.label}</Text>
              <Text style={[styles.pillCount, { color: meta.color }]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Recent orders */}
      <SectionHeader
        title="Recent orders"
        action={
          <Pressable onPress={() => router.push("/admin/orders")}>
            <Text style={styles.link}>View all →</Text>
          </Pressable>
        }
      />
      <View style={styles.list}>
        {(data?.recent_orders || []).length === 0 ? (
          <Text style={styles.emptyText}>No orders yet.</Text>
        ) : (
          (data?.recent_orders || []).map((o) => {
            const meta = STATUS_META[o.status] || STATUS_META.placed;
            return (
              <Pressable
                key={o.id}
                onPress={() => router.push(`/admin/order-detail?id=${o.id}` as any)}
                style={styles.row}
                testID={`admin-recent-${o.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{o.id}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {o.address?.city || o.address?.line1 || "Address"} · {timeAgo(o.placed_at)}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>{fmtLek(o.total_lek)}</Text>
                <View style={[styles.rowBadge, { backgroundColor: meta.bg }]}>
                  <Text style={{ color: meta.color, fontSize: 10, fontWeight: "700" }}>{meta.label}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* Top products */}
      <SectionHeader title="Top products · last 7 days" />
      <View style={styles.list}>
        {(data?.top_products || []).length === 0 ? (
          <Text style={styles.emptyText}>Not enough recent order data.</Text>
        ) : (
          (data?.top_products || []).map((p, i) => (
            <View key={p.product_id || i} style={styles.row}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.rowSub}>{p.qty} sold</Text>
              </View>
              <Text style={styles.rowAmount}>{fmtLek(p.revenue_lek)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  wrap: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  hero: {
    flexDirection: "row", alignItems: "center", gap: spacing.lg,
    backgroundColor: colors.primaryLight, borderRadius: radius.xl, padding: spacing.lg,
  },
  hi: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  name: { fontSize: 20, fontWeight: "800", color: colors.textMain, marginTop: 2 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    flexGrow: 1, flexBasis: 140,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: 14,
  },
  kpiIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  kpiValue: { fontSize: 20, fontWeight: "800", color: colors.textMain, letterSpacing: -0.3 },
  kpiLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  section: { fontSize: 15, fontWeight: "800", color: colors.textMain },
  link: { fontSize: 12, fontWeight: "700", color: colors.primary },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  pillLabel: { fontSize: 12, fontWeight: "700" },
  pillCount: {
    fontSize: 11, fontWeight: "800",
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    minWidth: 18, textAlign: "center",
  },
  list: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.textMain },
  rowSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 13, fontWeight: "800", color: colors.textMain, marginRight: 6 },
  rowBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  rank: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  rankText: { fontSize: 11, fontWeight: "800", color: colors.primary },
  emptyText: { padding: spacing.lg, color: colors.textMuted, textAlign: "center", fontSize: 12 },
});
