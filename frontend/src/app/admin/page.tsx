"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import * as api from "@/lib/api";
import type { Order } from "@/lib/types";

interface DashboardStats {
  ordersToday: number;
  revenueToday: number;
  totalCustomers: number;
  activeOrders: number;
}

export default function DashboardPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated && !authLoading) return;

    async function load() {
      try {
        const dash = await api.request<DashboardStats>("/admin/dashboard");
        setStats(dash);
      } catch {}

      try {
        const res = await api.orders.listOrders({ page: 1, pageSize: 10 });
        setRecentOrders(res.data);
      } catch {}

      setLoading(false);
    }

    if (isAuthenticated) load();
  }, [isAuthenticated, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--color-navy)]" />
      </div>
    );
  }

  const STAT_CARDS = [
    {
      label: "Orders Today",
      value: stats?.ordersToday ?? 0,
      icon: "fa-bag-shopping",
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Revenue Today",
      value: `$${(stats?.revenueToday ?? 0).toFixed(2)}`,
      icon: "fa-dollar-sign",
      color: "bg-green-50 text-[var(--color-green)]",
    },
    {
      label: "Total Customers",
      value: stats?.totalCustomers ?? 0,
      icon: "fa-users",
      color: "bg-purple-50 text-[var(--color-purple)]",
    },
    {
      label: "Active Orders",
      value: stats?.activeOrders ?? 0,
      icon: "fa-fire",
      color: "bg-orange-50 text-[var(--color-orange)]",
    },
  ];

  const STATUS_BADGE: Record<string, string> = {
    pending: "badge-yellow",
    confirmed: "badge-blue",
    preparing: "badge-yellow",
    ready: "badge-green",
    delivering: "badge-blue",
    completed: "badge-green",
    cancelled: "badge-red",
  };

  const MODE_LABEL: Record<string, string> = {
    dine_in: "Dine In",
    pickup: "Pickup",
    delivery: "Delivery",
  };

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Welcome back! Here&apos;s your overview.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/orders" className="btn">
            <i className="fa-solid fa-receipt" />
            View Orders
          </Link>
          <Link href="/admin/menu" className="btn btn-primary">
            <i className="fa-solid fa-plus" />
            Add Item
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className="card">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.color}`}
              >
                <i className={`fa-solid ${card.icon} text-lg`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
          <Link
            href="/admin/orders"
            className="text-sm font-medium text-[var(--color-navy)] hover:underline"
          >
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400">
                    No orders yet
                  </td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="font-medium">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {MODE_LABEL[order.orderMode] ?? order.orderMode}
                      </span>
                    </td>
                    <td className="text-gray-500">
                      {order.items.length} item
                      {order.items.length !== 1 ? "s" : ""}
                    </td>
                    <td className="font-medium">${order.total.toFixed(2)}</td>
                    <td>
                      <span
                        className={`badge ${STATUS_BADGE[order.status] ?? "badge-gray"}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="text-gray-400 text-sm">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          href="/admin/menu"
          className="card flex items-center gap-4 hover:border-[var(--color-navy)]/20 transition-colors"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-[var(--color-navy)]">
            <i className="fa-solid fa-utensils text-lg" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Manage Menu</p>
            <p className="text-sm text-gray-500">
              Add, edit or remove menu items
            </p>
          </div>
        </Link>

        <Link
          href="/admin/vouchers"
          className="card flex items-center gap-4 hover:border-[var(--color-navy)]/20 transition-colors"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-50 text-[var(--color-gold)]">
            <i className="fa-solid fa-ticket text-lg" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Vouchers</p>
            <p className="text-sm text-gray-500">Create and manage vouchers</p>
          </div>
        </Link>

        <Link
          href="/admin/reports"
          className="card flex items-center gap-4 hover:border-[var(--color-navy)]/20 transition-colors"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-[var(--color-green)]">
            <i className="fa-solid fa-chart-pie text-lg" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Reports</p>
            <p className="text-sm text-gray-500">
              View sales analytics &amp; reports
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
