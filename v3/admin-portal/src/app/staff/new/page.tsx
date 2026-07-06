"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Copy, Check } from "lucide-react";
interface Store {
  id: number;
  store_name: string;
}
export default function NewStaffPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    display_name: "",
    phone_number: "",
    role: "server"
  });
  const [created, setCreated] = useState<{
    email: string;
    password: string;
    pin: string;
    display_name: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => {
      const list = d.items || [];
      setStores(list);
      if (list.length > 0) setStoreId(String(list[0].id));
    }).catch(e => {
      console.error('stores:', e);
    });
  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post<any>("/admin/staff", {
        email: form.email,
        password: form.password,
        display_name: form.display_name,
        phone_number: form.phone_number,
        role: form.role,
        store_id: Number(storeId),
        pin: "000000"
      });
      setCreated({
        email: form.email,
        password: form.password,
        pin: "000000",
        display_name: form.display_name
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const handleCopy = () => {
    if (!created) return;
    const text = `Staff: ${created.display_name}\nEmail: ${created.email}\nPassword: ${created.password}\nPIN: ${created.pin}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  if (created) {
    return <div style={{
      padding: 32,
      maxWidth: 500,
      margin: "0 auto",
      textAlign: "center"
    }}>
        <div style={{
        fontSize: 48,
        marginBottom: 12
      }}>✅</div>
        <h1 className="page-title" style={{
        marginBottom: 8
      }}>{t("staff_new.staff_created")}</h1>
        <p style={{
        fontSize: 13,
        opacity: 0.6,
        marginBottom: 20
      }}>{t("staff_new.share_these_credentials_with_the_staff")}</p>
        <div className="card" style={{
        padding: 20,
        textAlign: "left",
        fontFamily: "monospace",
        fontSize: 13,
        lineHeight: 2
      }}>
          <div><strong>{t("staff_new.name")}</strong> {created.display_name}</div>
          <div><strong>{t("staff_new.email")}</strong> {created.email}</div>
          <div><strong>{t("staff_new.password")}</strong> {created.password}</div>
          <div><strong>{t("staff_new.pin")}</strong> {created.pin}</div>
        </div>
        <div className="df-actions" style={{
        marginTop: 16
      }}>
          <button onClick={handleCopy} className="btn btn-primary" aria-label={t("staff_new.copy")}><Copy size={14} /> {copied ? "Copied!" : "Copy Credentials"}</button>
          <button onClick={() => router.push("/staff")} className="btn btn-ghost"><Check size={14} />{t("staff_new.done")}</button>
        </div>
      </div>;
  }
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/staff")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("staff_new.new_staff")}</h1></div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}
      <div className="card" style={{
      padding: 24,
      maxWidth: 500
    }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field"><label className="df-label">{t("staff_new.display_name")}</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm({
              ...form,
              display_name: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("staff_new.email_2")}</label><input type="email" className="w-full border rounded px-3 py-2 text-sm" value={form.email} onChange={e => setForm({
              ...form,
              email: e.target.value
            })} placeholder={t("staff_new.staff_example_com")} /></div>
          <div className="df-field"><label className="df-label">{t("staff_new.password_2")}</label><input required type="text" className="w-full border rounded px-3 py-2 text-sm" value={form.password} onChange={e => setForm({
              ...form,
              password: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("staff_new.role")}</label><select className="w-full border rounded px-3 py-2 text-sm" value={form.role} onChange={e => setForm({
              ...form,
              role: e.target.value
            })}><option value="server">{t("staff_new.server")}</option><option value="cashier">{t("staff_new.cashier")}</option><option value="kitchen_staff">{t("staff_new.kitchen_staff")}</option><option value="shift_supervisor">{t("staff_new.shift_supervisor")}</option><option value="store_manager">{t("staff_new.store_manager")}</option></select></div>
          <div className="df-field"><label className="df-label">{t("staff_new.phone")}</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.phone_number} onChange={e => setForm({
              ...form,
              phone_number: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("staff_new.store")}</label><select className="w-full border rounded px-3 py-2 text-sm" value={storeId} onChange={e => setStoreId(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}</select></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
            <div style={{
              fontSize: 11,
              opacity: 0.5
            }}>{t("staff_new.default_pin")}<strong>000000</strong>{t("staff_new.staff_can_change_after_login")}</div>
          </div>
        </div><div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/staff")} className="btn btn-ghost">{t("staff_new.cancel")}</button><button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create Staff"}</button></div></form>
      </div>
    </div>;
}