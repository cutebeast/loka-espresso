"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Armchair,
  CalendarCheck,
  Clock,
  UserCircle,
} from "lucide-react";

const navItems = [
  { label: "Orders", href: "/orders", icon: ClipboardList },
  { label: "Tables", href: "/tables", icon: Armchair },
  { label: "Reservations", href: "/reservations", icon: CalendarCheck },
  { label: "Time Clock", href: "/time-clock", icon: Clock },
  { label: "Profile", href: "/profile", icon: UserCircle },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="flex flex-col w-56 bg-slate-900 text-white h-screen sticky top-0 shrink-0">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-bold tracking-tight">Counter Station</h1>
        <p className="text-xs text-slate-400 mt-0.5">Service Crew</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition ${
                    active
                      ? "bg-slate-700 text-white font-medium"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="p-3 border-t border-slate-700">
        <p className="text-xs text-slate-400 text-center">Counter Station v3</p>
      </div>
    </aside>
  );
}
