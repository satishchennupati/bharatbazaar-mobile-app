/**
 * Category product list — Blinkit-style card grid (also handles /category/search?q=...).
 *
 * 3-column grid of compact cards: contained product image, 2-line name,
 * unit/weight, red "X% OFF" + strikethrough MRP when available, bold price,
 * and an ADD/stepper button anchored bottom-right.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Category, type Product } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { useCartActions } from "@/src/hooks/use-cart-actions";
import { ProductAddButton } from "@/src/components/product-add-button";
import { FloatingCartBar } from "@/src/components/floating-cart-bar";
import { colors, radius, spacing } from "@/src/theme";

const NUM_COLS = 3;

function discountInfo(p: Product): { pct: number; struckLek: number } | null {
  // 1) Explicit MRP (original price) set in admin → % off vs selling price.
  if (p.mrp_lek && p.mrp_lek > p.price_lek) {
    return {
      pct: Math.round(((p.mrp_lek - p.price_lek) / p.mrp_lek) * 100),
      struckLek: p.mrp_lek,
    };
  }
  // 2) Percentage discount set in admin → original price is derived so the
  //    current selling price = original × (1 − pct/100). Display-only; the
  //    amount charged stays `price_lek`.
  const d = Number(p.discount || 0);
  if (d > 0 && d < 100) {
    const original = p.price_lek / (1 - d / 100);
    return { pct: Math.round(d), struckLek: Math.round(original) };
  }
  return null;
}

export default function CategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { slug, q } = useLocalSearchParams<{ slug: string; q?: string }>();
  const { t, currency, cartQtyMap } = useApp();
  const cartActions = useCartActions();
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
    await cartActions.addToCart(p.id, 1);
  };
  const setQty = async (pid: string, qty: number) => {
    await cartActions.setQty(pid, qty);
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
          numColumns={NUM_COLS}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 130 + insets.bottom, gap: 22 }}
          renderItem={({ item }) => {
            const disc = discountInfo(item);
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/product/${item.id}`)}
                testID={`cat-prod-${item.id}`}
              >
                {/* Product image — contained on a light background */}
                <View style={styles.imgBox}>
                  {item.image_url ? (
                    <Image
                      source={{ uri: resolveImageUrl(item.image_url) }}
                      style={styles.imgReal}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.imgEmoji}>{item.image_emoji}</Text>
                  )}
                </View>

                {/* Name — 2 lines max */}
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                {/* Unit / pack size */}
                <Text style={styles.unit} numberOfLines={1}>
                  {item.unit || item.weight}
                </Text>

                {/* Discount + price row: red "X% OFF" on top, then the
                    original price struck-through on the LEFT and the new
                    discounted price on the RIGHT of it. */}
                {disc ? <Text style={styles.off}>{disc.pct}% OFF</Text> : null}
                <View style={styles.priceRow}>
                  {disc ? (
                    <Text style={styles.mrp} numberOfLines={1}>
                      {formatPrice(disc.struckLek, disc.struckLek / 100, currency)}
                    </Text>
                  ) : null}
                  <Text style={styles.price} numberOfLines={1}>
                    {formatPrice(item.price_lek, item.price_eur, currency)}
                  </Text>
                </View>

                {/* ADD / stepper floats on the card's bottom-right corner
                    (Blinkit-style) instead of occupying a full row inside. */}
                <View style={styles.addWrap} pointerEvents="box-none">
                  <ProductAddButton
                    qty={cartQtyMap[item.id] || 0}
                    onAdd={() => addToCart(item)}
                    onIncrement={() => setQty(item.id, (cartQtyMap[item.id] || 0) + 1)}
                    onDecrement={() => setQty(item.id, Math.max(0, (cartQtyMap[item.id] || 0) - 1))}
                    productId={item.id}
                    compact
                  />
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <FloatingCartBar bottomInset={Math.max(16, insets.bottom + 12)} />
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

  card: {
    flex: 1,
    // Cap width so a partially-filled last row doesn't stretch the card
    // full-width (classic FlatList numColumns pitfall).
    maxWidth: "33.33%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 8,
    paddingBottom: 26, // clears the corner-floating stepper (wider than the +)
    position: "relative",
  },
  imgBox: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    overflow: "hidden",
  },
  imgReal: { width: "88%", height: "88%" },
  imgEmoji: { fontSize: 40 },
  name: { fontSize: 12, fontWeight: "600", color: colors.textMain, lineHeight: 15, minHeight: 30 },
  unit: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  off: { fontSize: 10, fontWeight: "800", color: colors.error, marginTop: 4, letterSpacing: 0.2 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 2, paddingRight: 36 },
  price: { fontSize: 13, fontWeight: "800", color: colors.textMain },
  mrp: { fontSize: 10, color: colors.textMuted, textDecorationLine: "line-through" },
  // Blinkit-style: the button floats half-over the card's bottom-right edge.
  addWrap: {
    position: "absolute",
    right: 8,
    bottom: -12,
    zIndex: 5,
  },
});
