import type { MenuItem, CartItem, BundleProduct } from '@/lib/api';

export interface AddonDiscountPreview {
  unitPrice: number;
  discountPerUnit: number;
  discountedUnitPrice: number;
  savingsPerUnit: number;
}

/**
 * Compute the add-on deal discount preview for a single unit of an item.
 * Mirrors backend logic in services/order.py (percentage / fixed, capped at line unit).
 */
export function previewAddonDiscount(item: MenuItem): AddonDiscountPreview | null {
  if (!item.is_addon_deal_eligible) return null;
  const unitPrice = item.base_price;
  const value = item.addon_discount_value ?? 0;
  let discountPerUnit = 0;
  if (item.addon_discount_type === 'percentage') {
    discountPerUnit = (unitPrice * value) / 100;
  } else {
    discountPerUnit = value;
  }
  discountPerUnit = Math.min(discountPerUnit, unitPrice);
  discountPerUnit = Math.max(0, discountPerUnit);
  const discountedUnitPrice = Math.max(0, unitPrice - discountPerUnit);
  return {
    unitPrice,
    discountPerUnit,
    discountedUnitPrice,
    savingsPerUnit: discountPerUnit,
  };
}

/** Bundle product ids currently present in the cart (as bundle components). */
export function bundleIdsInCart(items: CartItem[]): number[] {
  const ids = new Set<number>();
  for (const it of items) {
    if (it.bundle_product_id) ids.add(it.bundle_product_id);
  }
  return Array.from(ids);
}

/**
 * Menu items eligible as add-ons for at least one bundle currently in the cart.
 * `bundleProducts` is optional and only used to enrich the returned bundle ref.
 */
export function eligibleAddonItems(
  menuItems: MenuItem[],
  items: CartItem[],
  bundleProducts?: BundleProduct[],
): Array<{ item: MenuItem; bundle: BundleProduct | null; preview: AddonDiscountPreview }> {
  const cartBundleIds = new Set(bundleIdsInCart(items));
  if (cartBundleIds.size === 0) return [];
  const bundleMap = new Map<number, BundleProduct>();
  if (bundleProducts) {
    for (const bp of bundleProducts) bundleMap.set(bp.id, bp);
  }
  const result: Array<{ item: MenuItem; bundle: BundleProduct | null; preview: AddonDiscountPreview }> = [];
  for (const item of menuItems) {
    if (!item.is_available) continue;
    if (!item.is_addon_deal_eligible) continue;
    const eligibleIds = item.eligible_bundle_ids;
    if (!eligibleIds || eligibleIds.length === 0) continue;
    const matchedId = eligibleIds.find((bid) => cartBundleIds.has(bid));
    if (matchedId === undefined) continue;
    const preview = previewAddonDiscount(item);
    if (!preview) continue;
    result.push({ item, bundle: bundleMap.get(matchedId) ?? null, preview });
  }
  return result;
}

/** Filter eligible addons for a specific bundle id (used by post-add upsell sheet). */
export function eligibleAddonsForBundle(
  menuItems: MenuItem[],
  bundleId: number,
): Array<{ item: MenuItem; preview: AddonDiscountPreview }> {
  const out: Array<{ item: MenuItem; preview: AddonDiscountPreview }> = [];
  for (const item of menuItems) {
    if (!item.is_available) continue;
    if (!item.is_addon_deal_eligible) continue;
    const eligibleIds = item.eligible_bundle_ids;
    if (!eligibleIds || !eligibleIds.includes(bundleId)) continue;
    const preview = previewAddonDiscount(item);
    if (!preview) continue;
    out.push({ item, preview });
  }
  return out;
}

export interface CartDiscountBreakdown {
  bundleDiscount: number;
  addonDiscount: number;
  total: number;
}

/**
 * Preview bundle + add-on discounts for the current cart.
 * Mirrors backend logic in services/order.py (bundle: component_sum - bundle_price;
 * addon: percentage/fixed per eligible non-bundle line, capped at line unit).
 * Voucher/reward discounts are NOT included here (those come from the selector).
 */
export function previewCartDiscounts(
  cartItems: CartItem[],
  menuItems: MenuItem[],
  bundleProducts: BundleProduct[],
): CartDiscountBreakdown {
  const bundleMap = new Map<number, BundleProduct>();
  for (const bp of bundleProducts) bundleMap.set(bp.id, bp);
  const cartBundleIds = new Set<number>();
  for (const it of cartItems) {
    if (it.bundle_product_id) cartBundleIds.add(it.bundle_product_id);
  }

  let bundleDiscount = 0;
  for (const bid of cartBundleIds) {
    const bp = bundleMap.get(bid);
    if (!bp || !bp.is_active) continue;
    const bundleItems = cartItems.filter((ci) => ci.bundle_product_id === bid);
    const componentSum = bundleItems.reduce(
      (sum, ci) => sum + ci.price * ci.quantity,
      0,
    );
    const disc = componentSum - bp.bundle_price;
    if (disc > 0) bundleDiscount += disc;
  }

  const menuItemMap = new Map<number, MenuItem>();
  for (const mi of menuItems) menuItemMap.set(mi.id, mi);

  let addonDiscount = 0;
  if (cartBundleIds.size > 0) {
    for (const ci of cartItems) {
      if (ci.bundle_product_id) continue;
      const mi = menuItemMap.get(ci.menu_item_id);
      if (!mi || !mi.is_addon_deal_eligible) continue;
      const eligibleIds = mi.eligible_bundle_ids;
      if (!eligibleIds || eligibleIds.length === 0) continue;
      if (!eligibleIds.some((bid) => cartBundleIds.has(bid))) continue;
      const lineUnit = ci.price;
      const value = mi.addon_discount_value ?? 0;
      let disc = 0;
      if (mi.addon_discount_type === 'percentage') {
        disc = (lineUnit * value) / 100;
      } else {
        disc = value;
      }
      disc = Math.min(disc, lineUnit) * ci.quantity;
      addonDiscount += Math.max(0, disc);
    }
  }

  return {
    bundleDiscount,
    addonDiscount,
    total: bundleDiscount + addonDiscount,
  };
}
