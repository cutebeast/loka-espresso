"use client";

import { Home, ShoppingBag, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/contexts/CartContext";

export default function BottomNav() {
  const pathname = usePathname();
  const { cartCount } = useCart();

  const links = [
    { href: "/stores", label: "Home", icon: Home },
    { href: "/orders", label: "Orders", icon: ShoppingBag },
    { href: "/cart", label: "Cart", icon: ShoppingCart, badge: cartCount },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-pb">
      <div className="max-w-md mx-auto flex items-center justify-around h-16">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center flex-1 h-full relative ${
                active ? "text-amber-600" : "text-gray-400"
              }`}
            >
              <div className="relative">
                <link.icon className="w-6 h-6" />
                {typeof link.badge === "number" && link.badge > 0 && (
                  <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {link.badge > 99 ? "99+" : link.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 font-medium">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
