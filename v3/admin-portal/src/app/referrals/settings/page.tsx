"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";

export default function ReferralSettingsPage() {
  const [points, setPoints] = useState("50");
  const [minOrders, setMinOrders] = useState("1");
  const [minSpend, setMinSpend] = useState("0");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<any[]>("/admin/config").then(d => {
      const map: Record<string, string> = {};
      (Array.isArray(d) ? d : []).forEach((c: any) => { map[c.config_key] = c.config_value; });
      setPoints(map["loyalty.referral_reward_points"] || "50");
      setMinOrders(map["loyalty.referral_min_orders"] || "1");
      setMinSpend(map["loyalty.referral_min_spend"] || "0");
    }).catch(()=>{}).finally(() => setLoading(false));
  }, []);

  const save = async (key: string, val: string) => {
    const qs = new URLSearchParams({ key, value: val });
    await api.put(`/admin/config?${qs.toString()}`);
    setMsg(`${key} updated`);
    setTimeout(() => setMsg(""), 2000);
  };

  return (
    <div style={{padding:32}}>
      <h1 className="page-title">Referral Settings</h1>
      <p className="page-subtitle" style={{marginBottom:24}}>Configure referral rewards and requirements</p>
      {msg && <div className="alert alert-success">{msg}</div>}
      {loading ? <p>Loading...</p> : (
        <div className="card" style={{maxWidth:500}}>
          <table className="data-table"><thead><tr><th>Setting</th><th>Value</th><th></th></tr></thead><tbody>
            <tr>
              <td>Reward Points</td>
              <td><input type="number" defaultValue={points} onBlur={e => save("loyalty.referral_reward_points", e.target.value)} style={{border:"1px solid var(--color-border-light)",borderRadius:"var(--radius-sm)",padding:"4px 8px",fontSize:13,width:80}} /></td>
              <td><button className="btn btn-sm btn-primary"><Save size={12}/> Save</button></td>
            </tr>
            <tr>
              <td>Min Orders to Qualify</td>
              <td><input type="number" defaultValue={minOrders} onBlur={e => save("loyalty.referral_min_orders", e.target.value)} style={{border:"1px solid var(--color-border-light)",borderRadius:"var(--radius-sm)",padding:"4px 8px",fontSize:13,width:80}} /></td>
              <td><button className="btn btn-sm btn-primary"><Save size={12}/> Save</button></td>
            </tr>
            <tr>
              <td>Min Spend to Qualify (RM)</td>
              <td><input type="number" step="0.01" defaultValue={minSpend} onBlur={e => save("loyalty.referral_min_spend", e.target.value)} style={{border:"1px solid var(--color-border-light)",borderRadius:"var(--radius-sm)",padding:"4px 8px",fontSize:13,width:80}} /></td>
              <td><button className="btn btn-sm btn-primary"><Save size={12}/> Save</button></td>
            </tr>
          </tbody></table>
        </div>
      )}
    </div>
  );
}
