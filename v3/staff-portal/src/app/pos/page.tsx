"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, QrCode, Plus, Minus, Trash2, CreditCard, ArrowLeft, X } from "lucide-react";

interface MenuItem { id: number; item_name: string; price: number; category_name: string; modifier_groups?: any[]; is_available: boolean; }
interface Category { id: number; category_name: string; }
interface CartItem { menu_item_id: number; name: string; qty: number; price: number; modifier_ids: number[]; modifiers_label: string; }
interface Customer { id: number; display_name: string; phone_number: string; }

type PosState = "menu" | "payment" | "done";

export default function PosPage() {
  const router = useRouter();
  const [state, setState] = useState<PosState>("menu");
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [tableId, setTableId] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("dine_in");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<any>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

  useEffect(() => {
    fetch(`/api/v1/admin/menu/items?per_page=200`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        const list = Array.isArray(d) ? d : (d.items || d.data || []);
        setItems(list.filter((i: any) => i.is_available));
      }).catch(() => {});
    fetch(`/api/v1/admin/menu/categories?per_page=50`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => {
        const list = Array.isArray(d) ? d : (d.items || d.data || []);
        setCategories(list); if (list.length > 0) setActiveCat(list[0].id);
      }).catch(() => {});
  }, []);

  const filteredItems = activeCat ? items.filter(i => (i as any).category_id === activeCat) : items;

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.menu_item_id === item.id);
      if (existing) return prev.map(c => c.menu_item_id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { menu_item_id: item.id, name: item.item_name, qty: 1, price: item.price, modifier_ids: [], modifiers_label: "" }];
    });
  };

  const removeFromCart = (menu_item_id: number) => {
    setCart(prev => prev.filter(c => c.menu_item_id !== menu_item_id));
  };

  const updateQty = (menu_item_id: number, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.menu_item_id !== menu_item_id) return c;
      const newQty = Math.max(0, c.qty + delta);
      return newQty === 0 ? null : { ...c, qty: newQty };
    }).filter(Boolean) as CartItem[]);
  };

  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const r = await fetch(`/api/v1/staff/customers/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setSearchResults((d.data?.items || d.items || []).slice(0, 5));
    } catch { setSearchResults([]); }
  }, [token]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal;

  const handleCheckout = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/v1/staff/pos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customer_id: selectedCustomer?.id || null,
          dining_table_id: tableId,
          order_type: orderType,
          line_items: cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.qty, modifier_ids: c.modifier_ids })),
          payment: { method: paymentMethod, amount_tendered: amountTendered ? parseFloat(amountTendered) : total, amount: total },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.message || "Checkout failed");
      setResult(d.data || d);
      setState("done");
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  };

  const newOrder = () => { setState("menu"); setCart([]); setSelectedCustomer(null); setTableId(null); setPaymentMethod("cash"); setAmountTendered(""); setResult(null); setMsg(""); };

  if (state === "done" && result) {
    return (
      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h2 style={{ margin: "0 0 4px" }}>Order Sent to Kitchen</h2>
        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>#{result.order_number || result.order_id}</p>
        <p style={{ fontSize: 13, opacity: 0.7, margin: "4px 0 0" }}>Paid: {paymentMethod} · Total: RM {total.toFixed(2)}</p>
        {result.change > 0 && <p style={{ fontSize: 13, opacity: 0.7 }}>Change: RM {result.change.toFixed(2)}</p>}
        <div style={{ marginTop: 20 }}>
          <button onClick={newOrder} className="home-btn--primary" style={{ padding: "12px 32px", borderRadius: 12, border: "none", fontSize: 16, fontWeight: 600, cursor: "pointer", background: "var(--brand-primary)", color: "white", width: "100%", maxWidth: 280 }}>New Order</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 12px 0", maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexShrink: 0 }}>
        <button onClick={() => router.push("/")} style={{ border: "none", background: "none", cursor: "pointer" }}><ArrowLeft size={18} /></button>
        <select value={orderType} onChange={e => setOrderType(e.target.value as any)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ccc", fontSize: 13 }}>
          <option value="dine_in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
        </select>
        {selectedCustomer && (
          <span style={{ fontSize: 12, padding: "2px 8px", background: "var(--brand-gold)", borderRadius: 8, color: "#1E1B18" }}>{selectedCustomer.display_name}</span>
        )}
        {tableId && <span style={{ fontSize: 12 }}>Table {tableId}</span>}
        <div style={{ flex: 1 }} />
        {cart.length > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700 }}>RM {total.toFixed(2)}</span>
        )}
      </div>

      {/* Customer Search */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 8, top: 9, opacity: 0.4 }} />
            <input value={searchQ} onChange={e => { setSearchQ(e.target.value); searchCustomers(e.target.value); }} placeholder="Search customer..." style={{ width: "100%", padding: "6px 8px 6px 28px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 }} />
          </div>
          <button onClick={() => {}} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "6px 10px", background: "white", cursor: "pointer" }}><QrCode size={16} /></button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ background: "white", borderRadius: 8, marginTop: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", overflow: "hidden" }}>
            <button onClick={() => { setSelectedCustomer(null); setSearchQ(""); setSearchResults([]); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #eee", background: "white", cursor: "pointer", fontSize: 13, opacity: 0.6 }}>Walk-in (No Customer)</button>
            {searchResults.map(c => (
              <button key={c.id} onClick={() => { setSelectedCustomer(c); setSearchQ(c.display_name); setSearchResults([]); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #eee", background: "white", cursor: "pointer", fontSize: 13 }}>
                {c.display_name} · {c.phone_number}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Categories */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, flexShrink: 0 }}>
        {categories.map(c => (
          <button key={c.id} onClick={() => setActiveCat(c.id)} style={{ padding: "6px 14px", borderRadius: 20, border: activeCat === c.id ? "2px solid var(--brand-primary)" : "1px solid #ddd", background: activeCat === c.id ? "rgba(59,74,26,0.08)" : "white", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>{c.category_name}</button>
        ))}
      </div>

      {/* Menu Items Grid */}
      <div style={{ flex: 1, overflow: "auto", paddingBottom: cart.length > 0 ? 120 : 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {filteredItems.map(item => (
            <button key={item.id} onClick={() => addToCart(item)} style={{ padding: "12px", borderRadius: 12, border: "1px solid #eee", background: "white", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{item.item_name}</span>
              <span style={{ fontSize: 12, color: "var(--brand-primary)" }}>RM {Number(item.price).toFixed(2)}</span>
            </button>
          ))}
          {filteredItems.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 20, opacity: 0.5 }}>No items in this category</div>}
        </div>
      </div>

      {/* Cart Panel */}
      {cart.length > 0 && (
        <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "2px solid #eee", padding: "12px", flexShrink: 0 }}>
          {cart.map(c => (
            <div key={c.menu_item_id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
              <button onClick={() => updateQty(c.menu_item_id, -1)} style={{ border: "1px solid #ddd", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "white", cursor: "pointer" }}><Minus size={14} /></button>
              <span style={{ minWidth: 24, textAlign: "center", fontSize: 14, fontWeight: 600 }}>{c.qty}</span>
              <button onClick={() => updateQty(c.menu_item_id, 1)} style={{ border: "1px solid #ddd", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "white", cursor: "pointer" }}><Plus size={14} /></button>
              <span style={{ minWidth: 60, textAlign: "right", fontSize: 13, fontWeight: 600 }}>RM {(c.price * c.qty).toFixed(2)}</span>
              <button onClick={() => removeFromCart(c.menu_item_id)} style={{ border: "none", background: "none", color: "#E53E3E", cursor: "pointer", padding: 4 }}><Trash2 size={14} /></button>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid #eee" }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>RM {total.toFixed(2)}</span>
            <button onClick={() => setState("payment")} style={{ padding: "10px 24px", borderRadius: 12, background: "var(--brand-primary)", color: "white", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              <CreditCard size={16} style={{ marginRight: 6 }} />Charge
            </button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {state === "payment" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "white", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 500, margin: "0 auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Payment</h3>
              <button onClick={() => setState("menu")} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>RM {total.toFixed(2)}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["cash", "card", "qr"].map(m => (
                <button key={m} onClick={() => setPaymentMethod(m)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: paymentMethod === m ? "2px solid var(--brand-primary)" : "1px solid #ddd", background: paymentMethod === m ? "rgba(59,74,26,0.08)" : "white", cursor: "pointer", fontSize: 13, textTransform: "capitalize" }}>{m}</button>
              ))}
            </div>
            {paymentMethod === "cash" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, opacity: 0.6 }}>Amount Tendered</label>
                <input type="number" value={amountTendered} onChange={e => setAmountTendered(e.target.value)} placeholder={`RM ${total.toFixed(2)}`} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 20, fontWeight: 700, marginTop: 4 }} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {[total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                    <button key={v} onClick={() => setAmountTendered(String(v))} style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer", fontSize: 12 }}>RM {v.toFixed(0)}</button>
                  ))}
                </div>
                {amountTendered && parseFloat(amountTendered) >= total && (
                  <div style={{ marginTop: 8, fontSize: 14, color: "var(--brand-primary)", fontWeight: 600 }}>Change: RM {(parseFloat(amountTendered) - total).toFixed(2)}</div>
                )}
              </div>
            )}
            {msg && <div style={{ color: "#E53E3E", fontSize: 12, marginBottom: 8 }}>{msg}</div>}
            <button onClick={handleCheckout} disabled={saving} style={{ width: "100%", padding: "14px", borderRadius: 12, background: saving ? "#ccc" : "var(--brand-primary)", color: "white", border: "none", fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Processing..." : `Confirm Payment — RM ${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
