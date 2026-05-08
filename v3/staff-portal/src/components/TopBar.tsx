"use client";

import { useRouter } from "next/navigation";
import { LogOut, Store, User } from "lucide-react";
import { staffLogout } from "@/lib/api";

export default function TopBar() {
  const router = useRouter();
  const staffEmail = typeof window !== "undefined" ? localStorage.getItem("staffEmail") || "" : "";
  const staffName = typeof window !== "undefined" ? localStorage.getItem("staffName") || staffEmail : "";

  const handleLogout = () => {
    staffLogout();
    router.push("/login");
  };

  return (
    <header className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
      <div className="flex items-center gap-2 text-gray-600">
        <Store size={18} />
        <span className="text-sm font-medium">Main Store</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <User size={16} />
          <span className="hidden sm:inline">{staffName}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 px-3 py-1.5 rounded hover:bg-red-50 transition"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
