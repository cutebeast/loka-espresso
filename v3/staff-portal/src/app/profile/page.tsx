"use client";

import { useEffect, useState } from "react";
import { api, StaffMember } from "@/lib/api";
import { User, Mail, Shield, Phone } from "lucide-react";

export default function ProfilePage() {
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const data = await api.get<StaffMember>("/admin/auth/me");
        setStaff(data);
        setError("");
      } catch (err: any) {
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, []);

  const email = typeof window !== "undefined" ? localStorage.getItem("staffEmail") || "" : "";
  const name = typeof window !== "undefined" ? localStorage.getItem("staffName") || email : "";

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-6">My Profile</h2>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-slate-800 text-white flex items-center justify-center text-xl font-bold">
            {name ? name.charAt(0).toUpperCase() : "S"}
          </div>
          <div>
            <h3 className="text-lg font-semibold">{staff?.name || name || "Staff Member"}</h3>
            <p className="text-sm text-gray-500">{staff?.role || "Staff"}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail size={16} className="text-gray-400" />
            <span className="text-gray-500 w-20">Email</span>
            <span className="font-medium">{staff?.email || email}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield size={16} className="text-gray-400" />
            <span className="text-gray-500 w-20">Role</span>
            <span className="font-medium">{staff?.role || "Staff"}</span>
          </div>
          {staff?.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone size={16} className="text-gray-400" />
              <span className="text-gray-500 w-20">Phone</span>
              <span className="font-medium">{staff.phone}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">App Info</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>Staff Portal v1.0</p>
          <p>FNB Super App v3</p>
        </div>
      </div>
    </div>
  );
}
