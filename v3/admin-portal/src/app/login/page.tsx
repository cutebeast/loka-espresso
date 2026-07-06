"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminLogin } from "@/lib/api";
import { Store, Lock, Mail } from "lucide-react";
import { useBrand } from "@/components/BrandProvider";
import { useTranslation } from "@/lib/i18n";
import { ROUTES } from "@/lib/constants";
import LanguageSelector from "@/components/LanguageSelector";

export default function LoginPage() {
  const router = useRouter();
  const { brandName } = useBrand();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminLogin(email, password);
      router.push(ROUTES.HOME);
    } catch (err: any) {
      setError(err.message || t("admin.login.invalidCredentials"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon"><Store size={28} /></div>
          <div className="login-brand-name">{brandName}</div>
          <div className="login-brand-sub">{t("admin.app.adminPortal")}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LanguageSelector />
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label><Mail size={15} /> {t("admin.login.email")}</label>
            <input
              type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t("admin.login.emailPlaceholder")}
            />
          </div>
          <div className="login-field">
            <label><Lock size={15} /> {t("admin.login.password")}</label>
            <input
              type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t("admin.login.passwordPlaceholder")}
            />
          </div>
          <button type="submit" disabled={loading} className="login-submit">
            {loading ? t("admin.login.signingIn") : t("admin.login.signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}
