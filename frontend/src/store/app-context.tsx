/**
 * Lightweight app context: auth, lang, currency, cart count.
 * Persists session token + prefs via @/src/utils/storage.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { storage } from "@/src/utils/storage";
import type { Currency, Lang } from "@/src/i18n";
import { t as translate } from "@/src/i18n";

const STORAGE_TOKEN = "mbc_token";
const STORAGE_USER = "mbc_user";
const STORAGE_LANG = "mbc_lang";
const STORAGE_CURRENCY = "mbc_currency";
const STORAGE_ONBOARDED = "mbc_onboarded";

export type User = {
  id: string;
  username: string;
  phone?: string;
  full_name?: string;
  email?: string;
  language?: string;
  currency?: Currency;
  addresses?: any[];
  avatar_url?: string | null;
  is_admin?: boolean;
};

type Ctx = {
  ready: boolean;
  onboarded: boolean;
  setOnboarded: (v: boolean) => Promise<void>;
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => Promise<void>;
  clearSession: () => Promise<void>;
  refreshUser: (u: User) => Promise<void>;
  lang: Lang;
  setLang: (l: Lang) => Promise<void>;
  currency: Currency;
  setCurrency: (c: Currency) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  cartCount: number;
  setCartCount: (n: number) => void;
  cartQtyMap: Record<string, number>;
  applyCart: (items: Array<{ product_id: string; qty: number }> | undefined | null, count?: number) => void;
  selectedAddress: SelectedAddress | null;
  setSelectedAddress: (a: SelectedAddress | null) => void;
  appliedCoupon: AppliedCoupon | null;
  setAppliedCoupon: (c: AppliedCoupon | null) => void;
};

export type AppliedCoupon = {
  code: string;
  discount_lek: number;
  message?: string;
};

export type SelectedAddress = {
  formatted_address: string;
  line1: string;
  city: string;
  state: string;
  area: string;
  postal_code: string;
  country: string;
  country_code: string;
  lat: number;
  lng: number;
  place_id: string;
  serviceable: boolean;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboardedState] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLangState] = useState<Lang>("en");
  const [currency, setCurrencyState] = useState<Currency>("LEK");
  const [cartCount, setCartCount] = useState(0);
  const [cartQtyMap, setCartQtyMap] = useState<Record<string, number>>({});
  const [selectedAddress, setSelectedAddress] = useState<SelectedAddress | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  const applyCart = useCallback(
    (items: Array<{ product_id: string; qty: number }> | undefined | null, count?: number) => {
      const next: Record<string, number> = {};
      let total = 0;
      (items || []).forEach((it) => {
        next[it.product_id] = it.qty;
        total += it.qty;
      });
      setCartQtyMap(next);
      setCartCount(typeof count === "number" ? count : total);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const [tk, u, l, c, ob] = await Promise.all([
        storage.secureGet(STORAGE_TOKEN, ""),
        storage.getItem(STORAGE_USER, ""),
        storage.getItem(STORAGE_LANG, "en"),
        storage.getItem(STORAGE_CURRENCY, "LEK"),
        storage.getItem(STORAGE_ONBOARDED, false),
      ]);
      if (tk) setToken(String(tk));
      if (u) {
        try {
          setUser(JSON.parse(String(u)));
        } catch {}
      }
      if (l) setLangState(l as Lang);
      if (c) setCurrencyState(c as Currency);
      if (ob) setOnboardedState(Boolean(ob));
      setReady(true);
    })();
  }, []);

  const setSession = useCallback(async (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    await storage.secureSet(STORAGE_TOKEN, newToken);
    await storage.setItem(STORAGE_USER, JSON.stringify(newUser));
    if (newUser.language) {
      setLangState(newUser.language as Lang);
      await storage.setItem(STORAGE_LANG, newUser.language);
    }
    if (newUser.currency) {
      setCurrencyState(newUser.currency);
      await storage.setItem(STORAGE_CURRENCY, newUser.currency);
    }
  }, []);

  const clearSession = useCallback(async () => {
    setToken(null);
    setUser(null);
    setCartCount(0);
    setCartQtyMap({});
    setSelectedAddress(null);
    setAppliedCoupon(null);
    await storage.secureRemove(STORAGE_TOKEN);
    await storage.removeItem(STORAGE_USER);
  }, []);

  const refreshUser = useCallback(async (u: User) => {
    setUser(u);
    await storage.setItem(STORAGE_USER, JSON.stringify(u));
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await storage.setItem(STORAGE_LANG, l);
  }, []);

  const setCurrency = useCallback(async (c: Currency) => {
    setCurrencyState(c);
    await storage.setItem(STORAGE_CURRENCY, c);
  }, []);

  const setOnboarded = useCallback(async (v: boolean) => {
    setOnboardedState(v);
    await storage.setItem(STORAGE_ONBOARDED, v);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  const value = useMemo<Ctx>(
    () => ({
      ready,
      onboarded,
      setOnboarded,
      token,
      user,
      setSession,
      clearSession,
      refreshUser,
      lang,
      setLang,
      currency,
      setCurrency,
      t,
      cartCount,
      setCartCount,
      cartQtyMap,
      applyCart,
      selectedAddress,
      setSelectedAddress,
      appliedCoupon,
      setAppliedCoupon,
    }),
    [ready, onboarded, setOnboarded, token, user, setSession, clearSession, refreshUser, lang, setLang, currency, setCurrency, t, cartCount, cartQtyMap, applyCart, selectedAddress, appliedCoupon],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function formatPrice(amountLek: number, amountEur: number, currency: Currency): string {
  if (currency === "EUR") {
    return `€${amountEur.toFixed(2)}`;
  }
  // Lek — no decimals typically
  return `${Math.round(amountLek)} L`;
}
