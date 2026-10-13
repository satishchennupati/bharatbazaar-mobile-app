/**
 * Category product list — Blinkit-style card grid (also handles /category/search?q=...).
 *
 * 3-column grid of compact cards: contained product image, 2-line name,
 * unit/weight, red "X% OFF" + strikethrough MRP when available, bold price,
 * and an ADD/stepper button anchored bottom-right.
 */
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Category, type Product } from "@/src/lib/api";
import { discountInfo, isLowStock } from "@/src/lib/product";
import { useApp, formatPrice } from "@/src/store/app-context";
import { useCartActions } from "@/src/hooks/use-cart-actions";
import { ProductAddButton } from "@/src/components/product-add-button";
import { FavouriteHeart } from "@/src/components/favourite-heart";
import { FloatingCartBar } from "@/src/components/floating-cart-bar";
import { colors, radius, spacing } from "@/src/theme";

const NUM_COLS = 3;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\brte\b/i, "RTE")
    .replace(/\brtc\b/i, "RTC");
}

type SortKey = "alpha" | "relevance" | "price_asc" | "price_desc" | "discount";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "alpha", label: "Name: A to Z" },
  { key: "relevance", label: "Recommended" },
  { key: "price_asc", label: "Price: Low to High" },
  { key: "price_desc", label: "Price: High to Low" },
  { key: "discount", label: "Discount" },
];

