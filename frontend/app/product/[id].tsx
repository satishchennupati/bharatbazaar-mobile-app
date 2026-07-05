/**
 * Product detail screen.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Product } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { ProductAddButton } from "@/src/components/product-add-button";
import { colors, radius, spacing } from "@/src/theme";

export default function ProductDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, currency, applyCart, cartQtyMap } = useApp();
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
    try {
      const c = await api.post<{ items: any[]; count: number }>("/cart", { product_id: product.id, qty: 1 }, true);
      applyCart(c.items, c.count);
    } catch {}
  };
  const setQtyRemote = async (qty: number) => {
    if (!product) return;
    try {
      const c = await api.patch<{ items: any[]; count: number }>(`/cart/${product.id}`, { qty });
      applyCart(c.items, c.count);
    } catch {}
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} style={styles.back} testID="prod-back">
            <Ionicons name="chevron-back" size={24} color={colors.textMain} />
          </Pressable>
        </View>
        <View style={styles.hero}>
          {product.image_url ? (
            <Image source={{ uri: resolveImageUrl(product.image_url) }} style={styles.heroImg} resizeMode="contain" />
          ) : (
            <Text style={styles.heroEmoji}>{product.image_emoji}</Text>
          )}
        </View>
        <View style={styles.body}>
          <Text style={styles.unitChip}>{product.unit || product.weight || product.sku}</Text>
          <Text style={styles.name} testID="prod-name">{product.name}</Text>
          {product.brand ? <Text style={styles.brand}>by {product.brand}</Text> : null}
          <Text style={styles.price}>{formatPrice(product.price_lek, product.price_eur, currency)}</Text>
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
      <View style={styles.footer}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  headerBar: { padding: spacing.base },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  hero: { height: 280, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight, marginHorizontal: spacing.lg, borderRadius: radius.xl },
  heroEmoji: { fontSize: 140 },
  heroImg: { width: "80%", height: "80%" },
  brand: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: "500" },
  body: { padding: spacing.lg },
  unitChip: { backgroundColor: colors.surfaceMuted, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  name: { fontSize: 24, fontWeight: "700", color: colors.textMain, marginTop: 12, letterSpacing: -0.4 },
  price: { fontSize: 28, fontWeight: "700", color: colors.primary, marginTop: 8 },
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
});
