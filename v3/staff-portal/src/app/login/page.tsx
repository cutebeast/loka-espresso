"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Store, Lock, Mail, User, ChevronDown, ChevronUp } from "lucide-react";
import { api, staffLogin, staffLoginByName } from "@/lib/api";
import type { PaginatedResponse } from "@/lib/api";
import LanguageSelector from "@/components/LanguageSelector";
import { useTranslation } from "@/hooks/useTranslation";

interface StoreInfo { id: number; store_name: string; is_active?: boolean; }

function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
  icon,
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  return (
    <div className="form-group login-select-wrap" ref={ref}>
      <label className="form-label flex items-center gap-2">
        {icon} {label}
      </label>
      <button
        type="button"
        className="form-input flex items-center justify-between w-full"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          background: disabled ? "var(--color-bg-muted)" : "white",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span className={value ? "" : "opacity-50"}>{selectedLabel}</span>
        {open ? <ChevronUp size={16} className="opacity-40" /> : <ChevronDown size={16} className="opacity-40" />}
      </button>
      {open && (
        <div className="login-select-dropdown">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`login-select-option ${o.value === value ? "login-select-option-selected" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [mode, setMode] = useState<"email" | "name">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nameList, setNameList] = useState<{ id: number; display_name: string }[]>([]);
  const [namesLoading, setNamesLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const [_attemptCount, setAttemptCount] = useState(0);
  const attemptCountRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    const locale = typeof window !== "undefined" ? localStorage.getItem("locale") || "en" : "en";
    api.get<PaginatedResponse<StoreInfo>>(`/stores?locale=${locale}`)
      .then((d) => {
        const list = Array.isArray(d) ? d : (d?.items || []);
        if (mounted) setStores(list.filter((s: StoreInfo) => s.is_active !== false));
      })
      .catch((err: unknown) => { console.error("Store fetch failed:", err); if (mounted) setStores([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedStore || mode !== "name") return;
    let mounted = true;
    setNamesLoading(true);
    api.get<{ id: number; display_name: string }[]>(`/staff/auth/names?store_id=${selectedStore}`)
      .then((nameData: { id: number; display_name: string }[]) => {
        if (mounted) setNameList(Array.isArray(nameData) ? nameData : []);
      })
      .catch((err: unknown) => { console.error("Staff names fetch failed:", err); if (mounted) setNameList([]); })
      .finally(() => { if (mounted) setNamesLoading(false); });
    return () => { mounted = false; };
  }, [selectedStore, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!selectedStore) { setError(t("login.error_no_store")); setLoading(false); return; }

      const delay = Math.min(3000, attemptCountRef.current * 1000);
      if (delay > 0) {
        setError(t("login.error_too_many").replace("{seconds}", String(Math.ceil(delay / 1000))));
        await new Promise((r) => setTimeout(r, delay));
        setError("");
      }

      if (mode === "name") {
        if (!selectedName) { setError(t("login.error_select_name")); setLoading(false); return; }
        await staffLoginByName(selectedName, pin, Number(selectedStore));
      } else {
        if (!email) { setError(t("login.error_enter_email")); setLoading(false); return; }
        if (!password && !pin) { setError(t("login.error_enter_pin")); setLoading(false); return; }
        await staffLogin(email, password || pin, Number(selectedStore));
      }
      attemptCountRef.current = 0;
      setAttemptCount(0);
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") || "/";
      router.replace(redirect);
    } catch (err: unknown) {
      attemptCountRef.current += 1;
      setAttemptCount((c) => c + 1);
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-brand">
          <div className="login-brand-icon">
            <Store size={28} className="text-white" />
          </div>
          <h1 className="login-brand-title">{t("login.title")}</h1>
          <p className="login-brand-subtitle">{t("login.subtitle")}</p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LanguageSelector />
        </div>

        {/* Store Selection */}
        <CustomSelect
          value={selectedStore}
          onChange={(val) => { setSelectedStore(val); setNameList([]); setSelectedName(""); }}
          options={stores.map((s) => ({ value: String(s.id), label: s.store_name }))}
          placeholder={t("login.store_placeholder")}
          label={t("login.store_label")}
          icon={<Store size={16} className="login-icon-primary" />}
        />

        {/* Mode Toggle */}
        <div className="login-mode-toggle">
          <button
            onClick={() => setMode("email")}
            className={`btn flex-1 justify-center ${mode === "email" ? "btn-primary" : "btn-ghost"}`}
          >
            {t("login.mode_email")}
          </button>
          <button
            onClick={() => setMode("name")}
            className={`btn flex-1 justify-center ${mode === "name" ? "btn-primary" : "btn-ghost"}`}
          >
            {t("login.mode_name")}
          </button>
        </div>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "email" ? (
            <div className="form-group">
              <label className="form-label flex items-center gap-2">
                <Mail size={16} className="login-icon-primary" /> {t("login.email_label")}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t("login.email_placeholder")}
                className="form-input"
              />
            </div>
          ) : (
            <CustomSelect
              value={selectedName}
              onChange={setSelectedName}
              options={nameList.map((n) => ({ value: n.display_name, label: n.display_name }))}
              placeholder={!selectedStore ? t("login.select_store_first") : namesLoading ? t("login.loading_staff") : t("login.name_placeholder")}
              label={t("login.name_label")}
              icon={<User size={16} className="login-icon-primary" />}
              disabled={!selectedStore || nameList.length === 0}
            />
          )}

          <div className="form-group">
            <label className="form-label flex items-center gap-2">
              <Lock size={16} className="login-icon-primary" /> {t("login.pin_label")}
            </label>
            <input
              type="password"
              required
              value={mode === "email" ? password : pin}
              onChange={e => mode === "email" ? setPassword(e.target.value) : setPin(e.target.value)}
              placeholder={t("login.pin_placeholder")}
              maxLength={mode === "email" ? 50 : 6}
              className={`form-input ${mode === "name" ? "login-input-center" : ""}`}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !selectedStore}
            className="btn btn-primary w-full login-submit"
          >
            {loading ? t("login.signing_in") : t("login.signin")}
          </button>
        </form>
      </div>
    </div>
  );
}
