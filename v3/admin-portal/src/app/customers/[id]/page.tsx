"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, UserCircle, ShoppingBag, Award, Wallet, Shield, Smartphone, Settings, Gift, Save } from "lucide-react";

const TIERS = ["silver", "gold", "platinum"];

export default function CustomerDetailPage() {
  const p = useParams(); const r = useRouter(); const id = Number(p.id);
  const [c, setC] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("profile");
  const [msg, setMsg] = useState("");

  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ display_name: "", phone_number: "", email_address: "", date_of_birth: "", is_active: true });
  const [saving, setSaving] = useState(false);

  const [pointsAmt, setPointsAmt] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const [walletAmt, setWalletAmt] = useState("");
  const [walletReason, setWalletReason] = useState("");
  const [tierVal, setTierVal] = useState("silver");
  const [tierReason, setTierReason] = useState("");
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [selVoucher, setSelVoucher] = useState("");
  const [voucherReason, setVoucherReason] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const [orders, setOrders] = useState<any>({ items: [], total: 0, page: 1, total_pages: 0 });
  const [loyalty, setLoyalty] = useState<any>({ items: [], total: 0, page: 1, total_pages: 0 });
  const [walletTx, setWalletTx] = useState<any>({ items: [], total: 0, page: 1, total_pages: 0 });
  const [rewardsVouchers, setRewardsVouchers] = useState<any>({ rewards: [], vouchers: [] });

  const load = useCallback(async () => {
    try { setC(await api.get<any>(`/admin/customers/${id}`)); } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    load();
    api.get<any>("/admin/vouchers?is_active=true&per_page=100").then(d => setVouchers(Array.isArray(d)?d:(d.items||[]))).catch(() => { /* ignore voucher preload errors */ });
  }, [id, load]);

  useEffect(() => {
    if (c) { setForm({ display_name: c.display_name || "", phone_number: c.phone_number || "", email_address: c.email_address || "", date_of_birth: c.date_of_birth || "", is_active: c.is_active }); }
  }, [c]);

  const fetchTab = useCallback(async (t: string, pg: number = 1) => {
    const SIZE = 10;
    if (t === "orders") {
      const d = await api.getRaw<any>(`/admin/customers/${id}/orders?page=${pg}&page_size=${SIZE}`);
      setOrders(d || { items: [], total: 0, page: 1, total_pages: 0 });
    } else if (t === "loyalty") {
      const d = await api.getRaw<any>(`/admin/customers/${id}/loyalty-history?page=${pg}&page_size=${SIZE}`);
      setLoyalty(d || { items: [], total: 0, page: 1, total_pages: 0 });
    } else if (t === "wallet") {
      const d = await api.getRaw<any>(`/admin/customers/${id}/wallet-history?page=${pg}&page_size=${SIZE}`);
      setWalletTx(d || { items: [], total: 0, page: 1, total_pages: 0 });
    } else if (t === "vouchers") {
      const d = await api.getRaw<any>(`/admin/customers/${id}/wallet`);
      setRewardsVouchers(d || { rewards: [], vouchers: [] });
    }
  }, [id]);

  useEffect(() => { fetchTab(tab); }, [tab, fetchTab]);

  const handleSave = async () => { setSaving(true); setMsg("");
    try { await api.patch(`/admin/customers/${id}`, form); setMsg("Saved"); setEdit(false); load(); } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const doAction = async (action: string, data: any) => {
    setActionLoading(action); setMsg("");
    try {
      let res: any;
      if (action === "points") {
        res = await api.post(`/admin/customers/${id}/adjust-points`, data);
        if (res.new_balance) setC((prev: any) => ({ ...prev, loyalty: { ...prev.loyalty, points_balance: res.new_balance } }));
      } else if (action === "voucher") {
        res = await api.post(`/admin/customers/${id}/award-voucher`, { voucher_id: Number(data.voucher_id), reason: data.reason });
      } else if (action === "tier") {
        res = await api.post(`/admin/customers/${id}/set-tier`, data);
      } else if (action === "approve") {
        res = await api.post(`/admin/customers/${id}/approve-profile`, {});
        load();
      } else if (action === "wallet") {
        const amt = parseFloat(data.amount);
        if (amt > 0) res = await api.post("/admin/wallets/topup", { user_id: id, amount: amt, reason: data.reason });
        else res = await api.post("/admin/wallets/deduct", { user_id: id, amount: Math.abs(amt), reason: data.reason });
      }
      setMsg(res?.message || "Done");
      if (action !== "approve") fetchTab(tab);
    } catch (e: any) { setMsg(e.message); }
    finally { setActionLoading(""); }
  };

  const fmt = (v: number) => `RM ${Number(v || 0).toFixed(2)}`;
  const dt = (s: string | null) => s ? new Date(s).toLocaleDateString("en-MY") : "—";

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (!c) return <div style={{ padding: 32, color: "var(--color-error)" }}>{error || "Not found"}</div>;

  const tabs = [
    { key: "profile", label: "Profile", icon: UserCircle },
    { key: "manage", label: "Manage", icon: Settings },
    { key: "orders", label: "Orders", icon: ShoppingBag },
    { key: "loyalty", label: "Loyalty", icon: Award },
    { key: "wallet", label: "Wallet", icon: Wallet },
    { key: "vouchers", label: "Rewards", icon: Gift },
    { key: "consents", label: "Consents", icon: Shield },
    { key: "devices", label: "Devices", icon: Smartphone },
  ];

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button type="button" onClick={() => r.push("/customers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{c.display_name || "Unknown"}</h1>
          <p className="page-subtitle" style={{ marginTop: 2 }}>{c.phone_number || "—"} · Joined {dt(c.created_at)} · {c.loyalty?.points_balance||0} pts · {fmt(c.lifetime_value)} LTV</p>
        </div>
        <span className={`badge badge-sm ${c.is_active ? "badge-green" : "badge-gray"}`}>{c.is_active ? "Active" : "Inactive"}</span>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--color-border-light)", paddingBottom: 0, flexWrap: "wrap" }}>
        {tabs.map(t => (
          <button type="button" key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "10px 14px", fontSize: 12, fontWeight: tab === t.key ? 700 : 400, border: "none", borderBottom: tab === t.key ? "3px solid var(--color-primary)" : "3px solid transparent", background: tab === t.key ? "rgba(59,74,26,0.05)" : "transparent", cursor: "pointer", color: tab === t.key ? "var(--color-primary)" : "var(--color-text-muted)", borderRadius: "4px 4px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
            <t.icon size={13}/> {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="card" style={{ padding: 24, maxWidth: 600 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Profile</h3>
            <button type="button" onClick={() => setEdit(!edit)} className="btn btn-sm btn-ghost" style={{ color: "var(--color-info)" }}>{edit ? "Cancel" : "Edit"}</button>
          </div>
          {edit ? (
            <div className="df-grid">
              <div className="df-field"><label className="df-label" htmlFor="cust-edit-name">Name</label><input id="cust-edit-name" value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})}/></div>
              <div className="df-field"><label className="df-label" htmlFor="cust-edit-phone">Phone</label><input id="cust-edit-phone" value={form.phone_number} onChange={e => setForm({...form, phone_number: e.target.value})}/></div>
              <div className="df-field"><label className="df-label" htmlFor="cust-edit-email">Email</label><input id="cust-edit-email" value={form.email_address} onChange={e => setForm({...form, email_address: e.target.value})}/></div>
              <div className="df-field"><label className="df-label" htmlFor="cust-edit-dob">DOB</label><input id="cust-edit-dob" type="date" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})}/></div>
              <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})}/> Active</label></div>
              <div className="df-actions" style={{ gridColumn: "1/-1" }}><button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16}/>{saving?"Saving...":"Save"}</button></div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 13 }}>
              {[["Phone", c.phone_number],["Email", c.email_address||"—"],["DOB", c.date_of_birth||"—"],["Language", c.preferred_language],["Referral", c.referral_code||"—"],["Referrals", c.referral_count],["Orders", c.order_count],["LTV", fmt(c.lifetime_value)]].map(([l,v])=>(
                <div key={l} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--color-border-light)", padding: "4px 0" }}><span style={{ color: "var(--color-text-muted)" }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "manage" && (
        <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 16 }}>
          {!c.phone_verified_at && (
            <div className="card" style={{ padding: 16, borderLeft: "4px solid var(--color-warning, #F59E0B)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><strong>Phone Not Verified</strong><div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Approve to verify and activate</div></div>
                <button type="button" onClick={() => doAction("approve", {})} disabled={!!actionLoading} className="btn btn-sm btn-primary">{actionLoading==="approve"?"...":"Approve"}</button>
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h4 style={{ margin: 0 }}>Award / Deduct Points</h4><span style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>{(c.loyalty?.points_balance||0).toLocaleString("en-MY")} pts</span></div>
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 100 }}><label htmlFor="cust-mgmt-points-amt" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Amount (+/-)</label><input id="cust-mgmt-points-amt" type="number" value={pointsAmt} onChange={e => setPointsAmt(e.target.value)} placeholder="e.g. 100 or -50" style={{ width: "100%" }}/></div>
              <div style={{ flex: 2, minWidth: 150 }}><label htmlFor="cust-mgmt-points-reason" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Reason</label><input id="cust-mgmt-points-reason" value={pointsReason} onChange={e => setPointsReason(e.target.value)} placeholder="e.g. Loyalty bonus" style={{ width: "100%" }}/></div>
              <button type="button" onClick={() => doAction("points", { points: Number(pointsAmt), reason: pointsReason })} disabled={!!actionLoading} className="btn btn-sm btn-primary">{actionLoading==="points"?"...":"Apply"}</button>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h4 style={{ margin: 0 }}>Adjust Wallet Credit</h4><span style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>RM {(c.lifetime_value||0).toFixed(2)}</span></div>
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 100 }}><label htmlFor="cust-mgmt-wallet-amt" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Amount (+/-)</label><input id="cust-mgmt-wallet-amt" type="number" step="0.01" value={walletAmt} onChange={e => setWalletAmt(e.target.value)} placeholder="+/- RM" style={{ width: "100%" }}/></div>
              <div style={{ flex: 2, minWidth: 150 }}><label htmlFor="cust-mgmt-wallet-reason" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Reason</label><input id="cust-mgmt-wallet-reason" value={walletReason} onChange={e => setWalletReason(e.target.value)} placeholder="e.g. Refund" style={{ width: "100%" }}/></div>
              <button type="button" onClick={() => doAction("wallet", { amount: walletAmt, reason: walletReason })} disabled={!!actionLoading} className="btn btn-sm btn-primary">{actionLoading==="wallet"?"...":"Apply"}</button>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h4 style={{ margin: 0 }}>Award Voucher</h4><span style={{ fontSize: 15, color: "var(--color-text-muted)" }}>{(rewardsVouchers.vouchers?.length||0)} active</span></div>
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}><label htmlFor="cust-mgmt-voucher-sel" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Voucher</label><select id="cust-mgmt-voucher-sel" value={selVoucher} onChange={e => setSelVoucher(e.target.value)} style={{ width: "100%" }}><option value="">Select...</option>{vouchers.map((v: any) => <option key={v.id} value={v.id}>{v.display_title || v.voucher_code}</option>)}</select></div>
              <div style={{ flex: 2, minWidth: 150 }}><label htmlFor="cust-mgmt-voucher-reason" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Reason</label><input id="cust-mgmt-voucher-reason" value={voucherReason} onChange={e => setVoucherReason(e.target.value)} placeholder="e.g. Compensation" style={{ width: "100%" }}/></div>
              <button type="button" onClick={() => doAction("voucher", { voucher_id: selVoucher, reason: voucherReason })} disabled={!!actionLoading || !selVoucher} className="btn btn-sm btn-primary">{actionLoading==="voucher"?"...":"Award"}</button>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h4 style={{ margin: 0 }}>Set Tier Override</h4><span style={{ fontSize: 15, color: "var(--color-text-muted)" }}>Current: {(c.loyalty?.current_tier_id) || "None"}</span></div>
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120 }}><label htmlFor="cust-mgmt-tier-sel" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Tier</label><select id="cust-mgmt-tier-sel" value={tierVal} onChange={e => setTierVal(e.target.value)} style={{ width: "100%" }}>{TIERS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div style={{ flex: 2, minWidth: 150 }}><label htmlFor="cust-mgmt-tier-reason" style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Reason</label><input id="cust-mgmt-tier-reason" value={tierReason} onChange={e => setTierReason(e.target.value)} placeholder="e.g. VIP upgrade" style={{ width: "100%" }}/></div>
              <button type="button" onClick={() => doAction("tier", { tier: tierVal, reason: tierReason })} disabled={!!actionLoading} className="btn btn-sm btn-primary">{actionLoading==="tier"?"...":"Set"}</button>
            </div>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <PaginatedTable data={orders} cols={["Order #","Status","Total","Date"]} render={(o: any) => {
          const sm: Record<string,string> = { pending: "badge-yellow", confirmed: "badge-blue", preparing: "badge-yellow", completed: "badge-green", cancelled: "badge-red" };
          return <><td style={{ fontSize: 11 }} className="font-mono">{o.order_number}</td><td><span className={`badge badge-sm ${sm[o.status] || "badge-gray"}`}>{o.status?.replace(/_/g," ")}</span></td><td style={{ textAlign: "right" }}>{fmt(o.total_amount)}</td><td style={{ fontSize: 12 }}>{dt(o.created_at)}</td></>;
        }} onChange={(p: number) => fetchTab("orders", p)} />
      )}

      {tab === "loyalty" && (
        <PaginatedTable data={loyalty} cols={["Event","Delta","Balance","Date"]} render={(e: any) => (
          <><td>{e.event_type?.replace(/_/g," ")}</td><td style={{ fontWeight: 600, color: e.points_delta >= 0 ? "var(--color-success)" : "var(--color-error)" }}>{e.points_delta > 0 ? `+${e.points_delta}` : e.points_delta}</td><td>{e.running_balance}</td><td style={{ fontSize: 12 }}>{dt(e.created_at)}</td></>
        )} onChange={(p: number) => fetchTab("loyalty", p)} />
      )}

      {tab === "wallet" && (
        <PaginatedTable data={walletTx} cols={["Type","Amount","Balance","Date"]} render={(t: any) => (
          <><td>{t.transaction_type}</td><td style={{ fontWeight: 600, color: t.amount >= 0 ? "var(--color-success)" : "var(--color-error)" }}>{t.amount > 0 ? `+${t.amount}` : t.amount}</td><td>{Number(t.running_balance).toFixed(2)}</td><td style={{ fontSize: 12 }}>{dt(t.created_at)}</td></>
        )} onChange={(p: number) => fetchTab("wallet", p)} />
      )}

      {tab === "vouchers" && (<>
        <h4 style={{ marginTop: 0 }}>Active Rewards ({rewardsVouchers.rewards?.length||0})</h4>
        <div className="table-container" style={{ marginBottom: 20 }}><table className="data-table"><thead><tr><th>Code</th><th>Status</th><th>Points</th><th>Expires</th></tr></thead><tbody>
          {(rewardsVouchers.rewards||[]).length === 0 ? <tr><td colSpan={4} className="data-table-empty">None</td></tr>
          : rewardsVouchers.rewards.map((r: any) => (<tr key={r.id}><td style={{ fontSize: 11 }} className="font-mono">{r.redemption_code}</td><td><span className="badge badge-sm badge-blue">{r.status}</span></td><td>{r.points_spent} pts</td><td style={{ fontSize: 12 }}>{dt(r.expires_at)}</td></tr>))}
        </tbody></table></div>
        <h4>Active Vouchers ({rewardsVouchers.vouchers?.length||0})</h4>
        <div className="table-container"><table className="data-table"><thead><tr><th>Code</th><th>Title</th><th>Status</th><th>Expires</th></tr></thead><tbody>
          {(rewardsVouchers.vouchers||[]).length === 0 ? <tr><td colSpan={4} className="data-table-empty">None</td></tr>
          : rewardsVouchers.vouchers.map((v: any) => (<tr key={v.id}><td style={{ fontSize: 11 }} className="font-mono">{v.redemption_code}</td><td>{v.voucher_title || v.voucher_code}</td><td><span className="badge badge-sm badge-blue">{v.status}</span></td><td style={{ fontSize: 12 }}>{dt(v.expires_at)}</td></tr>))}
        </tbody></table></div>
      </>)}

      {tab === "consents" && (
        <div className="table-container"><table className="data-table"><thead><tr><th>Type</th><th style={{ width: 90 }}>Status</th><th>Granted</th></tr></thead><tbody>
          {(c.consents||[]).length === 0 ? <tr><td colSpan={3} className="data-table-empty">None</td></tr>
          : c.consents.map((x: any) => (<tr key={x.id}><td style={{ textTransform: "capitalize" }}>{x.consent_type?.replace(/_/g," ")}</td><td><span className={`badge badge-sm ${x.status==="granted"?"badge-green":"badge-red"}`}>{x.status}</span></td><td style={{ fontSize: 12 }}>{x.granted_at ? new Date(x.granted_at).toLocaleString("en-MY") : "—"}</td></tr>))}
        </tbody></table></div>
      )}

      {tab === "devices" && (
        <div className="table-container"><table className="data-table"><thead><tr><th>Platform</th><th>Model</th><th style={{ width: 80 }}>Status</th><th>Last Seen</th></tr></thead><tbody>
          {(c.devices||[]).length === 0 ? <tr><td colSpan={4} className="data-table-empty">None</td></tr>
          : c.devices.map((d: any) => (<tr key={d.id}><td style={{ textTransform: "capitalize" }}>{d.platform}</td><td style={{ fontSize: 12 }}>{d.device_model||"—"}</td><td><span className={`badge badge-sm ${d.is_active?"badge-green":"badge-gray"}`}>{d.is_active?"Active":"Inactive"}</span></td><td style={{ fontSize: 12 }}>{d.last_seen_at?new Date(d.last_seen_at).toLocaleString("en-MY"):"—"}</td></tr>))}
        </tbody></table></div>
      )}
    </div>
  );
}

function PaginatedTable({ data, cols, render, onChange }: { data: any; cols: string[]; render: (item: any) => React.ReactNode; onChange: (p: number) => void }) {
  const items = data.items || [];
  return <div>
    <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} of {data.total||0}</span></div>
    <div className="table-container"><table className="data-table">
      <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{items.length === 0 ? <tr><td colSpan={cols.length} className="data-table-empty">No data</td></tr> : items.map((item: any) => <tr key={item.id}>{render(item)}</tr>)}</tbody>
    </table></div>
    {(data.total_pages||0) > 1 && (
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
        <button type="button" className="btn btn-sm btn-ghost" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>← Prev</button>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{data.page}/{data.total_pages}</span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={data.page >= data.total_pages} onClick={() => onChange(data.page + 1)}>Next →</button>
      </div>
    )}
  </div>;
}
