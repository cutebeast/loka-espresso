"use client";

import { useEffect, useState } from "react";
import { api, getRewards, createReward, type Reward } from "@/lib/api";

export default function RewardsPage() {
  const [items, setItems] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [form, setForm] = useState({
    name: "",
    image_url: "",
    points_cost: 0,
    type: "product",
    description: "",
  });

  const fetchData = () => {
    setLoading(true);
    getRewards()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({ name: "", image_url: "", points_cost: 0, type: "product", description: "" });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: Reward) => {
    setEditing(item);
    setForm({
      name: item.name,
      image_url: item.image_url || "",
      points_cost: item.points_cost,
      type: item.type,
      description: item.description || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/admin/rewards/${editing.id}`, form);
      } else {
        await createReward(form);
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await api.del(`/admin/rewards/${id}`);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Rewards</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
        >
          Add Reward
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Reward" : "Add Reward"}</h2>
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
              <label className="block text-sm font-medium mb-1">Image URL</label>
              <input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Points Cost</label>
              <input
                type="number"
                required
                value={form.points_cost}
                onChange={(e) => setForm({ ...form, points_cost: Number(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <input
                required
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-3 py-2"
                rows={3}
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
        <div className="text-center text-gray-500 py-8">No rewards found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow overflow-hidden">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-gray-200 flex items-center justify-center text-gray-400">
                  No Image
                </div>
              )}
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-1">{item.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{item.type}</p>
                <p className="text-sm font-medium text-slate-800 mb-3">{item.points_cost} points</p>
                <div className="flex gap-3">
                  <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline text-sm">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-sm">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
