/**
 * Home: promo banner + search + category grid + featured products.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Category, type Product } from "@/src/lib/api";
import { discountInfo, isLowStock } from "@/src/lib/product";
import { useApp, formatPrice } from "@/src/store/app-context";
import { useCartActions } from "@/src/hooks/use-cart-actions";
import { ProductAddButton } from "@/src/components/product-add-button";
import { FavouriteHeart } from "@/src/components/favourite-heart";
import { AnimatedPromoBanner } from "@/src/components/animated-promo-banner";
import { OffersCarousel } from "@/src/components/offers-carousel";
import { colors, radius, spacing } from "@/src/theme";

// Pale tinted backgrounds for the category image tiles — cycles through the
// grid so adjacent tiles feel distinct (Blinkit-style).
const TILE_BACKGROUNDS = ["#F1F7EE", "#FDF3E7", "#F0F4FA", "#FAF0F0"];

type PromoStrip = {  id: string;
  active: boolean;
  promo_headline?: string;
  promo_amount?: string;
  promo_sub?: string;
};

export default function Home() {
  const router = useRouter();
  const { t, user, currency, applyCart, cartQtyMap } = useApp();
  const cartActions = useCartActions();
  const [cats, setCats] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [promo, setPromo] = useState<PromoStrip | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [catList, prods, promoRes] = await Promise.all([
        api.get<Category[]>("/categories"),
        api.get<Product[]>("/products?limit=20"),
        api.get<{ promo_strip: PromoStrip | null }>("/offers/promo-strip").catch(() => ({ promo_strip: null })),
      ]);
      setCats(catList.filter((c) => c.product_count > 0 || c.coming_soon));
      setFeatured(prods);
      setPromo(promoRes?.promo_strip || null);
      try {
        const cart = await api.get<{ items: Array<{ product_id: string; qty: number }>; count: number }>("/cart", true);
        applyCart(cart.items, cart.count);
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
    await cartActions.addToCart(p.id, 1);
  };
  const setQty = async (pid: string, qty: number) => {
    await cartActions.setQty(pid, qty);
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
        <Image source={require("@/assets/images/logo.png")} style={styles.headerLogo} resizeMode="contain" />
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
            <OffersCarousel testID="home-offers-carousel" />
            {promo && promo.active && (promo.promo_headline || promo.promo_amount || promo.promo_sub) ? (
              <AnimatedPromoBanner
                headline={promo.promo_headline || t("promo_headline")}
                amount={promo.promo_amount || ""}
                sub={promo.promo_sub || ""}
                testID="home-promo-banner"
              />
            ) : null}
            <Text style={styles.sectionTitle}>{t("shop_by_category")}</Text>
            <Text style={styles.sectionSub}>{t("select_category")}</Text>
            <View style={styles.catGrid}>
              {cats.slice(0, 8).map((c, i) => (
                <CategoryTile key={c.id} cat={c} tint={TILE_BACKGROUNDS[i % TILE_BACKGROUNDS.length]} onPress={() => !c.coming_soon && router.push(`/category/${c.slug}`)} t={t} />
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
          <ProductCard
            p={item}
            currency={currency}
            qty={cartQtyMap[item.id] || 0}
            onAdd={() => addToCart(item)}
            onInc={() => setQty(item.id, (cartQtyMap[item.id] || 0) + 1)}
            onDec={() => setQty(item.id, Math.max(0, (cartQtyMap[item.id] || 0) - 1))}
            onPress={() => router.push(`/product/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function CategoryTile({ cat, tint, onPress, t }: { cat: Category; tint: string; onPress: () => void; t: any }) {
  const disabled = cat.coming_soon;
  return (
    <Pressable
      onPress={onPress}
      style={styles.catTile}
      disabled={disabled}
      testID={`home-cat-${cat.slug}`}
    >
      {/* Square tinted image tile — Blinkit-style, image fills the tile */}
      <View style={[styles.catImageTile, { backgroundColor: tint }, disabled && styles.catImageTileDisabled]}>
        {cat.image_url ? (
          <Image
            source={{ uri: resolveImageUrl(cat.image_url) }}
            style={[styles.catImage, disabled && { opacity: 0.4 }]}
            resizeMode="cover"
          />
        ) : (
          <Text style={[styles.catEmoji, disabled && { opacity: 0.4 }]}>{cat.emoji}</Text>
        )}
        {disabled && (
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>{t("coming_soon")}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.catName, disabled && { color: colors.textDisabled }]} numberOfLines={2}>
        {cat.name}
      </Text>
    </Pressable>
  );
}

