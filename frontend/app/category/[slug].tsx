/**
 * Category product list (also handles /category/search?q=...).
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Category, type Product } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function CategoryScreen() {
  const router = useRouter();
  const { slug, q } = useLocalSearchParams<{ slug: string; q?: string }>();
  const { t, currency, setCartCount } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [cat, setCat] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const isSearch = slug === "search";

  useEffect(() => {
    const load = async () => {
      try {
        if (isSearch) {
          const items = await api.get<Product[]>(`/products?q=${encodeURIComponent(q || "")}`);
          setProducts(items);
        } else {
          const [items, cats] = await Promise.all([
            api.get<Product[]>(`/products?category=${slug}`),
            api.get<Category[]>("/categories"),
          ]);
          setProducts(items);
          setCat(cats.find((c) => c.slug === slug) || null);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug, q, isSearch]);

  const addToCart = async (p: Product) => {
    try {
      const res = await api.post<{ count: number }>("/cart", { product_id: p.id, qty: 1 }, true);
      setCartCount(res.count || 0);
    } catch {}
  };

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
        <Pressable onPress={() => router.back()} style={styles.back} testID="cat-back">
          <Ionicons name="chevron-back" size={24} color={colors.textMain} />
        </Pressable>
        <View style={{ flex: 1 }}>
          {isSearch ? (
            <Text style={styles.title}>{q} · {products.length}</Text>
          ) : (
            <View style={styles.headerRow}>
              <Text style={styles.headerEmoji}>{cat?.emoji}</Text>
              <View>
                <Text style={styles.title} numberOfLines={1}>{cat?.name}</Text>
                <Text style={styles.sub}>{products.length} items</Text>
              </View>
            </View>
          )}
        </View>
      </View>
      {products.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search" size={48} color={colors.textDisabled} />
          <Text style={styles.emptyText}>No products found</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 40, gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/product/${item.id}`)} testID={`cat-prod-${item.id}`}>
              <View style={styles.img}>
                {item.image_url ? (
                  <Image source={{ uri: resolveImageUrl(item.image_url) }} style={styles.imgReal} resizeMode="contain" />
                ) : (
                  <Text style={styles.imgEmoji}>{item.image_emoji}</Text>
                )}
              </View>
              <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.unit}>{item.unit || item.weight}</Text>
              <View style={styles.footer}>
                <Text style={styles.price}>{formatPrice(item.price_lek, item.price_eur, currency)}</Text>
                <Pressable style={styles.addBtn} onPress={() => addToCart(item)} testID={`cat-add-${item.id}`}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={styles.addBtnText}>{t("add")}</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.base, paddingBottom: spacing.md, gap: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerEmoji: { fontSize: 28 },
  title: { fontSize: 20, fontWeight: "700", color: colors.textMain, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: colors.textMuted },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 15, color: colors.textMuted, marginTop: 8 },
  card: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  img: { height: 96, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  imgEmoji: { fontSize: 48 },
  imgReal: { width: "100%", height: "100%" },
  name: { fontSize: 13, fontWeight: "600", color: colors.textMain, lineHeight: 16 },
  unit: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  price: { fontSize: 14, fontWeight: "700", color: colors.textMain },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 4, gap: 2 },
  addBtnText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
});
