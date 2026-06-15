/**
 * Backend API client. Reads EXPO_PUBLIC_BACKEND_URL (must end without /api).
 */
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? "";
const API = `${BASE}/api`;

async function authHeaders(): Promise<Record<string, string>> {
  const tk = await storage.secureGet("mbc_token", "");
  return tk ? { Authorization: `Bearer ${String(tk)}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message = (body && body.detail) || (typeof body === "string" ? body : `HTTP ${res.status}`);
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return body as T;
}

export const api = {
  baseUrl: API,

  async get<T>(path: string, withAuth = false): Promise<T> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (withAuth) Object.assign(h, await authHeaders());
    const res = await fetch(`${API}${path}`, { method: "GET", headers: h });
    return handle<T>(res);
  },

  async post<T>(path: string, body: any, withAuth = false): Promise<T> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (withAuth) Object.assign(h, await authHeaders());
    const res = await fetch(`${API}${path}`, { method: "POST", headers: h, body: JSON.stringify(body ?? {}) });
    return handle<T>(res);
  },

  async patch<T>(path: string, body: any, withAuth = true): Promise<T> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (withAuth) Object.assign(h, await authHeaders());
    const res = await fetch(`${API}${path}`, { method: "PATCH", headers: h, body: JSON.stringify(body ?? {}) });
    return handle<T>(res);
  },

  async del<T>(path: string, withAuth = true): Promise<T> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (withAuth) Object.assign(h, await authHeaders());
    const res = await fetch(`${API}${path}`, { method: "DELETE", headers: h });
    return handle<T>(res);
  },
};

// Domain types
export type Category = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  coming_soon: boolean;
  product_count: number;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  category_slug: string;
  price_lek: number;
  price_eur: number;
  image_emoji: string;
  image_url?: string | null;
  unit: string;
  in_stock: boolean;
  tags: string[];
};

export type CartItem = {
  product_id: string;
  name: string;
  image_emoji: string;
  image_url?: string | null;
  unit: string;
  price_lek: number;
  price_eur: number;
  qty: number;
  line_lek: number;
  line_eur: number;
};

export type Cart = {
  items: CartItem[];
  subtotal_lek: number;
  subtotal_eur: number;
  count: number;
};

export type Order = {
  id: string;
  items: CartItem[];
  address: any;
  payment_method: "COD";
  currency: "LEK" | "EUR";
  status: string;
  subtotal_lek: number;
  subtotal_eur: number;
  delivery_fee_lek: number;
  delivery_fee_eur: number;
  total_lek: number;
  total_eur: number;
  placed_at: string;
  eta_minutes: number;
};
