/**
 * Favourites (saved products) screen. Lists the user's saved products, lets
 * them add to cart or un-save. Reachable from the Profile tab.
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Product } from "@/src/lib/api";
import { discountInfo, isLowStock } from "@/src/lib/product";
import { useApp, formatPrice } from "@/src/store/app-context";
import { useCartActions } from "@/src/hooks/use-cart-actions";
import { ProductAddButton } from "@/src/components/product-add-button";
import { FavouriteHeart } from "@/src/components/favourite-heart";
import { FloatingCartBar } from "@/src/components/floating-cart-bar";
import { colors, radius, spacing } from "@/src/theme";

export default function Favourites() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currency, cartQtyMap, favIds, applyFavourites } = useApp();
  const cartActions = useCartActions();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const items = await api.get<Product[]>("/me/favourites", true);
      setProducts(items);
      applyFavourites(items.map((p) => p.id));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [applyFavourites]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Keep the visible list in sync when a heart is toggled off on this screen.
  const visible = products.filter((p) => favIds[p.id]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="fav-back">
          <Ionicons name="chevron-back" size={24} color={colors.textMain} />
        </Pressable>
        <Text style={styles.title}>Favourites</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={56} color={colors.textDisabled} />
          <Text style={styles.emptyText}>No favourites yet</Text>
          <Text style={styles.emptySub}>Tap the heart on any product to save it here.</Text>
          <Pressable style={styles.browseBtn} onPress={() => router.push("/(tabs)")} testID="fav-browse">
            <Text style={styles.browseText}>Browse products</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 130 + insets.bottom, gap: spacing.md }}
          renderItem={({ item }) => {
            const disc = discountInfo(item);
            const oos = item.in_stock === false;
            return (
              <Pressable style={styles.card} onPress={() => router.push(`/product/${item.id}`)} testID={`fav-prod-${item.id}`}>
                <View style={styles.imgBox}>
                  {item.image_url ? (
                    <Image source={{ uri: resolveImageUrl(item.image_url) }} style={[styles.imgReal, oos && styles.imgDim]} resizeMode="contain" />
                  ) : (
                    <Text style={[styles.imgEmoji, oos && styles.imgDim]}>{item.image_emoji}</Text>
                  )}
                  <FavouriteHeart productId={item.id} size={16} style={styles.heart} />
                  {oos ? (
                    <View style={styles.oosOverlay}>
                      <Text style={styles.oosText}>Out of Stock</Text>
                    </View>
                  ) : isLowStock(item) ? (
                    <View style={styles.lowStock}>
                      <Text style={styles.lowStockText}>Only few left</Text>
                    </View>
                  ) : null}
                  {!oos ? (
                    <View style={styles.addBtn}>
                    <ProductAddButton
                      qty={cartQtyMap[item.id] || 0}
                      onAdd={() => cartActions.addToCart(item.id, 1)}
                      onIncrement={() => cartActions.setQty(item.id, (cartQtyMap[item.id] || 0) + 1)}
                      onDecrement={() => cartActions.setQty(item.id, Math.max(0, (cartQtyMap[item.id] || 0) - 1))}
                      productId={item.id}
                      compact
                    />
                  </View>
                  ) : null}
                </View>
                <Text style={[styles.name, oos && { color: colors.textMuted }]} numberOfLines={2}>{item.name}</Text>
                <View style={styles.metaRow}>
                  {disc ? <Text style={styles.off}>{disc.pct}% OFF</Text> : null}
                  <Text style={[styles.unit, styles.unitRight]} numberOfLines={1}>{item.unit || item.weight}</Text>
                </View>
                <View style={styles.priceRow}>
                  {disc ? (
                    <Text style={styles.mrp} numberOfLines={1}>{formatPrice(disc.struckLek, disc.struckLek / 100, currency)}</Text>
                  ) : null}
                  <Text style={styles.price}>{formatPrice(item.price_lek, item.price_eur, currency)}</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.base, paddingBottom: spacing.md, gap: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", color: colors.textMain, letterSpacing: -0.4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: 17, fontWeight: "700", color: colors.textMain, marginTop: 8 },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  browseBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill },
  browseText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  card: {
    flex: 1,
    maxWidth: "50%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    paddingBottom: 22,
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
    position: "relative",
  },
  imgReal: { width: "82%", height: "82%" },
  imgEmoji: { fontSize: 48 },
  imgDim: { opacity: 0.35 },
  oosOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(55,65,81,0.92)", paddingVertical: 3, alignItems: "center" },
  oosText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  heart: { position: "absolute", top: 4, left: 4, width: 26, height: 26, borderRadius: 13 },
  addBtn: { position: "absolute", right: 4, bottom: 4 },
  lowStock: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(239,68,68,0.92)", paddingVertical: 2, alignItems: "center" },
  lowStockText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  name: { fontSize: 13, fontWeight: "600", color: colors.textMain, lineHeight: 16, minHeight: 32 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, minHeight: 14 },
  unit: { fontSize: 11, color: colors.textMuted },
  unitRight: { marginLeft: "auto" },
  off: { fontSize: 11, fontWeight: "800", color: colors.error, letterSpacing: 0.2 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 3 },
  price: { fontSize: 14, fontWeight: "800", color: colors.textMain },
  mrp: { fontSize: 11, color: colors.textMuted, textDecorationLine: "line-through" },
});
