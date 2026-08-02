/**
 * FloatingCartBar — sticky bottom pill showing cart count + total.
 * Rendered on Category & Product detail screens so users always see their cart.
 * Auto-hides when the cart is empty.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api, type Cart } from "@/src/lib/api";
import { formatPrice, useApp } from "@/src/store/app-context";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  /** Extra bottom padding — pass safe area inset if you need to lift above a tab bar. */
  bottomInset?: number;
  testID?: string;
};

export function FloatingCartBar({ bottomInset = 16, testID }: Props) {
  const router = useRouter();
  const { cartCount, currency, token } = useApp();
  const [subtotalLek, setSubtotalLek] = useState(0);
  const [subtotalEur, setSubtotalEur] = useState(0);
  const [loading, setLoading] = useState(false);

  // Whenever the cart count changes we lazily re-fetch the totals.
  useEffect(() => {
    if (!token || cartCount <= 0) {
      setSubtotalLek(0);
      setSubtotalEur(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const cart = await api.get<Cart>("/cart", true);
        if (!cancelled) {
          setSubtotalLek(cart.subtotal_lek || 0);
          setSubtotalEur(cart.subtotal_eur || 0);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cartCount, token]);

  if (!cartCount || cartCount <= 0) return null;

  return (
    <View style={[styles.wrap, { bottom: bottomInset, pointerEvents: "box-none" }]}>
      <Pressable
        onPress={() => router.push("/(tabs)/cart")}
        style={styles.bar}
        testID={testID || "floating-cart-bar"}
      >
        <View style={styles.badgeCol}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{cartCount}</Text>
          </View>
          <Text style={styles.itemsText}>{cartCount === 1 ? "item" : "items"}</Text>
        </View>
        <View style={styles.middleCol}>
          <Text style={styles.viewCartText}>View cart</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.subtotalText}>{formatPrice(subtotalLek, subtotalEur, currency)}</Text>
          )}
        </View>
        <View style={styles.arrowCol}>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 20,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  badgeCol: { alignItems: "center", justifyContent: "center" },
  badge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  itemsText: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "600", marginTop: 1 },
  middleCol: { flex: 1, alignItems: "center" },
  viewCartText: { color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
  subtotalText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "600", marginTop: 1 },
  arrowCol: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
});
