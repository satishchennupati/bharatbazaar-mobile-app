/**
 * Browse all categories grid — Blinkit-style.
 *
 * 2-column grid where each tile is a large rounded image card with a very light
 * tinted background, and the category name is centered below the tile.
 * No item counts shown.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

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

const NUM_COLS = 2;

export default function Categories() {
  const router = useRouter();
  const { t } = useApp();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const onSearch = () => {
    if (search.trim()) {
      router.push(`/category/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  useEffect(() => {
    api
      .get<Category[]>("/categories")
      .then((list) => setCats(list.filter((c) => c.product_count > 0 || c.coming_soon)))
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
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("search_placeholder")}
          placeholderTextColor={colors.textDisabled}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={onSearch}
          testID="categories-search-input"
        />
      </View>
      <FlatList
        data={cats}
        keyExtractor={(c) => c.id}
        numColumns={NUM_COLS}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingBottom: 40, gap: spacing.lg }}
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
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: "800", color: colors.textMain, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textMain, paddingVertical: 12 },

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
    fontSize: 15,
    fontWeight: "700",
    color: colors.textMain,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 4,
  },
});
