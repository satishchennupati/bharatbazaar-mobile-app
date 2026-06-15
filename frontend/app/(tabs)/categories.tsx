/**
 * Browse all categories grid.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { api, type Category } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Categories() {
  const router = useRouter();
  const { t } = useApp();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Category[]>("/categories")
      .then(setCats)
      .finally(() => setLoading(false));
  }, []);

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
        <Text style={styles.title}>{t("shop_by_category")}</Text>
        <Text style={styles.sub}>{t("select_category")}</Text>
      </View>
      <FlatList
        data={cats}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingBottom: 40, gap: spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            disabled={item.coming_soon}
            onPress={() => router.push(`/category/${item.slug}`)}
            style={[styles.tile, item.coming_soon && styles.tileDisabled]}
            testID={`cat-tile-${item.slug}`}
          >
            {item.coming_soon && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("coming_soon")}</Text>
              </View>
            )}
            <Text style={[styles.emoji, item.coming_soon && { opacity: 0.35 }]}>{item.emoji}</Text>
            <Text style={[styles.name, item.coming_soon && { color: colors.textDisabled }]} numberOfLines={2}>
              {item.name}
            </Text>
            {!item.coming_soon && <Text style={styles.count}>{item.product_count} items</Text>}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { padding: spacing.lg },
  title: { fontSize: 26, fontWeight: "700", color: colors.textMain, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    minHeight: 120,
  },
  tileDisabled: { backgroundColor: colors.surfaceMuted, borderStyle: "dashed", borderColor: colors.borderDashed },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: colors.comingSoonBadge,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  emoji: { fontSize: 32, marginBottom: 6 },
  name: { fontSize: 14, fontWeight: "700", color: colors.textMain, lineHeight: 18 },
  count: { fontSize: 11, color: colors.primary, fontWeight: "700", marginTop: 4 },
});
