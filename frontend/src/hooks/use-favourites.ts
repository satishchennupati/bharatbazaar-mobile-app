/**
 * Favourites (wishlist) mutations. Mirrors use-cart-actions:
 *  - Auth check (route to login instead of silently failing)
 *  - Optimistic toggle with server reconciliation
 *  - 401 auto-recovery (stale token → clear session → login)
 */
import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";

import { api } from "@/src/lib/api";
import { useApp } from "@/src/store/app-context";

function toast(message: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.alert) window.alert(message);
    return;
  }
  Alert.alert("Favourites", message);
}

export function useFavourites() {
  const router = useRouter();
  const { token, favIds, applyFavourites, clearSession } = useApp();

  const isFavourite = useCallback((productId: string) => Boolean(favIds[productId]), [favIds]);

  const handleErr = useCallback(
    async (e: any) => {
      const msg = e?.message || "Something went wrong";
      const is401 =
        msg.toLowerCase().includes("token") ||
        msg.toLowerCase().includes("unauthorized") ||
        msg === "User not found";
      if (is401) {
        await clearSession();
        toast("Your session expired — please sign in again.");
        router.replace("/(auth)/login");
        return;
      }
      console.warn("[favourites] failed:", msg);
    },
    [router, clearSession],
  );

  const toggleFavourite = useCallback(
    async (productId: string) => {
      if (!token) {
        toast("Please sign in to save favourites.");
        router.push("/(auth)/login");
        return;
      }
      const wasFav = Boolean(favIds[productId]);
      // Optimistic update
      const optimistic = Object.keys(favIds);
      const nextIds = wasFav
        ? optimistic.filter((id) => id !== productId)
        : [productId, ...optimistic];
      applyFavourites(nextIds);
      try {
        const res = wasFav
          ? await api.del<{ favourites: string[] }>(`/me/favourites/${productId}`)
          : await api.post<{ favourites: string[] }>(`/me/favourites/${productId}`, {}, true);
        applyFavourites(res.favourites);
      } catch (e: any) {
        // Revert on failure
        applyFavourites(optimistic);
        await handleErr(e);
      }
    },
    [token, favIds, applyFavourites, router, handleErr],
  );

  return { isFavourite, toggleFavourite };
}
