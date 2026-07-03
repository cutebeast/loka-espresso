"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";

export default function ReferralSettingsPage() {
  const [points, setPoints] = useState("50");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    api.get<any[]>("/admin/config").then(d => {
      const map: Record<string, string> = {};
      (Array.isArray(d) ? d : []).forEach((c: any) => { map[c.config_key] = c.config_value; });
      setPoints(map["loyalty.referral_reward_points"] || "50");
    }).catch((e)=>{console.error('referral config:',e)}).finally(() => setLoading(false));
  }, []);

  const save = async (key: string, val: string) => {
    setSaving(key);
    setIsError(false);
    try {
      const qs = new URLSearchParams({ key, value: val });
      await api.put(`/admin/config?${qs.toString()}`);
      setMsg(`${key} updated`);
      setIsError(false);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMsg(detail || "Failed to save");
      setIsError(true);
    } finally {
      setSaving(null);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  return (
    <div style={{padding:32}}>
      <h1 className="page-title">Referral Settings</h1>
      <p className="page-subtitle" style={{marginBottom:24}}>Configure referral rewards and requirements</p>
      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{msg}</div>}
      {loading ? <p>Loading...</p> : (
        <div className="card" style={{maxWidth:500}}>
          <table className="data-table"><thead><tr><th>Setting</th><th>Value</th><th></th></tr></thead><tbody>
            <tr>
              <td>Reward Points</td>
              <td><input type="number" value={points} onChange={e => setPoints(e.target.value)} style={{border:"1px solid var(--color-border-light)",borderRadius:"var(--radius-sm)",padding:"4px 8px",fontSize:13,width:80}} /></td>
              <td><button type="button" className="btn btn-sm btn-primary" onClick={() => save("loyalty.referral_reward_points", points)} disabled={saving !== null}><Save size={12}/> Save</button></td>
            </tr>

          </tbody></table>
        </div>
      )}
    </div>
  );
}
