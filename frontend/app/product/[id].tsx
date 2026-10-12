/**
 * Product detail screen.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Product } from "@/src/lib/api";
import { isLowStock, discountInfo } from "@/src/lib/product";
import { useApp, formatPrice } from "@/src/store/app-context";
import { useCartActions } from "@/src/hooks/use-cart-actions";
import { ProductAddButton } from "@/src/components/product-add-button";
import { FavouriteHeart } from "@/src/components/favourite-heart";
import { colors, radius, spacing } from "@/src/theme";

export default function ProductDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, currency, cartQtyMap } = useApp();
  const cartActions = useCartActions();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const cartQty = product ? (cartQtyMap[product.id] || 0) : 0;

  useEffect(() => {
    api
      .get<Product>(`/products/${id}`)
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  const add = async () => {
    if (!product) return;
    await cartActions.addToCart(product.id, 1);
  };
  const setQtyRemote = async (qty: number) => {
    if (!product) return;
    await cartActions.setQty(product.id, qty);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!product) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ color: colors.textMuted }}>Product not found.</Text>
      </SafeAreaView>
    );
  }

  // Discount display uses the shared helper (explicit DISCOUNT % badge + MRP
  // struck-through price).
  const disc = discountInfo(product);
  const discPct = disc?.pct ?? null;
  const discStruckLek = disc?.struckLek ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="prod-back">
            <Ionicons name="chevron-back" size={24} color={colors.textMain} />
          </Pressable>
          <FavouriteHeart productId={product.id} size={22} style={styles.headerHeart} />
        </View>
        <View style={styles.hero}>
          {product.image_url ? (
            <Image source={{ uri: resolveImageUrl(product.image_url) }} style={styles.heroImg} resizeMode="contain" />
          ) : (
            <Text style={styles.heroEmoji}>{product.image_emoji}</Text>
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.chipRow}>
            <Text style={styles.unitChip}>{product.unit || product.weight || product.sku}</Text>
            {product.in_stock === false ? (
              <Text style={styles.oosChip}>Out of Stock</Text>
            ) : isLowStock(product) ? (
              <Text style={styles.lowStockChip}>Only {product.stock} left</Text>
            ) : null}
          </View>
          <Text style={styles.name} testID="prod-name">{product.name}</Text>
          {product.brand ? <Text style={styles.brand}>by {product.brand}</Text> : null}
          <View style={styles.priceRow}>
            {discPct !== null && discStruckLek !== null && (
              <>
                <Text style={styles.offBadge}>{discPct}% OFF</Text>
                <Text style={styles.mrpStruck}>{formatPrice(discStruckLek, discStruckLek / 100, currency)}</Text>
              </>
            )}
            <Text style={styles.price}>{formatPrice(product.price_lek, product.price_eur, currency)}</Text>
          </View>
          <Text style={styles.desc}>{product.description}</Text>
          {product.tags.length > 0 && (
            <View style={styles.tags}>
              {product.tags.map((tg) => (
                <View key={tg} style={styles.tag}>
                  <Text style={styles.tagText}>#{tg}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {/* Sticky price/qty bar — padded by the bottom safe-area inset so the
          phone's system navigation (3-button bar / home indicator) never
          overlaps or greys it out. */}
      <View style={[styles.footer, { paddingBottom: Math.max(spacing.lg, insets.bottom + 8) }]}>
        {product.in_stock === false ? (
          <View style={styles.oosFooter}>
            <Ionicons name="close-circle" size={18} color={colors.error} />
            <Text style={styles.oosFooterText}>Out of stock — currently unavailable</Text>
          </View>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerPriceLabel}>Price</Text>
              <Text style={styles.footerPrice}>{formatPrice(product.price_lek, product.price_eur, currency)}</Text>
            </View>
            <ProductAddButton
              qty={cartQty}
              onAdd={add}
              onIncrement={() => setQtyRemote(cartQty + 1)}
              onDecrement={() => setQtyRemote(Math.max(0, cartQty - 1))}
              productId={product.id}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerBar: { padding: spacing.base, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerHeart: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  hero: { height: 280, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight, marginHorizontal: spacing.lg, borderRadius: radius.xl },
  heroEmoji: { fontSize: 140 },
  heroImg: { width: "80%", height: "80%" },
  brand: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: "500" },
  body: { padding: spacing.lg },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  unitChip: { backgroundColor: colors.surfaceMuted, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  lowStockChip: { backgroundColor: colors.error, color: "#fff", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: "700" },
  oosChip: { backgroundColor: "#374151", color: "#fff", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  name: { fontSize: 24, fontWeight: "700", color: colors.textMain, marginTop: 12, letterSpacing: -0.4 },
  price: { fontSize: 28, fontWeight: "700", color: colors.primary },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 },
  offBadge: { fontSize: 13, fontWeight: "800", color: colors.error, letterSpacing: 0.3 },
  mrpStruck: { fontSize: 16, color: colors.textMuted, textDecorationLine: "line-through", fontWeight: "600" },
  desc: { fontSize: 14, color: colors.textMuted, lineHeight: 22, marginTop: 12 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 16 },
  tag: { backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontSize: 11, color: colors.primary, fontWeight: "600" },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 12, padding: spacing.lg, alignItems: "center",
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerPriceLabel: { fontSize: 11, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  footerPrice: { fontSize: 22, fontWeight: "700", color: colors.textMain },
  oosFooter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  oosFooterText: { fontSize: 15, fontWeight: "700", color: colors.error },
});
