/**
 * Order display helpers shared across the admin screens.
 */

/** Total weight of an order in grams: prefers the stored shipping weight,
 *  otherwise sums item weight_grams × qty. */
export function orderWeightGrams(order: any): number {
  if (!order) return 0;
  const stored = Number(order.shipping_weight_grams);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return (order.items || []).reduce(
    (sum: number, it: any) => sum + (Number(it?.weight_grams) || 0) * (Number(it?.qty) || 1),
    0,
  );
}

/** Human-readable weight, e.g. "1.25 kg" or "450 g". */
export function formatWeight(grams: number): string {
  if (!grams || grams <= 0) return "—";
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}

/** Google Maps link for a delivery address. Uses lat/lng when available,
 *  otherwise a text search of the composed address. */
export function mapsUrlForAddress(address: any): string {
  const base = "https://www.google.com/maps/search/?api=1&query=";
  if (address?.lat != null && address?.lng != null) {
    return `${base}${address.lat},${address.lng}`;
  }
  const text =
    [address?.line1, address?.area, address?.landmark, address?.city, address?.state, address?.postal_code, address?.country]
      .filter(Boolean)
      .join(", ") ||
    address?.formatted_address ||
    "";
  return `${base}${encodeURIComponent(text)}`;
}
