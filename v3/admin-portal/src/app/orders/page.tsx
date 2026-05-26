"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import { usePagination } from "@/hooks/usePagination";
import { ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface Order { id: number; order_number: string; status: string; order_type: string; total_amount: number; customer_name?: string; created_at: string; }
interface Store { id: number; store_name: string; }

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const router = useRouter();
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState("");
  const [orderType, setOrderType] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const pagination = usePagination({ defaultPage: 1, defaultPerPage: PAGE_SIZE });

  const fetchStores = useCallback(async () => {
    try { const d = await api.getRaw<any>("/admin/stores?per_page=50"); const list = d.items || []; setStores(list); if (!storeId) setStoreId(""); }
    catch (e: any) { console.error("Failed to load stores:", e); }
  }, []);

  useEffect(() => { fetchStores(); }, [fetchStores]);

  const fetchOrders = useCallback(async (p: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), per_page: String(PAGE_SIZE) });
      if (storeId) params.set("store_id", storeId);
      if (status) params.set("status", status);
      if (orderType) params.set("order_type", orderType);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const d = await api.getRaw<any>(`/admin/orders?${params}`);
      setItems(d.items || []);
      pagination.setTotal(d.total || 0);
      pagination.setTotalPages(d.total_pages || 1);
      pagination.setPage(p);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [storeId, status, orderType, debouncedSearch, pagination.setTotal, pagination.setTotalPages, pagination.setPage]);

  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  const sb = (s: string) => {
    const m: Record<string, string> = { pending: "badge-yellow", confirmed: "badge-blue", preparing: "badge-orange", ready_for_pickup: "badge-green", out_for_delivery: "badge-blue", delivered: "badge-green", cancelled_by_customer: "badge-red", cancelled_by_merchant: "badge-red", refunded: "badge-gray", partially_refunded: "badge-yellow", disputed: "badge-purple" };
    return <span className={`badge badge-sm ${m[s] || "badge-gray"}`}>{s?.replace(/_/g, " ")}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Orders</h1><p className="page-subtitle">{pagination.total} orders</p></div></div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "end" }}>
        <div><label htmlFor="order-store-filter" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Store</label>
          <select id="order-store-filter" value={storeId} onChange={e => setStoreId(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}><option value="">All Stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
        <div><label htmlFor="order-status-filter" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Status</label>
          <select id="order-status-filter" value={status} onChange={e => setStatus(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}><option value="">All</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="preparing">Preparing</option><option value="ready_for_pickup">Ready</option><option value="out_for_delivery">Out for Delivery</option><option value="delivered">Delivered</option><option value="cancelled_by_customer">Cancelled by Customer</option><option value="cancelled_by_merchant">Cancelled by Merchant</option><option value="refunded">Refunded</option></select></div>
        <div><label htmlFor="order-type-filter" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Type</label>
          <select id="order-type-filter" value={orderType} onChange={e => setOrderType(e.target.value)} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}><option value="">All</option><option value="dine_in">Dine-in</option><option value="takeaway">Takeaway</option><option value="delivery">Delivery</option></select></div>
        <div><label htmlFor="order-search" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Search</label>
          <input id="order-search" type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Order #..." style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", width: 140 }} /></div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} of {pagination.total} orders</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Order #</th><th>Customer</th><th>Type</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th><th>Date</th><th style={{ width: 70 }}>View</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">Loading...</td></tr>
          : items.length === 0 ? <tr><td colSpan={7} className="data-table-empty">No orders found.</td></tr>
          : items.map(o => (
            <tr key={o.id} className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();router.push(`/orders/${o.id}`);}}} onClick={() => router.push(`/orders/${o.id}`)} style={{ cursor: "pointer" }}>
              <td style={{ fontSize: 11 }} className="font-mono">{o.order_number}</td>
              <td>{o.customer_name || "—"}</td>
              <td style={{ textTransform: "capitalize", fontSize: 12 }}>{o.order_type?.replace(/_/g, " ")}</td>
              <td>{sb(o.status)}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>RM {(Number(o.total_amount) || 0).toFixed(2)}</td>
              <td style={{ fontSize: 12 }}>{o.created_at ? new Date(o.created_at).toLocaleDateString("en-MY") : "—"}</td>
              <td><button type="button" onClick={e => { e.stopPropagation(); router.push(`/orders/${o.id}`); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><ExternalLink size={12} /> View</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {pagination.totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasPrev} onClick={() => { pagination.prevPage(); fetchOrders(pagination.page - 1); }}><ChevronLeft size={14} /> Prev</button>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasNext} onClick={() => { pagination.nextPage(); fetchOrders(pagination.page + 1); }}>Next <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
