"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Store, Lock, Mail, User, ChevronDown, ChevronUp } from "lucide-react";

interface StoreInfo { id: number; store_name: string; }

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
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [mode, setMode] = useState<"email" | "name">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nameList, setNameList] = useState<{ id: number; display_name: string }[]>([]);
  const [selectedName, setSelectedName] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch("/api/v1/stores")
      .then(async r => {
        if (!r.ok) throw new Error("Failed to load stores");
        const d = await r.json();
        const list = d.data?.items || d.items || [];
        if (mounted) setStores(list.filter((s: any) => s.is_active !== false));
      })
      .catch((err) => { console.error("Store fetch failed:", err); if (mounted) setStores([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedStore || mode !== "name") return;
    let mounted = true;
    fetch(`/api/v1/staff/auth/names?store_id=${selectedStore}`)
      .then(async r => {
        if (!r.ok) throw new Error("Failed to load staff list");
        const d = await r.json();
        if (mounted) setNameList(d.data || []);
      })
      .catch((err) => { console.error("Staff names fetch failed:", err); if (mounted) setNameList([]); });
    return () => { mounted = false; };
  }, [selectedStore, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload: any = {};
      if (!selectedStore) { setError("Please select a store"); setLoading(false); return; }

      if (mode === "name") {
        if (!selectedName) { setError("Please select your name"); setLoading(false); return; }
        payload.display_name = selectedName;
        payload.store_id = Number(selectedStore);
        payload.password = pin;
      } else {
        payload.email = email;
        payload.password = pin || password;
        payload.store_id = Number(selectedStore);
      }

      const r = await fetch("/api/v1/staff/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let d: any;
      try { d = await r.json(); } catch (e) { console.error("Login response parse failed:", e); throw new Error("Server error. Please try again."); }
      if (!r.ok) throw new Error(d.detail || "Login failed");
      const token = d.tokens?.access_token;
      const refresh = d.tokens?.refresh_token;
      if (!token) throw new Error("Invalid response from server");
      try {
        localStorage.setItem("token", token);
        if (refresh) localStorage.setItem("refreshToken", refresh);
        if (d.profile) {
          localStorage.setItem("staffProfile", JSON.stringify(d.profile));
          if (d.profile.email) localStorage.setItem("staffEmail", d.profile.email);
          if (d.profile.display_name) localStorage.setItem("staffName", d.profile.display_name);
          if (d.profile.store_id) localStorage.setItem("staffStoreId", String(d.profile.store_id));
          if (d.profile.staff_id) localStorage.setItem("staffId", String(d.profile.staff_id));
          if (d.profile.is_admin) localStorage.setItem("isAdmin", "true");
        }
      } catch (err) {
        console.error("localStorage failed:", err);
        throw new Error("Browser storage blocked. Please disable private mode.");
      }
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
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
          <h1 className="login-brand-title">LOKA Espresso</h1>
          <p className="login-brand-subtitle">Staff Portal</p>
        </div>

        {/* Store Selection */}
        <CustomSelect
          value={selectedStore}
          onChange={(val) => { setSelectedStore(val); setNameList([]); setSelectedName(""); }}
          options={stores.map((s) => ({ value: String(s.id), label: s.store_name }))}
          placeholder="Select a store..."
          label="Store"
          icon={<Store size={16} className="login-icon-primary" />}
        />

        {/* Mode Toggle */}
        <div className="login-mode-toggle">
          <button
            onClick={() => setMode("email")}
            className={`btn flex-1 justify-center ${mode === "email" ? "btn-primary" : "btn-ghost"}`}
          >
            Email + PIN
          </button>
          <button
            onClick={() => setMode("name")}
            className={`btn flex-1 justify-center ${mode === "name" ? "btn-primary" : "btn-ghost"}`}
          >
            Name + PIN
          </button>
        </div>

        {error && <div className="alert alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "email" ? (
            <div className="form-group">
              <label className="form-label flex items-center gap-2">
                <Mail size={16} className="login-icon-primary" /> Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="staff@loyaltysystem.uk"
                className="form-input"
              />
            </div>
          ) : (
            <CustomSelect
              value={selectedName}
              onChange={setSelectedName}
              options={nameList.map((n) => ({ value: n.display_name, label: n.display_name }))}
              placeholder={selectedStore ? "Select staff..." : "Select a store first"}
              label="Name"
              icon={<User size={16} className="login-icon-primary" />}
              disabled={!selectedStore || nameList.length === 0}
            />
          )}

          <div className="form-group">
            <label className="form-label flex items-center gap-2">
              <Lock size={16} className="login-icon-primary" /> {mode === "email" ? "PIN or Password" : "PIN"}
            </label>
            <input
              type="password"
              required
              value={mode === "email" ? password : pin}
              onChange={e => mode === "email" ? setPassword(e.target.value) : setPin(e.target.value)}
              placeholder={mode === "email" ? "PIN (6 digits) or password" : "6-digit PIN"}
              maxLength={mode === "email" ? 50 : 6}
              className={`form-input ${mode === "name" ? "login-input-center" : ""}`}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !selectedStore}
            className="btn btn-primary w-full login-submit"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
