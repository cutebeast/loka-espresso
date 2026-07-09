"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { api, staffLogout } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import Alert from "@/components/Alert";

interface MustChangePinScreenProps {
  onPinChanged: () => void;
}

export default function MustChangePinScreen({ onPinChanged }: MustChangePinScreenProps) {
  const { t } = useTranslation();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(newPin)) {
      setError(t("must_change_pin.err_6_digits"));
      return;
    }
    if (newPin === "000000") {
      setError(t("must_change_pin.err_no_000000"));
      return;
    }
    if (newPin === currentPin) {
      setError(t("must_change_pin.err_must_differ"));
      return;
    }
    if (newPin !== confirmPin) {
      setError(t("must_change_pin.err_no_match"));
      return;
    }

    setLoading(true);
    try {
      await api.post("/staff/auth/change-pin", {
        current_pin: currentPin,
        new_pin: newPin,
      });
      onPinChanged();
    } catch (err: unknown) {
      setError(parseApiError(err, t("must_change_pin.err_failed")));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await staffLogout();
    window.location.replace("/login");
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: 24,
      background: "var(--color-bg-page)",
    }}>
      <div className="card" style={{
        maxWidth: 420,
        width: "100%",
        padding: 32,
        textAlign: "center",
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--color-bg-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
        }}>
          <Lock size={28} style={{ color: "var(--color-primary)" }} />
        </div>
        <h2 style={{
          fontSize: 20,
          fontWeight: 800,
          margin: "0 0 8px",
        }}>{t("must_change_pin.title")}</h2>
        <p style={{
          fontSize: 14,
          color: "var(--color-text-muted)",
          margin: "0 0 24px",
        }}>
          {t("must_change_pin.description")}
        </p>

        {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="form-label">{t("must_change_pin.current_pin")}</label>
            <input
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value)}
              placeholder={t("must_change_pin.placeholder_current")}
              maxLength={6}
              className="form-input"
              style={{ textAlign: "center", fontSize: 20, letterSpacing: 8 }}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("must_change_pin.new_pin")}</label>
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              placeholder={t("must_change_pin.placeholder_new")}
              maxLength={6}
              className="form-input"
              style={{ textAlign: "center", fontSize: 20, letterSpacing: 8 }}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t("must_change_pin.confirm_pin")}</label>
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
              placeholder={t("must_change_pin.placeholder_confirm")}
              maxLength={6}
              className="form-input"
              style={{ textAlign: "center", fontSize: 20, letterSpacing: 8 }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !currentPin || !newPin || !confirmPin}
            className="btn btn-primary w-full"
            style={{ padding: "14px", fontSize: 16 }}
          >
            {loading ? t("must_change_pin.changing") : t("must_change_pin.change")}
          </button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          className="btn btn-ghost"
          style={{ marginTop: 16, width: "100%" }}
        >
          {t("must_change_pin.back_to_login")}
        </button>
      </div>
    </div>
  );
}
