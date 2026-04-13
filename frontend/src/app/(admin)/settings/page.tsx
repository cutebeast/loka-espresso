"use client";

import { useState, useEffect } from "react";
import * as api from "@/lib/api";
import type { Store, SplashContent, AppConfig } from "@/lib/types";

export default function SettingsPage() {
  const [tab, setTab] = useState<"store" | "splash" | "config">("store");
  const [store, setStore] = useState<Partial<Store>>({});
  const [splashItems, setSplashItems] = useState<SplashContent[]>([]);
  const [appConfig, setAppConfig] = useState<Partial<AppConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [storeData, splashData, configData] = await Promise.allSettled([
          api.request<Store>("/admin/settings/store"),
          api.request<SplashContent[]>("/admin/settings/splash"),
          api.request<AppConfig>("/admin/settings/config"),
        ]);
        if (storeData.status === "fulfilled") setStore(storeData.value);
        if (splashData.status === "fulfilled") setSplashItems(splashData.value);
        if (configData.status === "fulfilled") setAppConfig(configData.value);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function saveStore() {
    setSaving(true);
    setSaved(false);
    try {
      await api.request<Store>("/admin/settings/store", {
        method: "PATCH",
        body: JSON.stringify(store),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function saveSplash() {
    setSaving(true);
    setSaved(false);
    try {
      await api.request<SplashContent[]>("/admin/settings/splash", {
        method: "PUT",
        body: JSON.stringify(splashItems),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    setSaved(false);
    try {
      await api.request<AppConfig>("/admin/settings/config", {
        method: "PATCH",
        body: JSON.stringify(appConfig),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  function updateSplashItem(index: number, field: keyof SplashContent, value: string | number) {
    setSplashItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addSplashItem() {
    setSplashItems((prev) => [
      ...prev,
      { id: "", title: "", subtitle: "", image: "", actionUrl: "", sortOrder: prev.length },
    ]);
  }

  function removeSplashItem(index: number) {
    setSplashItems((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--color-navy)]" />
      </div>
    );
  }

  const TABS = [
    { key: "store" as const, label: "Store Info", icon: "fa-store" },
    { key: "splash" as const, label: "Splash Screen", icon: "fa-image" },
    { key: "config" as const, label: "App Config", icon: "fa-sliders" },
  ];

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your store settings</p>
        </div>
        {saved && (
          <span className="badge badge-green">
            <i className="fa-solid fa-check mr-1" />
            Saved
          </span>
        )}
      </div>

      <div className="flex gap-2 border-b border-gray-200 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 pb-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-[var(--color-navy)] text-[var(--color-navy)]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <i className={`fa-solid ${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "store" && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Store Information</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Store Name</label>
                <input
                  value={store.name ?? ""}
                  onChange={(e) => setStore({ ...store, name: e.target.value })}
                  placeholder="My Restaurant"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  value={store.phone ?? ""}
                  onChange={(e) => setStore({ ...store, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Address</label>
              <input
                value={store.address ?? ""}
                onChange={(e) => setStore({ ...store, address: e.target.value })}
                placeholder="123 Main Street, City"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Opening Time</label>
                <input
                  type="time"
                  value={store.openingTime ?? ""}
                  onChange={(e) => setStore({ ...store, openingTime: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Closing Time</label>
                <input
                  type="time"
                  value={store.closingTime ?? ""}
                  onChange={(e) => setStore({ ...store, closingTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Logo URL</label>
                <input
                  value={store.logo ?? ""}
                  onChange={(e) => setStore({ ...store, logo: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Cover Image URL</label>
                <input
                  value={store.coverImage ?? ""}
                  onChange={(e) => setStore({ ...store, coverImage: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={store.description ?? ""}
                onChange={(e) => setStore({ ...store, description: e.target.value })}
                placeholder="Tell customers about your store"
                rows={3}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={saveStore} disabled={saving} className="btn btn-primary disabled:opacity-50">
              {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
              Save Store Info
            </button>
          </div>
        </div>
      )}

      {tab === "splash" && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Splash Screen Content</h2>
            <button onClick={addSplashItem} className="btn btn-sm">
              <i className="fa-solid fa-plus" />
              Add Slide
            </button>
          </div>
          <div className="space-y-6">
            {splashItems.map((item, index) => (
              <div key={item.id || index} className="rounded-xl border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Slide {index + 1}</span>
                  <button
                    onClick={() => removeSplashItem(index)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                      <input
                        value={item.title}
                        onChange={(e) => updateSplashItem(index, "title", e.target.value)}
                        placeholder="Welcome!"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Subtitle</label>
                      <input
                        value={item.subtitle ?? ""}
                        onChange={(e) => updateSplashItem(index, "subtitle", e.target.value)}
                        placeholder="Order your favorite food"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Image URL</label>
                      <input
                        value={item.image ?? ""}
                        onChange={(e) => updateSplashItem(index, "image", e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">CTA Link</label>
                      <input
                        value={item.actionUrl ?? ""}
                        onChange={(e) => updateSplashItem(index, "actionUrl", e.target.value)}
                        placeholder="/menu"
                      />
                    </div>
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
                    <input
                      type="number"
                      value={item.sortOrder}
                      onChange={(e) => updateSplashItem(index, "sortOrder", parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            ))}
            {splashItems.length === 0 && (
              <div className="py-8 text-center text-gray-400">
                No splash screens. Click &quot;Add Slide&quot; to create one.
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={saveSplash} disabled={saving} className="btn btn-primary disabled:opacity-50">
              {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
              Save Splash Screen
            </button>
          </div>
        </div>
      )}

      {tab === "config" && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">App Configuration</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Delivery Fee ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={appConfig.deliveryFee ?? ""}
                  onChange={(e) => setAppConfig({ ...appConfig, deliveryFee: parseFloat(e.target.value) || undefined })}
                  placeholder="3.99"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Service Fee (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={appConfig.serviceFeePercent ?? ""}
                  onChange={(e) => setAppConfig({ ...appConfig, serviceFeePercent: parseFloat(e.target.value) || undefined })}
                  placeholder="5"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Min Order Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={appConfig.minOrderAmount ?? ""}
                  onChange={(e) => setAppConfig({ ...appConfig, minOrderAmount: parseFloat(e.target.value) || undefined })}
                  placeholder="10.00"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Referral Bonus Points</label>
                <input
                  type="number"
                  value={appConfig.referralBonusPoints ?? ""}
                  onChange={(e) => setAppConfig({ ...appConfig, referralBonusPoints: parseInt(e.target.value) || undefined })}
                  placeholder="500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Support Phone</label>
                <input
                  value={appConfig.supportPhone ?? ""}
                  onChange={(e) => setAppConfig({ ...appConfig, supportPhone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Support Email</label>
                <input
                  type="email"
                  value={appConfig.supportEmail ?? ""}
                  onChange={(e) => setAppConfig({ ...appConfig, supportEmail: e.target.value })}
                  placeholder="support@example.com"
                />
              </div>
            </div>
            <div className="space-y-3 rounded-xl bg-gray-50 p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appConfig.loyaltyEnabled ?? false}
                  onChange={(e) => setAppConfig({ ...appConfig, loyaltyEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Loyalty Program</span>
                  <p className="text-xs text-gray-500">Enable loyalty points earning and redemption</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appConfig.walletEnabled ?? false}
                  onChange={(e) => setAppConfig({ ...appConfig, walletEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Wallet</span>
                  <p className="text-xs text-gray-500">Enable in-app wallet for customers</p>
                </div>
              </label>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={saveConfig} disabled={saving} className="btn btn-primary disabled:opacity-50">
              {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
              Save Config
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
