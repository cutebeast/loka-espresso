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

/** Return the regular price of ``consumeQty`` bundle items, consuming the
 *  highest unit-price lines first to maximize the customer-facing discount.
 */
function consumedItemsPrice(
  items: Array<{ price: number; quantity: number }>,
  consumeQty: number,
): number {
  if (consumeQty <= 0 || items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => b.price - a.price);
  let remaining = consumeQty;
  let total = 0;
  for (const it of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(it.quantity, remaining);
    total += it.price * take;
    remaining -= take;
  }
  return total;
}

/**
 * Preview bundle + add-on discounts for the current cart.
 * Mirrors backend logic in services/order.py. Only the items that actually
 * form complete sets are discounted; extras are charged at regular price.
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

    let numSets = 0;
    let bundledSum = 0;
    if (bp.bundle_type === 'multi_course' && bp.groups && bp.groups.length > 0) {
      const componentGroupMap = new Map<number, { groupId: number; pickCount: number; minPick: number; maxPick: number }>();
      for (const g of bp.groups) {
        for (const comp of g.components || []) {
          componentGroupMap.set(comp.id, { groupId: g.id, pickCount: g.pick_count, minPick: g.min_pick, maxPick: g.max_pick });
        }
      }
      const groupQtys = new Map<number, number>();
      for (const ci of bundleItems) {
        const mapping = ci.bundle_component_id ? componentGroupMap.get(ci.bundle_component_id) : undefined;
        if (mapping) {
          groupQtys.set(mapping.groupId, (groupQtys.get(mapping.groupId) || 0) + ci.quantity);
        }
      }
      let groupOk = true;
      const setsPerGroup: number[] = [];
      for (const g of bp.groups) {
        const qty = groupQtys.get(g.id) || 0;
        if (qty < g.min_pick || qty > g.max_pick) {
          groupOk = false;
          break;
        }
        setsPerGroup.push(Math.floor(qty / g.pick_count));
      }
      if (groupOk && setsPerGroup.length > 0) {
        numSets = Math.min(...setsPerGroup);
        numSets = Math.min(numSets, bp.max_per_order ?? 1);
        for (const g of bp.groups) {
          const groupItems = bundleItems.filter((ci) =>
            ci.bundle_component_id && g.components?.some((c) => c.id === ci.bundle_component_id)
          );
          bundledSum += consumedItemsPrice(groupItems, numSets * g.pick_count);
        }
      }
    } else if (bp.pick_count && bp.pick_count > 0) {
      const qtyByComponent = new Map<number | string, number>();
      for (const ci of bundleItems) {
        const key = ci.bundle_component_id || ci.menu_item_id;
        qtyByComponent.set(key, (qtyByComponent.get(key) || 0) + ci.quantity);
      }
      const distinctCount = qtyByComponent.size;
      if (bp.allow_duplicates || distinctCount >= bp.pick_count) {
        const maxByTotal = Math.floor(bundleItems.reduce((sum, ci) => sum + ci.quantity, 0) / bp.pick_count);
        if (!bp.allow_duplicates) {
          const maxByComponent = qtyByComponent.size > 0 ? Math.min(...qtyByComponent.values()) : 0;
          numSets = Math.min(maxByTotal, maxByComponent);
        } else {
          numSets = maxByTotal;
        }
        numSets = Math.min(numSets, bp.max_per_order ?? 1);
        bundledSum = consumedItemsPrice(bundleItems, numSets * bp.pick_count);
      }
    } else {
      // Standard / fixed bundles: require every component in default_quantity.
      const compQty = new Map<number, number>();
      for (const ci of bundleItems) {
        if (ci.bundle_component_id) {
          compQty.set(ci.bundle_component_id, (compQty.get(ci.bundle_component_id) || 0) + ci.quantity);
        }
      }
      const setCounts: number[] = [];
      let complete = true;
      for (const comp of bp.components || []) {
        const qty = compQty.get(comp.id) || 0;
        const perSet = comp.default_quantity || 1;
        if (qty < perSet) {
          complete = false;
          break;
        }
        setCounts.push(Math.floor(qty / perSet));
      }
      if (complete && setCounts.length > 0) {
        numSets = Math.min(...setCounts);
        numSets = Math.min(numSets, bp.max_per_order ?? 1);
        for (const comp of bp.components || []) {
          const perSet = comp.default_quantity || 1;
          const compItems = bundleItems.filter((ci) => ci.bundle_component_id === comp.id);
          bundledSum += consumedItemsPrice(compItems, numSets * perSet);
        }
      }
    }

    if (numSets > 0 && bundledSum > 0) {
      const disc = bundledSum - bp.bundle_price * numSets;
      if (disc > 0) bundleDiscount += disc;
    }
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