function ProductCard({
  p,
  currency,
  qty,
  onAdd,
  onInc,
  onDec,
  onPress,
}: {
  p: Product;
  currency: "LEK" | "EUR";
  qty: number;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  onPress: () => void;
}) {
  const disc = discountInfo(p);
  const oos = p.in_stock === false;
  return (
    <Pressable style={styles.prodCard} onPress={onPress} testID={`product-card-${p.id}`}>
      <View style={styles.prodImage}>
        {p.image_url ? (
          <Image source={{ uri: resolveImageUrl(p.image_url) }} style={[styles.prodImg, oos && styles.prodDim]} resizeMode="contain" />
        ) : (
          <Text style={[styles.prodEmoji, oos && styles.prodDim]}>{p.image_emoji}</Text>
        )}
        <FavouriteHeart productId={p.id} size={16} style={styles.prodHeart} />
        {oos ? (
          <View style={styles.prodOos}>
            <Text style={styles.prodOosText}>Out of Stock</Text>
          </View>
        ) : isLowStock(p) ? (
          <View style={styles.prodLowStock}>
            <Text style={styles.prodLowStockText}>Only few left</Text>
          </View>
        ) : null}
        {!oos ? (
          <View style={styles.prodImageBtn}>
            <ProductAddButton
              qty={qty}
              onAdd={onAdd}
              onIncrement={onInc}
              onDecrement={onDec}
              productId={p.id}
              compact
            />
          </View>
        ) : null}
      </View>
      <Text style={[styles.prodName, oos && { color: colors.textMuted }]} numberOfLines={2}>
        {p.name}
      </Text>
      {/* Meta row: discount left, weight right (weight stays right-aligned). */}
      <View style={styles.prodMetaRow}>
        {disc ? <Text style={styles.prodOff}>{disc.pct}% OFF</Text> : null}
        <Text style={[styles.prodUnit, styles.prodUnitRight]} numberOfLines={1}>
          {p.unit || p.weight}
        </Text>
      </View>
      <View style={styles.prodPriceRow}>
        {disc ? (
          <Text style={styles.prodMrp} numberOfLines={1}>
            {formatPrice(disc.struckLek, disc.struckLek / 100, currency)}
          </Text>
        ) : null}
        <Text style={styles.prodPrice}>{formatPrice(p.price_lek, p.price_eur, currency)}</Text>
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
  headerLogo: { width: 40, height: 40 },
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
  catGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: spacing.lg },
  catTile: {
    width: "48%",
    alignItems: "stretch",
  },
  catImageTile: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  catImageTileDisabled: { borderStyle: "dashed", borderColor: colors.borderDashed },
  comingSoonBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: colors.comingSoonBadge,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  comingSoonText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  catEmoji: { fontSize: 44 },
  catImage: { width: "100%", height: "100%" },
  catName: { fontSize: 15, fontWeight: "700", color: colors.textMain, lineHeight: 19, textAlign: "center", marginTop: 8, paddingHorizontal: 4 },
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
    position: "relative",
    overflow: "hidden",
  },
  prodImageBtn: {
    position: "absolute",
    right: 6,
    bottom: 6,
  },
  prodHeart: { position: "absolute", top: 4, left: 4, width: 26, height: 26, borderRadius: 13 },
  prodLowStock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(239,68,68,0.92)",
    paddingVertical: 2,
    alignItems: "center",
  },
  prodLowStockText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  prodDim: { opacity: 0.35 },
  prodOos: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(55,65,81,0.92)", paddingVertical: 2, alignItems: "center" },
  prodOosText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  prodEmoji: { fontSize: 44 },
  prodImg: { width: "100%", height: "100%" },
  prodName: { fontSize: 13, fontWeight: "600", color: colors.textMain, lineHeight: 16 },
  prodUnit: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  prodUnitRight: { marginTop: 0, marginLeft: "auto" },
  prodMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, minHeight: 14 },
  prodOff: { fontSize: 11, fontWeight: "800", color: colors.error, letterSpacing: 0.2 },
  prodPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 3 },
  prodMrp: { fontSize: 11, color: colors.textMuted, textDecorationLine: "line-through" },
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
