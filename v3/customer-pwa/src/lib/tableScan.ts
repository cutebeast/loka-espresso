import api from '@/lib/api';
import type { PaginatedResponse, Store as StoreType } from '@/lib/api';
import { useUIStore } from '@/stores/uiStore';

export interface TableScanResult {
  store_id: number;
  store_name: string;
  store_slug: string;
  table_id: number;
  table_number: string;
}

/**
 * Shared table-QR success path used by both the in-app scanner and the
 * boot deep-link handler (?store=<slug>&table=<id>&t=<token>):
 * validates the token server-side, sets the dine-in session, and selects
 * the scanned store.
 */
export async function scanTableQr(storeSlug: string, tableId: number, qrToken: string): Promise<TableScanResult> {
  const res = await api.post('/stores/tables/scan', {
    store_slug: storeSlug,
    table_id: tableId,
    qr_token: qrToken,
  });
  const data = res.data as TableScanResult;
  const ui = useUIStore.getState();
  ui.setDineInSession({
    storeId: data.store_id,
    storeName: data.store_name,
    storeSlug: data.store_slug,
    tableId: data.table_id,
    tableNumber: data.table_number,
  });
  ui.setOrderMode('dine_in');
  let found = ui.stores.find(s => s.id === data.store_id);
  if (!found) {
    const storeRes = await api.get('/stores');
    const storeData = storeRes.data as StoreType[] | PaginatedResponse<StoreType>;
    const storeList = Array.isArray(storeData) ? storeData : storeData?.items ?? [];
    if (storeList.length > 0) ui.setStores(storeList);
    found = storeList.find(s => s.id === data.store_id);
  }
  if (found) ui.setSelectedStore(found);
  return data;
}
