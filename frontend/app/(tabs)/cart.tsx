/**
 * Cart: list items, edit qty, see totals, checkout.
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Cart } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

const FREE_MIN_LEK = 1500;
const DELIVERY_FEE_LEK = 99;
const LEK_PER_EUR = 100;

export default function CartScreen() {
  const router = useRouter();
  const { t, currency, setCartCount } = useApp();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api.get<Cart>("/cart", true);
      setCart(c);
      setCartCount(c.count || 0);
    } finally {
      setLoading(false);
    }
  }, [setCartCount]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const updateQty = async (pid: string, qty: number) => {
    setBusy(true);
    try {
      const c = await api.patch<Cart>(`/cart/${pid}`, { qty });
      setCart(c);
      setCartCount(c.count || 0);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (pid: string) => {
    setBusy(true);
    try {
      const c = await api.del<Cart>(`/cart/${pid}`);
      setCart(c);
      setCartCount(c.count || 0);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;
  const subLek = cart?.subtotal_lek || 0;
  const subEur = cart?.subtotal_eur || 0;
  const isFree = subLek >= FREE_MIN_LEK;
  const feeLek = isFree ? 0 : DELIVERY_FEE_LEK;
  const feeEur = isFree ? 0 : DELIVERY_FEE_LEK / LEK_PER_EUR;
  const totalLek = subLek + feeLek;
  const totalEur = subEur + feeEur;
  const needForFree = Math.max(0, FREE_MIN_LEK - subLek);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("your_cart")}</Text>
      </View>

      {isEmpty ? (
        <View style={styles.empty} testID="cart-empty">
          <Ionicons name="basket-outline" size={56} color={colors.textDisabled} />
          <Text style={styles.emptyTitle}>{t("empty_cart")}</Text>
          <Text style={styles.emptySub}>{t("empty_cart_sub")}</Text>
          <Pressable onPress={() => router.push("/(tabs)")} style={styles.cta} testID="cart-shop-now">
            <Text style={styles.ctaText}>{t("shop_by_category")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {!isFree && (
            <View style={styles.deliveryHint} testID="cart-free-delivery-hint">
              <Ionicons name="rocket" size={14} color={colors.primary} />
              <Text style={styles.deliveryHintText}>
                Add {Math.round(needForFree)} L more for FREE delivery
              </Text>
            </View>
          )}
          <FlatList
            data={cart!.items}
            keyExtractor={(it) => it.product_id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220, gap: spacing.md }}
            renderItem={({ item }) => (
              <View style={styles.row} testID={`cart-item-${item.product_id}`}>
                <View style={styles.imgBox}>
                  {item.image_url ? (
                    <Image source={{ uri: resolveImageUrl(item.image_url) }} style={styles.imgReal} resizeMode="contain" />
                  ) : (
                    <Text style={styles.imgEmoji}>{item.image_emoji}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.unit}>{item.unit}</Text>
                  <Text style={styles.price}>{formatPrice(item.line_lek, item.line_eur, currency)}</Text>
                </View>
                <View style={styles.qty}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => (item.qty > 1 ? updateQty(item.product_id, item.qty - 1) : remove(item.product_id))}
                    disabled={busy}
                    testID={`cart-dec-${item.product_id}`}
                  >
                    <Ionicons name={item.qty > 1 ? "remove" : "trash"} size={16} color={colors.primary} />
                  </Pressable>
                  <Text style={styles.qtyVal}>{item.qty}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => updateQty(item.product_id, item.qty + 1)}
                    disabled={busy}
                    testID={`cart-inc-${item.product_id}`}
                  >
                    <Ionicons name="add" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              </View>
            )}
          />

          <View style={styles.summary}>
            <Row label={t("subtotal")} value={formatPrice(subLek, subEur, currency)} />
            <Row
              label={t("delivery_fee")}
              value={isFree ? t("free") : formatPrice(feeLek, feeEur, currency)}
              valueColor={isFree ? colors.success : colors.textMain}
            />
            <View style={styles.divider} />
            <Row label={t("total")} value={formatPrice(totalLek, totalEur, currency)} bold />
            <Pressable
              onPress={() => router.push("/checkout")}
              style={styles.checkoutBtn}
              testID="cart-checkout-btn"
            >
              <Text style={styles.checkoutText}>{t("proceed_checkout")}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, bold, valueColor }: { label: string; value: string; bold?: boolean; valueColor?: string }) {
  return (
    <View style={summaryStyles.row}>
      <Text style={[summaryStyles.label, bold && { color: colors.textMain, fontWeight: "700", fontSize: 16 }]}>
        {label}
      </Text>
      <Text style={[summaryStyles.value, bold && { fontSize: 18 }, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: 0 },
  title: { fontSize: 26, fontWeight: "700", color: colors.textMain, letterSpacing: -0.5 },
  deliveryHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
  },
  deliveryHintText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.textMain, marginTop: 12 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  cta: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.lg, marginTop: 16 },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  imgBox: { width: 60, height: 60, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  imgEmoji: { fontSize: 32 },
  imgReal: { width: "100%", height: "100%" },
  name: { fontSize: 14, fontWeight: "600", color: colors.textMain },
  unit: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  price: { fontSize: 14, fontWeight: "700", color: colors.textMain, marginTop: 4 },
  qty: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: 4,
    gap: 4,
  },
  qtyBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  qtyVal: { minWidth: 18, textAlign: "center", fontWeight: "700", color: colors.primary, fontSize: 14 },
  summary: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  checkoutBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  checkoutText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

const summaryStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  label: { fontSize: 14, color: colors.textMuted },
  value: { fontSize: 14, fontWeight: "600", color: colors.textMain },
});
