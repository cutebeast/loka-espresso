"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Mail, Phone, MapPin, CreditCard, ChevronRight } from "lucide-react";
import { api, customerLogout, Profile } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Profile>("/me/profile")
      .then((data) => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    customerLogout();
    router.replace("/login");
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">Profile</h1>

      {loading ? (
        <div className="bg-white rounded-2xl h-32 animate-pulse" />
      ) : (
        <>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-2xl shrink-0">
              {profile?.name?.charAt(0).toUpperCase() || "👤"}
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{profile?.name || "Guest"}</h2>
              <p className="text-sm text-gray-500">{profile?.email || "-"}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl mt-4 shadow-sm border border-gray-100 divide-y divide-gray-100">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700 flex-1">Name</span>
              <span className="text-sm font-medium text-gray-900">{profile?.name || "-"}</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700 flex-1">Email</span>
              <span className="text-sm font-medium text-gray-900">{profile?.email || "-"}</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700 flex-1">Phone</span>
              <span className="text-sm font-medium text-gray-900">{profile?.phone || "-"}</span>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Settings</h3>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
              <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 flex-1">Saved Addresses</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 flex-1">Payment Methods</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-6 py-3.5 rounded-xl bg-red-50 text-red-600 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </>
      )}
    </div>
  );
}
