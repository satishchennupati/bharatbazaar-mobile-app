/**
 * Shared cart mutations. Encapsulates:
 *  - Auth check (route to login instead of silently failing)
 *  - Proper error surfacing (Alert instead of `catch {}`)
 *  - Auto-recovery from 401 (stale token → clear session → send to login)
 *
 * All product tiles (home, category, product detail) should call these instead
 * of duplicating API + error handling.
 */
import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";

import { api, type Cart } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";

type CartOpResult = { ok: boolean; error?: string };

function toast(message: string) {
  // Cross-platform lightweight notification.
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.alert) window.alert(message);
    return;
  }
  Alert.alert("Cart", message);
}

export function useCartActions() {
  const router = useRouter();
  const { token, applyCart, clearSession } = useApp();

  const requireAuth = useCallback((): boolean => {
    if (!token) {
      toast("Please sign in to start shopping.");
      router.push("/(auth)/login");
      return false;
    }
    return true;
  }, [token, router]);

  const handleErr = useCallback(
    async (op: string, e: any) => {
      const msg = e?.message || `Failed to ${op}`;
      const is401 =
        msg.toLowerCase().includes("token") ||
        msg.toLowerCase().includes("unauthorized") ||
        msg === "Missing bearer token" ||
        msg === "Invalid token" ||
        msg === "Token expired" ||
        msg === "User not found";
      if (is401) {
        await clearSession();
        toast("Your session expired — please sign in again.");
        router.replace("/(auth)/login");
        return;
      }
      // Log for Metro/Sentry visibility in dev builds.
      console.warn(`[cart] ${op} failed:`, msg);
      toast(msg);
    },
    [router, clearSession],
  );

  const addToCart = useCallback(
    async (productId: string, qty: number = 1): Promise<CartOpResult> => {
      if (!requireAuth()) return { ok: false, error: "not_authenticated" };
      try {
        const c = await api.post<Cart>("/cart", { product_id: productId, qty }, true);
        applyCart(c.items, c.count);
        return { ok: true };
      } catch (e: any) {
        await handleErr("add to cart", e);
        return { ok: false, error: e?.message };
      }
    },
    [applyCart, requireAuth, handleErr],
  );

  const setQty = useCallback(
    async (productId: string, qty: number): Promise<CartOpResult> => {
      if (!requireAuth()) return { ok: false, error: "not_authenticated" };
      try {
        const c = await api.patch<Cart>(`/cart/${productId}`, { qty });
        applyCart(c.items, c.count);
        return { ok: true };
      } catch (e: any) {
        await handleErr("update cart", e);
        return { ok: false, error: e?.message };
      }
    },
    [applyCart, requireAuth, handleErr],
  );

  const removeFromCart = useCallback(
    async (productId: string): Promise<CartOpResult> => {
      if (!requireAuth()) return { ok: false, error: "not_authenticated" };
      try {
        const c = await api.del<Cart>(`/cart/${productId}`);
        applyCart(c.items, c.count);
        return { ok: true };
      } catch (e: any) {
        await handleErr("remove from cart", e);
        return { ok: false, error: e?.message };
      }
    },
    [applyCart, requireAuth, handleErr],
  );

  return { addToCart, setQty, removeFromCart };
}
