"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Server, Monitor, Smartphone, Globe } from "lucide-react";
import { VERSION_URLS, STORAGE_KEYS } from "@/lib/constants";

interface VersionInfo {
  app: string;
  name: string;
  version: string;
  commit: string;
  branch: string;
  builtAt: number;
  commitAt: number | null;
  environment: string;
}

const SERVICES = [
  { key: "backend", name: "Backend API", icon: Server, url: "/api/admin/system/version" },
  { key: "admin", name: "Admin Portal", icon: Monitor, url: "/version.json" },
  { key: "staff", name: "Staff Portal", icon: Globe, url: VERSION_URLS.staff },
  { key: "customer", name: "Customer PWA", icon: Smartphone, url: VERSION_URLS.customer },
];

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function VersionControlPage() {
  const [versions, setVersions] = useState<Record<string, VersionInfo | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    const results: Record<string, VersionInfo | null> = {};

    for (const svc of SERVICES) {
      try {
        const headers: Record<string, string> = {};
        if (svc.key === "backend") {
          const token = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.TOKEN) : null;
          if (token) headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch(svc.url, { cache: "no-store", headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const info = data.data || data;
        results[svc.key] = info as VersionInfo;
      } catch (err: any) {
        results[svc.key] = null;
        console.error(`Failed to load version for ${svc.name}:`, err);
      }
    }

    setVersions(results);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Version Control</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>Build and deployment versions across all services</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "var(--color-error-bg)", borderRadius: "var(--radius-md)", color: "var(--color-error)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {SERVICES.map((svc) => {
          const info = versions[svc.key];
          const Icon = svc.icon;
          return (
            <div key={svc.key} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--color-primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{svc.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {info ? `${info.app} · ${info.environment}` : svc.url}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                {info && (
                  <span className={`badge badge-sm ${info.branch === "master" || info.branch === "main" ? "badge-primary" : "badge-outline"}`}>
                    {info.branch}
                  </span>
                )}
              </div>

              {info ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Version</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{info.version}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Commit</div>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: "monospace" }}>{info.commit}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Built</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }} title={formatDate(info.builtAt)}>{timeAgo(info.builtAt)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Commit Date</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }} title={formatDate(info.commitAt)}>{timeAgo(info.commitAt)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "12px 0", color: "var(--color-text-muted)", fontSize: 13 }}>
                  {loading ? "Loading..." : "Unable to fetch version — service may be down or version.json missing"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
