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
  // The admin/master sets an explicit DISCOUNT % — that is the badge value.
  // The struck-through price is the MRP (PRE-DISCOUNT) when it is above the
  // selling price, otherwise derived from the discount percentage.
  const mrp = p.mrp_lek && p.mrp_lek > p.price_lek ? p.mrp_lek : null;
  const d = Number(p.discount || 0);
  if (d > 0 && d < 100) {
    return {
      pct: Math.round(d),
      struckLek: mrp ?? Math.round(p.price_lek / (1 - d / 100)),
    };
  }
  if (mrp) {
    return {
      pct: Math.round(((mrp - p.price_lek) / mrp) * 100),
      struckLek: mrp,
    };
  }
  return null;
}

/** True when the product is running low (still available, but few units left). */
export function isLowStock(p: Product): boolean {
  return Boolean(p.in_stock) && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD;
}
