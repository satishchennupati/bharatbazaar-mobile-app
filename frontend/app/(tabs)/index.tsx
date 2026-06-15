/**
 * Home: promo banner + search + category grid + featured products.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type Category, type Product } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function Home() {
  const router = useRouter();
  const { t, user, currency, setCartCount } = useApp();
  const [cats, setCats] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [catList, prods] = await Promise.all([
        api.get<Category[]>("/categories"),
        api.get<Product[]>("/products?limit=20"),
      ]);
      setCats(catList);
      setFeatured(prods);
      try {
        const cart = await api.get<{ count: number }>("/cart", true);
        setCartCount(cart.count || 0);
      } catch {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToCart = async (p: Product) => {
    try {
      const res = await api.post<{ count: number }>("/cart", { product_id: p.id, qty: 1 }, true);
      setCartCount(res.count || 0);
    } catch (e) {
      // ignore for now
    }
  };

  const onSearch = () => {
    if (search.trim()) {
      router.push(`/category/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center} testID="home-loading">
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.hello} testID="home-hello">
            Hi, {user?.full_name?.split(" ")[0] || user?.username || "there"} 👋
          </Text>
          <Text style={styles.deliverTo}>Deliver to Tirana, Albania</Text>
        </View>
        <View style={styles.logoBadge}>
          <Ionicons name="basket" size={18} color="#fff" />
        </View>
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
          testID="home-search-input"
        />
      </View>

      <FlatList
        data={featured}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: spacing.sm, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <View style={styles.promoBanner} testID="home-promo-banner">
              <Ionicons name="rocket" size={18} color="#fff" />
              <Text style={styles.promoText}>{t("promo_banner")}</Text>
            </View>
            <Text style={styles.sectionTitle}>{t("shop_by_category")}</Text>
            <Text style={styles.sectionSub}>{t("select_category")}</Text>
            <View style={styles.catGrid}>
              {cats.slice(0, 8).map((c) => (
                <CategoryTile key={c.id} cat={c} onPress={() => !c.coming_soon && router.push(`/category/${c.slug}`)} t={t} />
              ))}
            </View>
            <Pressable onPress={() => router.push("/(tabs)/categories")} style={styles.viewAll} testID="home-view-all-cats">
              <Text style={styles.viewAllText}>View all categories</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </Pressable>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Best sellers</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ProductCard p={item} currency={currency} onAdd={() => addToCart(item)} onPress={() => router.push(`/product/${item.id}`)} t={t} />
        )}
      />
    </SafeAreaView>
  );
}

function CategoryTile({ cat, onPress, t }: { cat: Category; onPress: () => void; t: any }) {
  const disabled = cat.coming_soon;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.catTile, disabled && styles.catTileDisabled]}
      disabled={disabled}
      testID={`home-cat-${cat.slug}`}
    >
      {disabled && (
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>{t("coming_soon")}</Text>
        </View>
      )}
      <Text style={[styles.catEmoji, disabled && { opacity: 0.35 }]}>{cat.emoji}</Text>
      <Text style={[styles.catName, disabled && { color: colors.textDisabled }]} numberOfLines={2}>
        {cat.name}
      </Text>
      {!disabled && (
        <Text style={styles.catCount}>
          {cat.product_count} {t("items")}
        </Text>
      )}
    </Pressable>
  );
}

function ProductCard({
  p,
  currency,
  onAdd,
  onPress,
  t,
}: {
  p: Product;
  currency: "LEK" | "EUR";
  onAdd: () => void;
  onPress: () => void;
  t: any;
}) {
  return (
    <Pressable style={styles.prodCard} onPress={onPress} testID={`product-card-${p.id}`}>
      <View style={styles.prodImage}>
        <Text style={styles.prodEmoji}>{p.image_emoji}</Text>
      </View>
      <Text style={styles.prodName} numberOfLines={2}>
        {p.name}
      </Text>
      <Text style={styles.prodUnit}>{p.unit}</Text>
      <View style={styles.prodFooter}>
        <Text style={styles.prodPrice}>{formatPrice(p.price_lek, p.price_eur, currency)}</Text>
        <Pressable onPress={onAdd} style={styles.addBtn} testID={`add-to-cart-${p.id}`}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.addBtnText}>{t("add")}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  hello: { fontSize: 18, fontWeight: "700", color: colors.textMain },
  deliverTo: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
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
    marginTop: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textMain, paddingVertical: 12 },
  promoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: spacing.md,
  },
  promoText: { color: "#fff", fontSize: 13, fontWeight: "600", flex: 1, lineHeight: 18 },
  sectionTitle: { fontSize: 22, fontWeight: "700", color: colors.textMain, marginTop: spacing.lg, letterSpacing: -0.4 },
  sectionSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "space-between" },
  catTile: {
    width: "47%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.base,
    minHeight: 110,
  },
  catTileDisabled: { backgroundColor: colors.surfaceMuted, borderStyle: "dashed", borderColor: colors.borderDashed },
  comingSoonBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: colors.comingSoonBadge,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  comingSoonText: { color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  catEmoji: { fontSize: 30, marginBottom: 6 },
  catName: { fontSize: 14, fontWeight: "700", color: colors.textMain, lineHeight: 18 },
  catCount: { fontSize: 11, color: colors.primary, fontWeight: "700", marginTop: 4 },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  viewAllText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  prodCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  prodImage: {
    height: 90,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  prodEmoji: { fontSize: 44 },
  prodName: { fontSize: 13, fontWeight: "600", color: colors.textMain, lineHeight: 16 },
  prodUnit: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  prodFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  prodPrice: { fontSize: 14, fontWeight: "700", color: colors.textMain },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  addBtnText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
});
