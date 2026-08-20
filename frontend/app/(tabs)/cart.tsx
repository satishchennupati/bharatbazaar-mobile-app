/**
 * Cart: list items, edit qty, apply coupon, see totals, checkout.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, resolveImageUrl, type Cart } from "@/src/lib/api";
import { useApp, formatPrice } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

const FREE_MIN_LEK = 2000;
const LEK_PER_EUR = 100;

export default function CartScreen() {
  const router = useRouter();
  const { t, currency, setCartCount, appliedCoupon, setAppliedCoupon } = useApp();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

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

  // Re-validate applied coupon whenever the cart subtotal changes so
  // "min order" thresholds are respected while the user edits quantities.
  const reValidateCoupon = useCallback(
    async (code: string, subtotal: number): Promise<{ ok: boolean; discount: number; message?: string }> => {
      try {
        const r = await api.post<{ valid: boolean; discount_lek: number; message?: string }>(
          "/offers/validate-coupon",
          { code, subtotal_lek: subtotal },
          true,
        );
        return { ok: r.valid, discount: r.discount_lek || 0, message: r.message };
      } catch (e: any) {
        return { ok: false, discount: 0, message: e?.message };
      }
    },
    [],
  );

  const currentSubLek = cart?.subtotal_lek || 0;
  useEffect(() => {
    if (!appliedCoupon || !cart || cart.items.length === 0) return;
    let cancelled = false;
    reValidateCoupon(appliedCoupon.code, currentSubLek).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setAppliedCoupon(null);
        setCouponError(r.message || "Coupon no longer applies");
      } else if (r.discount !== appliedCoupon.discount_lek) {
        setAppliedCoupon({ code: appliedCoupon.code, discount_lek: r.discount, message: r.message });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSubLek]);

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

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    const r = await reValidateCoupon(code, subLek);
    setCouponBusy(false);
    if (!r.ok) {
      setCouponError(r.message || "Invalid coupon");
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon({ code, discount_lek: r.discount, message: r.message });
    setCouponInput("");
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
  };

  const couponDiscountLek = appliedCoupon?.discount_lek || 0;
  const couponDiscountEur = couponDiscountLek / LEK_PER_EUR;
  // The exact delivery fee is calculated at checkout (depends on the delivery
  // address zone and cart weight). Here we only surface the free-shipping
  // threshold so users know how close they are to unlocking it.
  const netSubLek = subLek - couponDiscountLek;
  const isFree = netSubLek >= FREE_MIN_LEK;
  const totalLek = Math.max(0, netSubLek);
  const totalEur = Math.max(0, subEur - couponDiscountEur);
  const needForFree = Math.max(0, FREE_MIN_LEK - netSubLek);

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
                    style={[styles.qtyBtn, { backgroundColor: "transparent" }]}
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
                    <Ionicons name="add" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}
          />

          <View style={styles.summary}>
            {/* Coupon block */}
            {appliedCoupon ? (
              <View style={styles.couponApplied} testID="cart-coupon-applied">
                <View style={styles.couponAppliedIcon}>
                  <Ionicons name="pricetag" size={14} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.couponAppliedCode}>{appliedCoupon.code}</Text>
                  <Text style={styles.couponAppliedMsg}>{appliedCoupon.message || `You save ${Math.round(appliedCoupon.discount_lek)} L`}</Text>
                </View>
                <Pressable onPress={removeCoupon} hitSlop={10} testID="cart-coupon-remove">
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.couponRow}>
                <View style={styles.couponIconBox}>
                  <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
                </View>
                <TextInput
                  value={couponInput}
                  onChangeText={(v) => {
                    setCouponInput(v.toUpperCase());
                    if (couponError) setCouponError(null);
                  }}
                  placeholder="Have a coupon code?"
                  placeholderTextColor={colors.textDisabled}
                  autoCapitalize="characters"
                  style={styles.couponInput}
                  onSubmitEditing={applyCoupon}
                  returnKeyType="done"
                  testID="cart-coupon-input"
                />
                <Pressable
                  onPress={applyCoupon}
                  style={[styles.couponApplyBtn, (!couponInput.trim() || couponBusy) && { opacity: 0.5 }]}
                  disabled={!couponInput.trim() || couponBusy}
                  testID="cart-coupon-apply"
                >
                  {couponBusy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.couponApplyText}>Apply</Text>
                  )}
                </Pressable>
              </View>
            )}
            {couponError ? (
              <Text style={styles.couponErrorText} testID="cart-coupon-error">
                {couponError}
              </Text>
            ) : null}

            <Row label={t("subtotal")} value={formatPrice(subLek, subEur, currency)} />
            {couponDiscountLek > 0 && (
              <Row
                label={`Coupon (${appliedCoupon?.code})`}
                value={`- ${formatPrice(couponDiscountLek, couponDiscountEur, currency)}`}
                valueColor={colors.success}
              />
            )}
            <Row
              label={t("delivery_fee")}
              value={isFree ? t("free") : "At checkout"}
              valueColor={isFree ? colors.success : colors.textMuted}
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
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16A34A",
  },
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
  // Coupon block
  couponRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
  couponIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  couponInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textMain,
    fontWeight: "700",
    letterSpacing: 0.5,
    paddingVertical: 6,
  },
  couponApplyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    minWidth: 68,
    alignItems: "center",
  },
  couponApplyText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  couponApplied: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E7F7EC",
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  couponAppliedIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  couponAppliedCode: { fontSize: 13, fontWeight: "800", color: colors.textMain, letterSpacing: 0.5 },
  couponAppliedMsg: { fontSize: 11, color: colors.textMuted },
  couponErrorText: { fontSize: 11, color: colors.error, marginTop: -2, marginBottom: 4 },
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
