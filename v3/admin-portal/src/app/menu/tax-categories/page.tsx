"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface TaxCategory {
  id: number;
  name: string;
  rate: number;
}

export default function TaxCategoriesPage() {
  const [items, setItems] = useState<TaxCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxCategory | null>(null);
  const [form, setForm] = useState({ name: "", rate: "" });

  const fetchData = () => {
    setLoading(true);
    api
      .get<TaxCategory[]>("/admin/menu/tax-categories?store_id=1")
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({ name: "", rate: "" });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: TaxCategory) => {
    setEditing(item);
    setForm({ name: item.name, rate: String(item.rate) });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: form.name, rate: Number(form.rate) };
    try {
      if (editing) {
        await api.patch(`/admin/menu/tax-categories/${editing.id}`, payload);
      } else {
        await api.post("/admin/menu/tax-categories", payload);
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
      await api.del(`/admin/menu/tax-categories/${id}`);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tax Categories</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition">Add Tax Category</button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Tax Category" : "Add Tax Category"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rate</label>
              <input required type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className="w-full border rounded px-3 py-2" />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition">Save</button>
              <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Rate</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">No tax categories found.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3">{item.rate}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
