"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import Badge, { type BadgeVariant } from "@/components/Badge";
import { Wrench, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface Equipment {
  id: number;
  store_id: number;
  equipment_name: string;
  equipment_type: string;
  serial_number?: string;
  status: string;
  last_maintenance_at?: string;
  next_maintenance_due?: string;
}

export default function EquipmentPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getRaw<{ items: Equipment[] }>("/admin/equipment?per_page=100");
      setItems(Array.isArray(data) ? data : (data?.items || []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const statusIcon = (s: string) => {
    switch (s) {
      case "operational": return <CheckCircle size={14} style={{ color: "var(--color-success)" }} />;
      case "maintenance": return <Wrench size={14} style={{ color: "var(--color-warning, #f59e0b)" }} />;
      case "broken": return <AlertTriangle size={14} style={{ color: "var(--color-error)" }} />;
      default: return <Clock size={14} />;
    }
  };

  const statusLabel = (s: string) => s?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Equipment" subtitle="View equipment status and report issues" />
      {error && <Alert variant="error">{error}</Alert>}
      {loading ? (
        <SkeletonCard count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Wrench size={48} />} title="No equipment" description="No equipment registered for your store" />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((e) => (
            <div key={e.id} className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{e.equipment_name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {e.equipment_type} {e.serial_number ? `· SN: ${e.serial_number}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {statusIcon(e.status)}
                <Badge variant={(e.status === "broken" ? "red" : e.status === "maintenance" ? "amber" : "green") as BadgeVariant}>
                  {statusLabel(e.status)}
                </Badge>
              </div>
              {e.next_maintenance_due && (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "right" }}>
                  <div>Next maintenance</div>
                  <div>{new Date(e.next_maintenance_due).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
