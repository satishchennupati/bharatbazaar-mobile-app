/**
 * Browse all categories grid — Blinkit-style.
 *
 * 4-column grid where each tile is a rounded image card with a very light
 * tinted background, and the category name is centered below the tile.
 * No item counts shown.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { api, resolveImageUrl, type Category } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

// Pale tinted backgrounds for the image tiles — cycles through the grid so
// adjacent tiles feel distinct, mirroring the Blinkit reference's pale green /
// cream wash.
const TILE_BACKGROUNDS = [
  "#F1F7EE", // pale sage green
  "#FDF3E7", // pale cream
  "#F0F4FA", // pale blue-grey
  "#FAF0F0", // pale rose
];

const NUM_COLS = 4;

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
        numColumns={NUM_COLS}
        columnWrapperStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingBottom: 40, gap: spacing.md }}
        renderItem={({ item, index }) => {
          const tint = TILE_BACKGROUNDS[index % TILE_BACKGROUNDS.length];
          return (
            <Pressable
              disabled={item.coming_soon}
              onPress={() => router.push(`/category/${item.slug}`)}
              style={styles.tileWrap}
              testID={`cat-tile-${item.slug}`}
            >
              {/* Image tile — pale tinted background, rounded, image fills it */}
              <View style={[styles.imageTile, { backgroundColor: tint }, item.coming_soon && styles.imageTileDisabled]}>
                {item.image_url ? (
                  <Image
                    source={{ uri: resolveImageUrl(item.image_url) }}
                    style={[styles.image, item.coming_soon && { opacity: 0.4 }]}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={[styles.emoji, item.coming_soon && { opacity: 0.4 }]}>{item.emoji}</Text>
                )}
                {item.coming_soon && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t("coming_soon")}</Text>
                  </View>
                )}
              </View>
              {/* Name below the tile, centered */}
              <Text
                style={[styles.name, item.coming_soon && { color: colors.textDisabled }]}
                numberOfLines={2}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.textMain, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },

  tileWrap: { flex: 1, alignItems: "stretch" },
  imageTile: {
    width: "100%",
    aspectRatio: 1,                    // square tile, Blinkit-style
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  imageTileDisabled: { borderStyle: "dashed", borderColor: colors.borderDashed },
  image: { width: "100%", height: "100%" },
  emoji: { fontSize: 40 },

  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: colors.comingSoonBadge,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },

  name: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMain,
    lineHeight: 14,
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 2,
  },
});
