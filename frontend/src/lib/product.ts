/**
 * Shared product display helpers — discount computation and low-stock nudge.
 */
import type { Product } from "@/src/lib/api";

/** When stock is at or below this (and still in stock), show "Only few left". */
export const LOW_STOCK_THRESHOLD = 10;

export type DiscountInfo = { pct: number; struckLek: number };

/**
 * Compute the display discount for a product.
 *  1) Explicit MRP (original price) set in admin → % off vs selling price.
 *  2) Percentage discount set in admin → original price is derived so the
 *     current selling price = original × (1 − pct/100). Display-only; the
 *     amount charged stays `price_lek`.
 */
export function discountInfo(p: Product): DiscountInfo | null {
  if (p.mrp_lek && p.mrp_lek > p.price_lek) {
    return {
      pct: Math.round(((p.mrp_lek - p.price_lek) / p.mrp_lek) * 100),
      struckLek: p.mrp_lek,
    };
  }
  const d = Number(p.discount || 0);
  if (d > 0 && d < 100) {
    const original = p.price_lek / (1 - d / 100);
    return { pct: Math.round(d), struckLek: Math.round(original) };
  }
  return null;
}

/** True when the product is running low (still available, but few units left). */
export function isLowStock(p: Product): boolean {
  return Boolean(p.in_stock) && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD;
}
