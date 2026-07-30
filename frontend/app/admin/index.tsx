/**
 * Admin Dashboard — landing page for the admin panel.
 * Phase 1 placeholder. Real KPIs (today's orders, revenue, top products,
 * low-stock alerts) will be filled in Phase 2.
 */
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function AdminDashboard() {
  const { user } = useApp();
  return (
    <View style={styles.wrap} testID="admin-dashboard">
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hi}>Welcome back,</Text>
          <Text style={styles.name}>{user?.full_name || "Admin"} 👋</Text>
          <Text style={styles.hint}>KPIs, quick actions and today&apos;s orders will appear here in Phase 2.</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="analytics" size={32} color={colors.primary} />
        </View>
      </View>

      <View style={styles.grid}>
        <PhaseCard icon="receipt-outline" title="Orders" desc="View, filter and update the status of every order." tag="Phase 2" />
        <PhaseCard icon="cube-outline" title="Products" desc="Full CRUD with image upload + bulk CSV re-import." tag="Phase 3" />
        <PhaseCard icon="pricetag-outline" title="Offers" desc="Home banners, coupon codes and category-wide discounts." tag="Phase 4" />
      </View>
    </View>
  );
}

function PhaseCard({ icon, title, desc, tag }: { icon: any; title: string; desc: string; tag: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name={icon} size={22} color={colors.primary} />
        </View>
        <View style={styles.cardTag}>
          <Text style={styles.cardTagText}>{tag}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  hero: {
    flexDirection: "row", alignItems: "center", gap: spacing.lg,
    backgroundColor: colors.primaryLight, borderRadius: radius.xl, padding: spacing.xl,
  },
  hi: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  name: { fontSize: 22, fontWeight: "800", color: colors.textMain, marginTop: 2 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6, maxWidth: 360 },
  heroIcon: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    flexGrow: 1, flexBasis: 240, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  cardTag: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  cardTagText: { fontSize: 10, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.4 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.textMain, marginTop: spacing.md },
  cardDesc: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
});
