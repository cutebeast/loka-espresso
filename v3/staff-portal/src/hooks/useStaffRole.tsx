"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type StaffRole =
  | "system_admin"
  | "regional_manager"
  | "store_manager"
  | "shift_supervisor"
  | "cashier"
  | "server"
  | "kitchen_staff"
  | "delivery_coordinator"
  | "readonly_analyst";

const STAFF_ROLES: StaffRole[] = [
  "system_admin",
  "regional_manager",
  "store_manager",
  "shift_supervisor",
  "cashier",
  "server",
  "kitchen_staff",
  "delivery_coordinator",
  "readonly_analyst",
];

interface StaffMe {
  is_admin?: boolean;
  staff_role?: StaffRole | string;
  roles?: string[];
}

function normalizeRole(role: string): string {
  return role.toLowerCase().replace(/\s+/g, "_");
}

function resolveRole(staffRole?: string | null, roles?: string[]): StaffRole | null {
  if (staffRole && STAFF_ROLES.includes(staffRole as StaffRole)) {
    return staffRole as StaffRole;
  }
  for (const r of roles || []) {
    const normalized = normalizeRole(r);
    if (STAFF_ROLES.includes(normalized as StaffRole)) {
      return normalized as StaffRole;
    }
  }
  return null;
}

export function useStaffRole(): { role: StaffRole | null; isAdmin: boolean; loading: boolean } {
  const [role, setRole] = useState<StaffRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<StaffMe>("/staff/auth/me")
      .then((data) => {
        if (cancelled) return;
        const admin = !!(data?.is_admin || data?.roles?.some((r) => normalizeRole(r) === "admin"));
        setIsAdmin(admin);
        setRole(resolveRole(data?.staff_role, data?.roles));
      })
      .catch((e) => console.error("[useStaffRole] failed", e))
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return { role, isAdmin, loading };
}

const POS_ROLES: StaffRole[] = ["cashier", "server", "shift_supervisor", "store_manager"];
const KITCHEN_ROLES: StaffRole[] = ["kitchen_staff", "shift_supervisor", "store_manager"];
const OPS_ROLES: StaffRole[] = ["shift_supervisor", "store_manager", "kitchen_staff"];

export function canUsePOS(role: StaffRole | null, isAdmin: boolean): boolean {
  return isAdmin || (role ? POS_ROLES.includes(role as StaffRole) : false);
}

export function canUseKitchen(role: StaffRole | null, isAdmin: boolean): boolean {
  return isAdmin || (role ? KITCHEN_ROLES.includes(role as StaffRole) : false);
}

export function canUseOps(role: StaffRole | null, isAdmin: boolean): boolean {
  return isAdmin || (role ? OPS_ROLES.includes(role as StaffRole) : false);
}

// Hygiene duty reports (garbage disposal / grease-trap cleaning) are an
// OUTLET-WIDE duty — any staff member who does the task must be able to
// submit photo proof. The admin verifies submissions on the admin portal.
export function canReportHygiene(role: StaffRole | null, isAdmin: boolean): boolean {
  return isAdmin || role !== null;
}

export function canManageStore(role: StaffRole | null, isAdmin: boolean): boolean {
  return isAdmin || role === "store_manager" || role === "shift_supervisor";
}

/**
 * Page-level role guard component.
 * Renders children only if the user's role has access.
 * Shows an access-denied message otherwise.
 */
export function RoleGuard({
  children,
  allowed,
  loadingFallback,
}: {
  children: React.ReactNode;
  allowed: (role: StaffRole | null, isAdmin: boolean) => boolean;
  loadingFallback?: React.ReactNode;
}) {
  const { role, isAdmin, loading } = useStaffRole();

  if (loading) {
    return <>{loadingFallback ?? <div style={{ padding: 32, textAlign: "center" }}>Loading…</div>}</>;
  }

  if (!allowed(role, isAdmin)) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Access Denied</div>
        <div style={{ fontSize: 16 }}>You do not have permission to access this page.</div>
      </div>
    );
  }

  return <>{children}</>;
}
