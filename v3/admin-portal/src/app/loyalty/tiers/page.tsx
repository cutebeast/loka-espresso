"use client";

import { useEffect, useState } from "react";
import { api, getLoyaltyTiers, createLoyaltyTier, type LoyaltyTier } from "@/lib/api";

export default function LoyaltyTiersPage() {
  const [items, setItems] = useState<LoyaltyTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LoyaltyTier | null>(null);
  const [form, setForm] = useState({ name: "", color: "#000000", min_points: 0, multiplier: 1 });

  const fetchData = () => {
    setLoading(true);
    getLoyaltyTiers()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({ name: "", color: "#000000", min_points: 0, multiplier: 1 });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: LoyaltyTier) => {
    setEditing(item);
    setForm({ name: item.name, color: item.color, min_points: item.min_points, multiplier: item.multiplier });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/admin/loyalty/tiers/${editing.id}`, form);
      } else {
        await createLoyaltyTier(form);
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Loyalty Tiers</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
        >
          Add Tier
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Tier" : "Add Tier"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Color</label>
              <input
                type="color"
                required
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-full h-10 border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Min Points</label>
              <input
                type="number"
                required
                value={form.min_points}
                onChange={(e) => setForm({ ...form, min_points: Number(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Multiplier</label>
              <input
                type="number"
                step="0.1"
                required
                value={form.multiplier}
                onChange={(e) => setForm({ ...form, multiplier: Number(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button
                type="submit"
                className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
              >
                Save
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-500 py-8">No tiers found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((tier) => (
            <div key={tier.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full" style={{ backgroundColor: tier.color }} />
                <h3 className="text-lg font-semibold">{tier.name}</h3>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  Min Points: <span className="font-medium text-gray-900">{tier.min_points}</span>
                </p>
                <p>
                  Multiplier: <span className="font-medium text-gray-900">{tier.multiplier}x</span>
                </p>
              </div>
              <div className="mt-4">
                <button onClick={() => openEdit(tier)} className="text-blue-600 hover:underline text-sm">Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
