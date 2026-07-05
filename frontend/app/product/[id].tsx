/**
 * Product detail screen.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type Product } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

export default function ProductDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, currency, setCartCount } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    api
      .get<Product>(`/products/${id}`)
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  const add = async () => {
    if (!product) return;
    setAdding(true);
    try {
      const c = await api.post<{ count: number }>("/cart", { product_id: product.id, qty }, true);
      setCartCount(c.count || 0);
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } finally {
      setAdding(false);
    }
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
            <Image source={{ uri: product.image_url }} style={styles.heroImg} resizeMode="contain" />
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
        <View style={styles.qty}>
          <Pressable onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.qtyBtn} testID="prod-qty-dec">
            <Ionicons name="remove" size={18} color={colors.primary} />
          </Pressable>
          <Text style={styles.qtyVal}>{qty}</Text>
          <Pressable onPress={() => setQty((q) => q + 1)} style={styles.qtyBtn} testID="prod-qty-inc">
            <Ionicons name="add" size={18} color={colors.primary} />
          </Pressable>
        </View>
        <Pressable onPress={add} disabled={adding} style={[styles.cta, (adding || added) && { opacity: 0.7 }]} testID="prod-add-btn">
          <Ionicons name={added ? "checkmark" : "cart"} size={18} color="#fff" />
          <Text style={styles.ctaText}>{added ? t("added") : t("add")}</Text>
        </Pressable>
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
    flexDirection: "row", gap: 10, padding: spacing.lg,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  qty: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primaryLight, borderRadius: radius.lg, paddingHorizontal: 6, gap: 6 },
  qtyBtn: { width: 36, height: 44, alignItems: "center", justifyContent: "center" },
  qtyVal: { minWidth: 24, textAlign: "center", fontWeight: "700", color: colors.primary, fontSize: 16 },
  cta: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
