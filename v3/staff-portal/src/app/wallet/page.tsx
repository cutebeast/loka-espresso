"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, QrCode, ArrowLeft, Wallet } from "lucide-react";

interface Customer { id: number; display_name: string; phone_number: string; wallet_balance?: number; loyalty_tier?: string; }

export default function WalletPage() {
  const router = useRouter();
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    try {
      const r = await fetch(`/api/v1/staff/customers/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setResults((d.data?.items || d.items || []).slice(0, 5));
    } catch { setResults([]); }
  }, [token]);

  const verifyPin = async (): Promise<boolean> => {
    try {
      const r = await fetch("/api/v1/staff/auth/verify-pin", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json();
      return (d.data?.valid || d.valid) === true;
    } catch { return false; }
  };

  const handleTopUp = async () => {
    if (!selected || !amount || parseFloat(amount) <= 0) return;
    setSaving(true);
    try {
      const valid = await verifyPin();
      if (!valid) { setMsg("Invalid PIN"); setSaving(false); return; }
      const r = await fetch("/api/v1/admin/wallets/topup", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customer_id: selected.id, amount: parseFloat(amount), reason: "Staff top-up" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Failed");
      setMsg(`✅ Top-up successful! New balance: RM ${d.data?.new_balance || "—"}`);
      setAmount(""); setPin(""); setShowPin(false);
    } catch (e: any) { setMsg(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 16, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.push("/")} style={{ border: "none", background: "none", cursor: "pointer" }}><ArrowLeft size={18} /></button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Wallet Top-Up</h2>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 8, top: 9, opacity: 0.4 }} />
          <input value={searchQ} onChange={e => { setSearchQ(e.target.value); search(e.target.value); }} placeholder="Search customer..." style={{ width: "100%", padding: "8px 8px 8px 28px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }} />
        </div>
        <button style={{ border: "1px solid #ddd", borderRadius: 10, padding: "8px 12px", background: "white", cursor: "pointer" }}><QrCode size={18} /></button>
      </div>
      {results.map(c => (
        <button key={c.id} onClick={() => { setSelected(c); setSearchQ(c.display_name); setResults([]); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "1px solid #eee", borderRadius: 10, marginBottom: 4, background: selected?.id === c.id ? "rgba(59,74,26,0.08)" : "white", cursor: "pointer", fontSize: 13 }}>
          {c.display_name} · {c.phone_number}
        </button>
      ))}

      {selected && (
        <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: "white", border: "1px solid #eee" }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{selected.display_name}</span>
            {selected.loyalty_tier && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "var(--brand-gold)", color: "#1E1B18" }}>{selected.loyalty_tier}</span>}
          </div>
          <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>Current Balance: RM {(selected.wallet_balance || 0).toFixed(2)}</div>
          <label style={{ fontSize: 12, opacity: 0.6 }}>Top-Up Amount</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="RM 20.00" style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 20, fontWeight: 700, marginTop: 4, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[20, 50, 100].map(v => (
              <button key={v} onClick={() => setAmount(String(v))} style={{ flex: 1, padding: "8px", borderRadius: 8, border: amount === String(v) ? "2px solid var(--brand-primary)" : "1px solid #ddd", background: amount === String(v) ? "rgba(59,74,26,0.08)" : "white", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>RM {v}</button>
            ))}
          </div>
          {!showPin ? (
            <button onClick={() => setShowPin(true)} disabled={!amount || parseFloat(amount) <= 0} style={{ width: "100%", padding: "12px", borderRadius: 10, background: (!amount || parseFloat(amount) <= 0) ? "#ccc" : "var(--brand-primary)", color: "white", border: "none", fontSize: 15, fontWeight: 700, cursor: (!amount || parseFloat(amount) <= 0) ? "not-allowed" : "pointer" }}>🔒 Confirm with PIN</button>
          ) : (
            <div>
              <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter 4-digit PIN" maxLength={6} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #ddd", fontSize: 16, textAlign: "center", marginBottom: 8 }} autoFocus />
              <button onClick={handleTopUp} disabled={saving || pin.length < 4} style={{ width: "100%", padding: "12px", borderRadius: 10, background: (saving || pin.length < 4) ? "#ccc" : "var(--brand-primary)", color: "white", border: "none", fontSize: 15, fontWeight: 700, cursor: (saving || pin.length < 4) ? "not-allowed" : "pointer" }}>{saving ? "Processing..." : "Confirm Top-Up"}</button>
            </div>
          )}
          {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.startsWith("✅") ? "var(--brand-primary)" : "#E53E3E" }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
