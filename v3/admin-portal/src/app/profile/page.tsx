"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Shield, Mail, Lock, KeyRound } from "lucide-react";
interface AdminProfile {
  id: number;
  email: string;
  display_name: string;
  is_active: boolean;
  mfa_enabled: boolean;
  roles: string[];
  store_ids: number[];
}
export default function AdminProfilePage() {
  const {
    t
  } = useTranslation();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    api.get<AdminProfile>("/admin/auth/me").then(d => {
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
  const handlePasswordChange = async () => {
    if (!currentPw) {
      setMsg("Current password is required");
      setIsError(true);
      return;
    }
    if (!newPw || newPw.length < 8) {
      setMsg("Password must be at least 8 characters");
      setIsError(true);
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/auth/change-password", {
        current_password: currentPw,
        password: newPw
      });
      setMsg("Password updated successfully");
      setIsError(false);
      setShowPw(false);
      setCurrentPw("");
      setNewPw("");
    } catch (e: unknown) {
      console.error("Password change failed:", e);
      setMsg(parseApiError(e, "Failed to update password"));
      setIsError(true);
    } finally {
      setSaving(false);
    }
  };
  const roleLabels: Record<string, string> = {
    system_admin: "System Admin",
    regional_manager: "Regional Manager",
    store_manager: "Store Manager",
    readonly_analyst: "Read-only Analyst"
  };
  if (loading) {
    return <div style={{
      padding: 32
    }}>
        <h1 className="page-title">{t("profile.my_profile")}</h1>
        <p>{t("profile.loading")}</p>
      </div>;
  }
  if (!profile) {
    return <div style={{
      padding: 32
    }}>
        <h1 className="page-title">{t("profile.my_profile_2")}</h1>
        <div className="alert alert-error">{t("profile.failed_to_load_profile")}</div>
      </div>;
  }
  return <div style={{
    padding: 32
  }}>
      <h1 className="page-title">{t("profile.my_profile_3")}</h1>
      <p className="page-subtitle" style={{
      marginBottom: 24
    }}>{t("profile.view_your_account_details_and_update")}</p>

      {msg && <div className={`alert ${isError ? "alert-error" : "alert-success"}`}>{msg}</div>}

      {/* Profile Card */}
      <div className="card" style={{
      maxWidth: 560,
      marginBottom: 24
    }}>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 20
      }}>
          <div style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--color-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 22,
          fontWeight: 700,
          flexShrink: 0
        }}>
            {profile.display_name?.charAt(0)?.toUpperCase() || "A"}
          </div>
          <div>
            <h2 style={{
            margin: 0,
            fontSize: 20
          }}>{profile.display_name}</h2>
            <p style={{
            margin: "4px 0 0",
            color: "var(--color-text-muted)",
            fontSize: 14
          }}>{profile.email}</p>
          </div>
        </div>

        <table className="data-table">
          <tbody>
            <tr>
              <td style={{
              fontWeight: 600,
              width: 140
            }}><Mail size={14} style={{
                marginRight: 6
              }} />{t("profile.email")}</td>
              <td>{profile.email}</td>
            </tr>
            <tr>
              <td style={{
              fontWeight: 600
            }}><Shield size={14} style={{
                marginRight: 6
              }} />{t("profile.roles")}</td>
              <td>{profile.roles.map(r => roleLabels[r] || r).join(", ") || "None"}</td>
            </tr>
            <tr>
              <td style={{
              fontWeight: 600
            }}>{t("profile.status")}</td>
              <td>
                <span className={`badge ${profile.is_active ? "badge-success" : "badge-error"}`}>
                  {profile.is_active ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
            <tr>
              <td style={{
              fontWeight: 600
            }}>{t("profile.mfa")}</td>
              <td>
                <span className={`badge ${profile.mfa_enabled ? "badge-success" : "badge-muted"}`}>
                  {profile.mfa_enabled ? "Enabled" : "Disabled"}
                </span>
              </td>
            </tr>
            {profile.store_ids.length > 0 && <tr>
                <td style={{
              fontWeight: 600
            }}>{t("profile.store_access")}</td>
                <td>{profile.store_ids.map(String).join(", ")}</td>
              </tr>}
          </tbody>
        </table>
      </div>

      {/* Password Change */}
      <div className="card" style={{
      maxWidth: 560
    }}>
        <h3 style={{
        margin: "0 0 16px",
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <KeyRound size={18} />{t("profile.change_password")}</h3>
        {showPw ? <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}>
            <div className="df-field">
              <label className="form-label">{t("profile.current_password")}</label>
              <input type="password" className="form-input" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder={t("profile.enter_current_password")} autoComplete="current-password" />
            </div>
            <div className="df-field">
              <label className="form-label">{t("profile.new_password_min_8_characters")}</label>
              <input type="password" className="form-input" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder={t("profile.enter_new_password")} autoComplete="new-password" />
            </div>
            <div style={{
          display: "flex",
          gap: 8
        }}>
              <button type="button" className="btn btn-primary" onClick={handlePasswordChange} disabled={saving}>
                <Lock size={14} /> {saving ? "Updating..." : "Update Password"}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => {
            setShowPw(false);
            setCurrentPw("");
            setNewPw("");
          }}>{t("profile.cancel")}</button>
            </div>
          </div> : <button type="button" className="btn btn-outline" onClick={() => setShowPw(true)}>
            <Lock size={14} />{t("profile.change_password_2")}</button>}
      </div>
    </div>;
}