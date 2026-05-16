"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { staffLogin } from "@/lib/api";
import { Store, Lock, Mail, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"email" | "name">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [nameList, setNameList] = useState<{ id: number; display_name: string; store_name: string }[]>([]);

  useEffect(() => {
    fetch("/api/v1/staff/auth/names")
      .then(r => r.json())
      .then(d => setNameList(Array.isArray(d.data) ? d.data : []))
      .catch(() => {});
  }, []);

  const [selectedName, setSelectedName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "email") {
        await staffLogin(email, pin);
      } else {
        // Name + PIN: use PIN as password, selectedName ID as email
        const staff = nameList.find(n => n.display_name === selectedName);
        if (!staff) { setError("Please select a name"); setLoading(false); return; }
        await staffLogin(String(staff.id), pin); // sends id as email, pin as password
      }
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-brand-bg px-4">
      <div className="w-full max-w-md bg-brand-card rounded-2xl border border-brand-border-light shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-brand flex items-center justify-center mx-auto mb-4">
            <Store size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-brand-text">LOKA Espresso</h1>
          <p className="text-sm text-brand-text-muted mt-1">Staff Portal</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setMode("email")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === "email" ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
            Email + PIN
          </button>
          <button onClick={() => setMode("name")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === "name" ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>
            Name + PIN
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "email" ? (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-brand-text-secondary mb-2">
                <Mail size={16} className="text-brand" />
                Email
              </label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="staff@loyaltysystem.uk"
                className="w-full px-4 py-3 text-base bg-white border border-brand-border rounded-lg text-brand-text placeholder:text-brand-text-muted/50 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
            </div>
          ) : (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-brand-text-secondary mb-2">
                <User size={16} className="text-brand" />
                Name
              </label>
              <select value={selectedName} onChange={e => setSelectedName(e.target.value)} required
                className="w-full px-4 py-3 text-base bg-white border border-brand-border rounded-lg text-brand-text focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand">
                <option value="">Select staff...</option>
                {nameList.map(n => (
                  <option key={n.id} value={n.display_name}>{n.display_name} — {n.store_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-brand-text-secondary mb-2">
              <Lock size={16} className="text-brand" />
              PIN
            </label>
            <input type="password" required value={pin} onChange={e => setPin(e.target.value)}
              placeholder="4-digit PIN"
              maxLength={6}
              className="w-full px-4 py-3 text-base bg-white border border-brand-border rounded-lg text-brand-text placeholder:text-brand-text-muted/50 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand text-center" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