function sortProducts(items: Product[], key: SortKey): Product[] {
  const arr = [...items];
  switch (key) {
    case "alpha":
      return arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    case "price_asc":
      return arr.sort((a, b) => a.price_lek - b.price_lek);
    case "price_desc":
      return arr.sort((a, b) => b.price_lek - a.price_lek);
    case "discount":
      return arr.sort((a, b) => (discountInfo(b)?.pct || 0) - (discountInfo(a)?.pct || 0));
    default:
      return arr;
  }
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
  const [sortKey, setSortKey] = useState<SortKey>(isSearch ? "relevance" : "alpha");
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [subFilter, setSubFilter] = useState<string | null>(null);

  // Distinct sub-categories present in this list (for the filter chips).
  const subcats = useMemo(() => {
    const seen = new Set<string>();
    products.forEach((p) => {
      const s = (p.subcategory || "").trim();
      if (s) seen.add(s);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const sorted = useMemo(() => sortProducts(products, sortKey), [products, sortKey]);
  // In-category search + sub-category filter (search matches product name only).
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sorted.filter((p) => {
      if (subFilter && (p.subcategory || "").trim() !== subFilter) return false;
      if (term && !p.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [sorted, query, subFilter]);
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Sort";

  useEffect(() => {
    const load = async () => {
      try {
        if (isSearch) {
          const items = await api.get<Product[]>(`/products?q=${encodeURIComponent(q || "")}&limit=500`);
          setProducts(items);
        } else {
          const [items, cats] = await Promise.all([
            api.get<Product[]>(`/products?category=${slug}&limit=500`),
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
      {products.length > 0 ? (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={isSearch ? "Refine results" : `Search in ${cat?.name || "category"}`}
            placeholderTextColor={colors.textDisabled}
            style={styles.searchInput}
            returnKeyType="search"
            testID="cat-search-input"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} testID="cat-search-clear">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {products.length > 0 && subcats.length > 1 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              onPress={() => setSubFilter(null)}
              style={[styles.chip, !subFilter && styles.chipActive]}
              testID="cat-subchip-all"
            >
              <Text style={[styles.chipText, !subFilter && styles.chipTextActive]}>All</Text>
            </Pressable>
            {subcats.map((s) => {
              const active = subFilter === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSubFilter(active ? null : s)}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`cat-subchip-${s}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {titleCase(s)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      {products.length > 0 ? (
        <View style={styles.sortBar}>
          <Text style={styles.sortCount}>{visible.length} items</Text>
          <Pressable style={styles.sortBtn} onPress={() => setSortOpen(true)} testID="cat-sort-btn">
            <Ionicons name="swap-vertical" size={16} color={colors.textMain} />
            <Text style={styles.sortBtnText} numberOfLines={1}>{sortLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {products.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search" size={48} color={colors.textDisabled} />
          <Text style={styles.emptyText}>No products found</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search" size={48} color={colors.textDisabled} />
          <Text style={styles.emptyText}>No matches for “{query.trim()}”</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          numColumns={NUM_COLS}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: 130 + insets.bottom, gap: 22 }}
          renderItem={({ item }) => {
            const disc = discountInfo(item);
            const oos = item.in_stock === false;
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
                      style={[styles.imgReal, oos && styles.imgDim]}
                      resizeMode="contain"
                    />
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
                </View>

                {/* Name — 2 lines max */}
                <Text style={[styles.name, oos && styles.textDim]} numberOfLines={2}>
                  {item.name}
                </Text>
                {/* Meta row: discount "X% OFF" left-aligned, weight/unit
                    right-aligned. Weight stays right-aligned even when there
                    is no discount (marginLeft: auto). */}
                <View style={styles.metaRow}>
                  {disc ? <Text style={styles.off}>{disc.pct}% OFF</Text> : null}
                  <Text style={[styles.unit, styles.unitRight]} numberOfLines={1}>
                    {item.unit || item.weight}
                  </Text>
                </View>

                {/* Price row: original price struck-through on the LEFT and
                    the new discounted price on the RIGHT of it. */}
                <View style={styles.priceRow}>
                  {disc ? (
                    <Text style={styles.mrp} numberOfLines={1}>
                      {formatPrice(disc.struckLek, disc.struckLek / 100, currency)}
                    </Text>
                  ) : null}
                  <Text style={[styles.price, oos && styles.textDim]} numberOfLines={1}>
                    {formatPrice(item.price_lek, item.price_eur, currency)}
                  </Text>
                </View>

                {/* ADD / stepper floats on the card's bottom-right corner
                    (Blinkit-style). Hidden entirely when out of stock. */}
                {!oos ? (
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
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
      <FloatingCartBar bottomInset={Math.max(16, insets.bottom + 12)} />

      <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSortOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(spacing.lg, insets.bottom + 12) }]}>
          <Text style={styles.sheetTitle}>Sort by</Text>
          {SORT_OPTIONS.map((opt) => {
            const active = opt.key === sortKey;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setSortKey(opt.key);
                  setSortOpen(false);
                }}
                style={styles.sheetRow}
                testID={`cat-sort-opt-${opt.key}`}
              >
                <Text style={[styles.sheetRowText, active && { color: colors.primary, fontWeight: "700" }]}>
                  {opt.label}
                </Text>
                {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
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

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textMain, paddingVertical: 11 },
  chipRow: { paddingHorizontal: spacing.base, gap: 8, paddingBottom: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.textMain, maxWidth: 160 },
  chipTextActive: { color: "#fff" },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  sortCount: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 200,
  },
  sortBtnText: { fontSize: 12, fontWeight: "700", color: colors.textMain },

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
  imgDim: { opacity: 0.35 },
  textDim: { color: colors.textMuted },
  oosOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(55,65,81,0.92)",
    paddingVertical: 3,
    alignItems: "center",
  },
  oosText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  heart: { position: "absolute", top: 4, right: 4, width: 26, height: 26, borderRadius: 13 },
  lowStock: {
    position: "absolute",
    left: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "rgba(239,68,68,0.92)",
    paddingVertical: 2,
    alignItems: "center",
  },
  lowStockText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.2 },
  name: { fontSize: 12, fontWeight: "600", color: colors.textMain, lineHeight: 15, minHeight: 30 },
  unit: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, minHeight: 14 },
  unitRight: { marginTop: 0, marginLeft: "auto" },
  off: { fontSize: 10, fontWeight: "800", color: colors.error, letterSpacing: 0.2 },
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
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.textMain, marginBottom: spacing.sm },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetRowText: { fontSize: 15, color: colors.textMain, fontWeight: "500" },
});
