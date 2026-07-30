import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";

export default function AdminOrders() {
  return (
    <View style={styles.wrap} testID="admin-orders">
      <View style={styles.placeholder}>
        <Ionicons name="receipt" size={40} color={colors.primary} />
        <Text style={styles.title}>Order tracking</Text>
        <Text style={styles.desc}>Coming in Phase 2 — list + filter + status transitions + delivery-person assignment.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.xl },
  placeholder: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border,
    borderStyle: "dashed",
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  desc: { fontSize: 13, color: colors.textMuted, textAlign: "center", maxWidth: 320 },
});
