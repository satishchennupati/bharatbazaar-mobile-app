/**
 * Manage saved addresses — list, delete, and mark default (first in list).
 * Reached from Profile → "Saved addresses" or from Checkout's "Manage" link.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

type Address = {
  id: string;
  label?: string;
  line1?: string;
  city?: string;
  state?: string;
  area?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  entry_mode?: string;
  formatted_address?: string;
};

function confirmAction(msg: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(msg)) onOk();
  } else {
    Alert.alert("Delete address", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", onPress: onOk, style: "destructive" },
    ]);
  }
}

export default function ManageAddresses() {
  const router = useRouter();
  const { user, refreshUser } = useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const me = await api.get<any>("/me", true);
      if (me) await refreshUser(me);
    } finally {
      setRefreshing(false);
    }
  }, [refreshUser]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const addresses: Address[] = (user?.addresses || []) as Address[];

  const onDelete = (a: Address) => {
    confirmAction(`Delete "${a.label || a.city || "this address"}"?`, async () => {
      setBusyId(a.id);
      try {
        await api.del(`/me/addresses/${a.id}`);
        const me = await api.get<any>("/me", true);
        if (me) await refreshUser(me);
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Failed to delete");
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="manage-addresses-back">
          <Ionicons name="chevron-back" size={24} color={colors.textMain} />
        </Pressable>
        <Text style={styles.title}>Saved addresses</Text>
      </View>

      <FlatList
        data={addresses}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}
        onRefresh={refresh}
        refreshing={refreshing}
        ListEmptyComponent={
          <View style={styles.empty} testID="manage-addresses-empty">
            <Ionicons name="location-outline" size={44} color={colors.textDisabled} />
            <Text style={styles.emptyTitle}>No saved addresses yet</Text>
            <Text style={styles.emptySub}>
              Place an order and tick “Save this address for faster checkout” — you&apos;ll see your saved addresses here.
            </Text>
            <Pressable onPress={() => router.push("/(tabs)/cart")} style={styles.emptyCta} testID="manage-addresses-cta">
              <Text style={styles.emptyCtaText}>Go to cart</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => {
          const summary = [item.line1, item.area, item.city, item.state]
            .filter(Boolean)
            .join(", ");
          return (
            <View style={styles.card} testID={`manage-addresses-item-${item.id}`}>
              <View style={styles.cardHead}>
                <Ionicons
                  name={item.entry_mode === "map" ? "map" : "home"}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.cardLabel}>{item.label || "Address"}</Text>
                {index === 0 && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardLine} numberOfLines={3}>
                {summary || item.formatted_address || "—"}
              </Text>
              {item.phone ? (
                <View style={styles.metaRow}>
                  <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.metaText}>{item.phone}</Text>
                </View>
              ) : null}
              {item.postal_code ? (
                <View style={styles.metaRow}>
                  <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.metaText}>{item.postal_code}</Text>
                </View>
              ) : null}
              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => onDelete(item)}
                  disabled={busyId === item.id}
                  style={[styles.deleteBtn, busyId === item.id && { opacity: 0.5 }]}
                  testID={`manage-addresses-del-${item.id}`}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator color={colors.error} size="small" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={14} color={colors.error} />
                      <Text style={styles.deleteText}>Delete</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.textMain, marginTop: 8 },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center", maxWidth: 300, lineHeight: 18 },
  emptyCta: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  emptyCtaText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLabel: { fontSize: 14, fontWeight: "700", color: colors.textMain, flex: 1 },
  defaultBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: { fontSize: 9, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
  cardLine: { fontSize: 13, color: colors.textMain, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteText: { color: colors.error, fontSize: 12, fontWeight: "700" },
});
