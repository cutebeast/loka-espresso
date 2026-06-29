import type { CustomizationOption, MenuItem, OperatingHour, Store } from './api';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function deriveCustomizationOptions(item: MenuItem | undefined | null): CustomizationOption[] {
  if (!item?.modifier_groups) return [];
  return item.modifier_groups.flatMap((mg) =>
    (mg.options || []).map((opt) => ({
      id: opt.id,
      name: opt.option_name,
      option_type: mg.selection_type,
      price_adjustment: opt.price_adjustment ?? 0,
      is_active: opt.is_available ?? true,
      is_popular: opt.is_default ?? false,
    }))
  );
}


export function formatOperatingHours(
  hours: OperatingHour[] | undefined | null,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(hours)) return result;
  for (const h of hours) {
    const day = DAY_NAMES[h.day_of_week] ?? String(h.day_of_week);
    if (h.is_closed) {
      result[day] = 'Closed';
      continue;
    }
    if (h.is_24_hours) {
      result[day] = 'Open 24 Hours';
      continue;
    }
    const open = (h.open_time || '').substring(0, 5);
    const close = (h.close_time || '').substring(0, 5);
    result[day] = open && close ? `${open} - ${close}` : 'Closed';
  }
  return result;
}

export function formatStoreAddress(store: Store | undefined | null): string {
  if (!store) return '';
  const parts = [
    store.address_line_1,
    store.address_line_2,
    store.city,
    store.state_province,
    store.postal_code,
  ].filter(Boolean);
  return parts.join(', ');
}

export function storeDisplayName(store: Store | undefined | null): string {
  return store?.store_name ?? '';
}
