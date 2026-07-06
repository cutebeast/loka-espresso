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

export function canManageStore(role: StaffRole | null, isAdmin: boolean): boolean {
  return isAdmin || role === "store_manager" || role === "shift_supervisor";
}
