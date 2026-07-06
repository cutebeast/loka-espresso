"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
export default function EditStaffPage() {
  const {
    t
  } = useTranslation();
  const p = useParams();
  const r = useRouter();
  const id = p.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Record<string, any>>({});
  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<any>(`/admin/staff/${id}`);
      setForm({
        display_name: d.display_name || "",
        employee_id: d.employee_id || "",
        role: d.role || "server",
        phone_number: d.phone_number || "",
        is_active: d.is_active
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/staff/${id}`, form);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <div style={{
    padding: 32
  }}>{t("staff_[id].loading")}</div>;
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}><button onClick={() => r.push("/staff")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{
          margin: 0
        }}>{form.display_name || "Staff"}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("staff_[id].edit_staff_details")}</p></div></div>
      {msg && <div className="alert alert-success" style={{
      marginBottom: 12
    }}>{msg}</div>}
      <div className="card" style={{
      padding: 24,
      maxWidth: 720
    }}>
        <div className="df-grid">
          <div className="df-field"><label className="df-label">{t("staff_[id].name")}</label><input required value={form.display_name} onChange={e => setForm({
            ...form,
            display_name: e.target.value
          })} /></div>
          <div className="df-field"><label className="df-label">{t("staff_[id].employee_id")}</label><input required value={form.employee_id} onChange={e => setForm({
            ...form,
            employee_id: e.target.value
          })} /></div>
          <div className="df-field"><label className="df-label">{t("staff_[id].role")}</label><select value={form.role} onChange={e => setForm({
            ...form,
            role: e.target.value
          })}><option value="server">{t("staff_[id].server")}</option><option value="cashier">{t("staff_[id].cashier")}</option><option value="kitchen_staff">{t("staff_[id].kitchen_staff")}</option><option value="shift_supervisor">{t("staff_[id].shift_supervisor")}</option><option value="store_manager">{t("staff_[id].store_manager")}</option></select></div>
          <div className="df-field"><label className="df-label">{t("staff_[id].phone")}</label><input value={form.phone_number} onChange={e => setForm({
            ...form,
            phone_number: e.target.value
          })} /></div>
          <div className="df-field"><label className="df-label" style={{
            display: "flex",
            alignItems: "center",
            gap: 8
          }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
              ...form,
              is_active: e.target.checked
            })} />{t("staff_[id].active")}</label></div>
        </div>
        <div className="df-actions" style={{
        marginTop: 20
      }}><button type="button" onClick={() => r.push("/staff")} className="btn btn-ghost">{t("staff_[id].cancel")}</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button></div>
      </div>
    </div>;
}