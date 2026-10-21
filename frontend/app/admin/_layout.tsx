/**
 * Admin panel layout.
 * - On mobile (< 768px width): tabbed layout, tab bar at the bottom.
 * - On web / tablet (>= 768px width): sidebar on the left with vertical nav.
 * Guards all `/admin/*` routes except `/admin/login` — non-admin users are
 * redirected to the admin login screen.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Slot, useRouter, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "@/src/theme";
import { useApp } from "@/src/store/app-context";

const TABS = [
  { key: "index", label: "Dashboard", icon: "grid-outline" as const, path: "/admin", adminOnly: true },
  { key: "orders", label: "Orders", icon: "receipt-outline" as const, path: "/admin/orders", adminOnly: false },
  { key: "products", label: "Products", icon: "cube-outline" as const, path: "/admin/products", adminOnly: true },
  { key: "offers", label: "Offers", icon: "pricetag-outline" as const, path: "/admin/offers", adminOnly: true },
  { key: "settings", label: "Shipping", icon: "car-outline" as const, path: "/admin/settings", adminOnly: true },
];

export default function AdminLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { user, ready, token, clearSession } = useApp();
  const { width } = useWindowDimensions();
  const [checked, setChecked] = useState(false);

  const isWide = width >= 768;
  const isLogin = segments[segments.length - 1] === "login";
  // Orders-only staff see a restricted panel (Orders tab only).
  const isStaff = !!user && user.role === "orders_staff";
  const tabs = isStaff ? TABS.filter((t) => !t.adminOnly) : TABS;

  useEffect(() => {
    if (!ready) return;
    if (isLogin) {
      setChecked(true);
      return;
    }
    if (!token || !user?.is_admin) {
      router.replace("/admin/login");
      return;
    }
    // Staff cannot access the dashboard or other admin-only screens — send
    // them to Orders if they land on a restricted route.
    if (isStaff) {
      const last = segments[segments.length - 1];
      const restricted = last === "admin" || last === "index" || last === "products" || last === "offers" || last === "settings";
      if (restricted) {
        router.replace("/admin/orders");
        return;
      }
    }
    setChecked(true);
  }, [ready, token, user, isLogin, isStaff, segments, router]);

  if (isLogin) return <Slot />;
  if (!checked) return null;

  const activeKey = (() => {
    const last = segments[segments.length - 1];
    if (last === "admin" || last === "index") return "index";
    return last;
  })();

  const onLogout = async () => {
    await clearSession();
    router.replace("/admin/login");
  };

  // Return to the customer-facing app WITHOUT logging out (session persists).
  const goToApp = () => router.replace("/(tabs)");

  if (isWide) {
    return (
      <SafeAreaView style={styles.wideSafe} edges={["top"]}>
        <View style={styles.wideRow}>
          <View style={styles.sidebar}>
            <View style={styles.brand}>
              <Text style={styles.brandDot}>🛒</Text>
              <View>
                <Text style={styles.brandTitle}>Bharat Bazaar</Text>
                <Text style={styles.brandSub}>Admin panel</Text>
              </View>
            </View>
            <View style={{ height: spacing.lg }} />
            {tabs.map((t) => {
              const active = t.key === activeKey;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => router.push(t.path as any)}
                  style={[styles.sideItem, active && styles.sideItemActive]}
                  testID={`admin-nav-${t.key}`}
                >
                  <Ionicons name={t.icon} size={20} color={active ? colors.primary : colors.textMuted} />
                  <Text style={[styles.sideLabel, active && { color: colors.primary, fontWeight: "700" }]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Pressable onPress={goToApp} style={styles.backToApp} testID="admin-back-to-app">
              <Ionicons name="storefront-outline" size={18} color={colors.primary} />
              <Text style={styles.backToAppText}>Back to store</Text>
            </Pressable>
            <View style={styles.userChip}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.full_name || "Admin"}
                </Text>
                <Text style={styles.userPhone} numberOfLines={1}>
                  {user?.phone}
                </Text>
              </View>
              <Pressable onPress={onLogout} hitSlop={8} testID="admin-logout">
                <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
          <View style={styles.content}>
            <Slot />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.mobileHeader}>
        <View style={styles.mobileBrand}>
          <Text style={styles.brandDot}>🛒</Text>
          <Text style={styles.mobileTitle}>Admin</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable onPress={goToApp} style={styles.backToAppMobile} testID="admin-back-to-app-mobile">
            <Ionicons name="storefront-outline" size={16} color={colors.primary} />
            <Text style={styles.backToAppText}>Store</Text>
          </Pressable>
          <Pressable onPress={onLogout} style={styles.iconBtn} testID="admin-logout-mobile">
            <Ionicons name="log-out-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <View style={styles.tabBar}>
        {tabs.map((t) => {
          const active = t.key === activeKey;
          return (
            <Pressable
              key={t.key}
              onPress={() => router.push(t.path as any)}
              style={styles.tab}
              testID={`admin-tab-${t.key}`}
            >
              <Ionicons name={t.icon} size={22} color={active ? colors.primary : colors.textMuted} />
              <Text style={[styles.tabLabel, active && { color: colors.primary, fontWeight: "700" }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wideSafe: { flex: 1, backgroundColor: colors.background },
  wideRow: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 240,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    padding: spacing.lg,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandDot: { fontSize: 28 },
  brandTitle: { fontSize: 16, fontWeight: "800", color: colors.textMain },
  brandSub: { fontSize: 11, color: colors.textMuted },
  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  sideItemActive: { backgroundColor: colors.primaryLight },
  sideLabel: { fontSize: 14, color: colors.textMain, fontWeight: "600" },
  backToApp: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 11, borderRadius: radius.md, marginBottom: 10,
    borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight,
  },
  backToAppMobile: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight,
  },
  backToAppText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  userName: { fontSize: 13, fontWeight: "700", color: colors.textMain },
  userPhone: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  content: { flex: 1, backgroundColor: colors.background },
  mobileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  mobileBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
  mobileTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, gap: 2 },
  tabLabel: { fontSize: 11, color: colors.textMuted },
});
