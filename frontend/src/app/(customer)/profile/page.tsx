"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import * as api from "@/lib/api";
import type { Wallet } from "@/lib/types";

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadWallet() {
      try {
        const data = await api.wallet.getWallet();
        setWallet(data);
      } catch {
        setWallet(null);
      }
    }
    loadWallet();
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email ?? "");
    }
  }, [user]);

  async function handleSave() {
    setSaving(true);
    try {
      await api.users.updateMe({ name, email });
      setEditing(false);
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[var(--color-navy)] flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="text-sm py-1"
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  className="text-sm py-1"
                />
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="font-bold text-lg">{user?.name ?? "User"}</div>
                <div className="text-sm text-gray-500">{user?.email ?? "No email"}</div>
                <div className="text-sm text-gray-500">{user?.phone ?? ""}</div>
                <button
                  className="text-sm text-[var(--color-navy)] font-medium mt-1"
                  onClick={() => setEditing(true)}
                >
                  Edit Profile
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {wallet && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-[var(--color-green)]/10 flex items-center justify-center">
              <i className="fa-solid fa-wallet text-[var(--color-green)]" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Wallet Balance</div>
              <div className="text-xl font-bold text-[var(--color-navy)]">
                {wallet.currency} {wallet.balance.toFixed(2)}
              </div>
            </div>
          </div>
          <button className="btn btn-primary btn-sm w-full justify-center">
            Top Up Wallet
          </button>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Saved Addresses</h3>
        <div className="text-center py-4 text-gray-400 text-sm">
          <i className="fa-solid fa-location-dot text-2xl mb-2 block" />
          No saved addresses
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Payment Methods</h3>
        <div className="text-center py-4 text-gray-400 text-sm">
          <i className="fa-solid fa-credit-card text-2xl mb-2 block" />
          No payment methods saved
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <button className="card w-full flex items-center gap-3 cursor-pointer" onClick={() => router.push("/orders")}>
          <i className="fa-solid fa-receipt text-gray-400" />
          <span className="flex-1 text-sm font-medium">My Orders</span>
          <i className="fa-solid fa-chevron-right text-xs text-gray-400" />
        </button>
        <button className="card w-full flex items-center gap-3 cursor-pointer" onClick={() => router.push("/rewards")}>
          <i className="fa-solid fa-star text-gray-400" />
          <span className="flex-1 text-sm font-medium">Rewards</span>
          <i className="fa-solid fa-chevron-right text-xs text-gray-400" />
        </button>
      </div>

      <button
        className="btn w-full justify-center text-red-500 border-red-200 hover:bg-red-50 mt-4"
        onClick={handleLogout}
      >
        <i className="fa-solid fa-right-from-bracket" /> Log Out
      </button>
    </div>
  );
}
