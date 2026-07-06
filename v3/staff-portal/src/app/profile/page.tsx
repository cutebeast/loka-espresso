"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Card from "@/components/Card";
import SkeletonCard from "@/components/SkeletonCard";
import { Mail, Shield, Store, Lock, KeyRound, AlertCircle } from "lucide-react";
interface StaffProfile {
  roles: string[];
  display_name: string;
  email: string;
  store_id: number;
}
export default function ProfilePage() {
  const {
    t
  } = useTranslation();
  const isAdmin = useIsAdmin();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    api.get<StaffProfile>("/staff/auth/me").then(d => {
      if (mounted) setProfile(d);
    }).catch(e => {
      console.error("Failed to load profile:", e);
      if (mounted) setProfile(null);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const roles = profile?.roles || [];
  const name = profile?.display_name || (typeof window !== "undefined" ? localStorage.getItem("staffName") || "Staff Member" : "Staff Member");
  const email = profile?.email || (typeof window !== "undefined" ? localStorage.getItem("staffEmail") || "" : "");
  const storeId = profile?.store_id;
  const handlePasswordChange = async () => {
    if (!currentPw) {
      setMsg("Current password is required");
      setIsError(true);
      return;
    }
    if (!newPw || newPw.length < 6) {
      setMsg("Password must be at least 6 characters");
      setIsError(true);
      return;
    }
    setSaving(true);
    try {
      await api.post("/staff/auth/change-password", {
        current_password: currentPw,
        new_password: newPw
      });
      setMsg("Password updated");
      setIsError(false);
      setShowPw(false);
      setCurrentPw("");
      setNewPw("");
    } catch (e: unknown) {
      console.error("Password change failed:", e);
      setMsg(parseApiError(e, "Failed"));
      setIsError(true);
    } finally {
      setSaving(false);
    }
  };
  const handlePinChange = async () => {
    if (!currentPin || currentPin.length < 4) {
      setMsg("Current PIN is required");
      setIsError(true);
      return;
    }
    if (!newPin || newPin.length < 4) {
      setMsg("PIN must be at least 4 digits");
      setIsError(true);
      return;
    }
    setSaving(true);
    try {
      await api.post("/staff/auth/change-pin", {
        current_pin: currentPin,
        new_pin: newPin
      });
      setMsg("PIN updated");
      setIsError(false);
      setShowPin(false);
      setCurrentPin("");
      setNewPin("");
    } catch (e: unknown) {
      console.error("PIN change failed:", e);
      setMsg(parseApiError(e, "Failed"));
      setIsError(true);
    } finally {
      setSaving(false);
    }
  };
  if (loading) {
    return <div style={{
      padding: 24,
      maxWidth: 600,
      margin: "0 auto"
    }}>
        <PageHeader title={t("profile.my_profile")} />
        <SkeletonCard count={3} />
      </div>;
  }
  return <div style={{
    padding: 24,
    maxWidth: 600,
    margin: "0 auto"
  }}>
      <PageHeader title={t("profile.my_profile_2")} />

      {msg && <Alert variant={isError ? "error" : "success"} onDismiss={() => setMsg("")} autoDismiss={msg.includes("Failed") ? undefined : 3000}>
          {msg}
        </Alert>}

      {/* Profile Card */}
      <Card style={{
      marginBottom: 16
    }}>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 20
      }}>
          <div style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--color-bg-dark)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          fontWeight: 700
        }}>
            {name ? name.charAt(0).toUpperCase() : "S"}
          </div>
          <div>
            <h3 style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700
          }}>{name}</h3>
            <div style={{
            display: "flex",
            gap: 6,
            marginTop: 6,
            flexWrap: "wrap"
          }}>
              {roles.map((r: string) => <span key={r} className="badge badge-sm badge-outline">{r}</span>)}
              {roles.length === 0 && <span className="badge badge-sm badge-outline">{isAdmin ? "Administrator" : "Staff"}</span>}
            </div>
          </div>
        </div>

        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 14
      }}>
          <div className="flex items-center gap-3 text-sm">
            <Mail size={16} style={{
            color: "var(--color-text-muted)"
          }} />
            <span style={{
            color: "var(--color-text-muted)",
            width: 60
          }}>{t("profile.email")}</span>
            <span style={{
            fontWeight: 600
          }}>{email || "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield size={16} style={{
            color: "var(--color-text-muted)"
          }} />
            <span style={{
            color: "var(--color-text-muted)",
            width: 60
          }}>{t("profile.role")}</span>
            <span style={{
            fontWeight: 600
          }}>{roles.length > 0 ? roles.join(", ") : isAdmin ? "Administrator" : "Staff"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Store size={16} style={{
            color: "var(--color-text-muted)"
          }} />
            <span style={{
            color: "var(--color-text-muted)",
            width: 60
          }}>{t("profile.store")}</span>
            <span style={{
            fontWeight: 600
          }}>{storeId ? `Store #${storeId}` : "All Stores"}</span>
          </div>
        </div>
      </Card>

      {/* Security Card */}
      <Card title={t("profile.security")} style={{
      marginBottom: 16
    }}>
        {isAdmin ? <div className="alert alert-warning" style={{
        marginBottom: 0
      }}>
            <div className="flex items-start gap-3">
              <AlertCircle size={18} style={{
            flexShrink: 0,
            marginTop: 2
          }} />
              <span>{t("profile.password_and_pin_management_is_not")}<strong>{t("profile.admin_portal")}</strong>.</span>
            </div>
          </div> : <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
            <div>
              {showPw ? <form onSubmit={e => e.preventDefault()} style={{
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}>
                  <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder={t("profile.current_password")} className="form-input" />
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder={t("profile.new_password_min_6_chars")} className="form-input" />
                  <div className="flex items-center gap-2">
                    <button className="btn btn-primary btn-sm" onClick={handlePasswordChange} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                setShowPw(false);
                setCurrentPw("");
                setNewPw("");
              }}>{t("profile.cancel")}</button>
                  </div>
                </form> : <button className="btn btn-ghost" onClick={() => setShowPw(true)} style={{
            justifyContent: "flex-start"
          }}>
                  <Lock size={16} />{t("profile.change_password")}</button>}
            </div>
            <div>
              {showPin ? <form onSubmit={e => e.preventDefault()} style={{
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}>
                  <input type="password" value={currentPin} onChange={e => setCurrentPin(e.target.value)} placeholder={t("profile.current_pin")} maxLength={6} className="form-input" style={{
              textAlign: "center"
            }} />
                  <input type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder={t("profile.new_pin_min_4_digits")} maxLength={6} className="form-input" style={{
              textAlign: "center"
            }} />
                  <div className="flex items-center gap-2">
                    <button className="btn btn-primary btn-sm" onClick={handlePinChange} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                setShowPin(false);
                setCurrentPin("");
                setNewPin("");
              }}>{t("profile.cancel_2")}</button>
                  </div>
                </form> : <button className="btn btn-ghost" onClick={() => setShowPin(true)} style={{
            justifyContent: "flex-start"
          }}>
                  <KeyRound size={16} />{t("profile.change_pin")}</button>}
            </div>
          </div>}
      </Card>

      <Card title={t("profile.app_info")}>
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 13,
        color: "var(--color-text-muted)"
      }}>
          <p>{t("profile.staff_portal_v3")}</p>
          <p>{t("profile.loka_espresso_fnb_super_app")}</p>
        </div>
      </Card>
    </div>;
}