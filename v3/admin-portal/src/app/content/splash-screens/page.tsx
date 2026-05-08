"use client";

import { useEffect, useState } from "react";
import {
  api,
  getSplashScreens,
  createSplashScreen,
  updateSplashScreen,
  deleteSplashScreen,
  type SplashScreen,
} from "@/lib/api";

export default function SplashScreensPage() {
  const [items, setItems] = useState<SplashScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SplashScreen | null>(null);
  const [form, setForm] = useState({
    screen_key: "",
    title: "",
    subtitle: "",
    image_url: "",
    cta_text: "",
    cta_url: "",
    display_order: 0,
    is_active: true,
    start_date: "",
    end_date: "",
  });

  const fetchData = () => {
    setLoading(true);
    getSplashScreens()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({
      screen_key: "",
      title: "",
      subtitle: "",
      image_url: "",
      cta_text: "",
      cta_url: "",
      display_order: 0,
      is_active: true,
      start_date: "",
      end_date: "",
    });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: SplashScreen) => {
    setEditing(item);
    setForm({
      screen_key: item.screen_key,
      title: item.title,
      subtitle: item.subtitle || "",
      image_url: item.image_url || "",
      cta_text: item.cta_text || "",
      cta_url: item.cta_url || "",
      display_order: item.display_order,
      is_active: item.is_active,
      start_date: item.start_date ? item.start_date.slice(0, 10) : "",
      end_date: item.end_date ? item.end_date.slice(0, 10) : "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/admin/content/splash-screens/${editing.id}`, form);
      } else {
        await createSplashScreen(form);
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleStatus = async (item: SplashScreen) => {
    try {
      await updateSplashScreen(item.id, { is_active: !item.is_active });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteSplashScreen(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Splash Screens</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
        >
          Add Splash Screen
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Splash Screen" : "Add Splash Screen"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Screen Key</label>
              <input
                required
                value={form.screen_key}
                onChange={(e) => setForm({ ...form, screen_key: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Subtitle</label>
              <input
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Order</label>
              <input
                type="number"
                required
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
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
              <label className="block text-sm font-medium mb-1">CTA Text</label>
              <input
                value={form.cta_text}
                onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CTA URL</label>
              <input
                value={form.cta_url}
                onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input
                id="ssactive"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="ssactive" className="text-sm">
                Active
              </label>
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
        <div className="text-center text-gray-500 py-8">No splash screens found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow overflow-hidden">
              {item.image_url ? (
                <img src={item.image_url} alt={item.title} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-gray-200 flex items-center justify-center text-gray-400">
                  No Image
                </div>
              )}
              <div className="p-4">
                <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-gray-600 mb-2">{item.subtitle || "—"}</p>
                <p className="text-xs text-gray-500 mb-1">Key: <span className="font-mono">{item.screen_key}</span></p>
                <p className="text-xs text-gray-500 mb-1">Store: {item.store_name || "—"}</p>
                <p className="text-xs text-gray-500 mb-2">Order: {item.display_order}</p>
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                      item.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {item.is_active ? "Active" : "Inactive"}
                  </span>
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline text-sm">
                      Edit
                    </button>
                    <button onClick={() => toggleStatus(item)} className="text-slate-600 hover:underline text-sm">
                      {item.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline text-sm">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
