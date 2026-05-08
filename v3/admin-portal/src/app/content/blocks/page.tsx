"use client";

import { useEffect, useState } from "react";
import {
  api,
  getContentBlocks,
  createContentBlock,
  updateContentBlock,
  deleteContentBlock,
  type ContentBlock,
} from "@/lib/api";

export default function ContentBlocksPage() {
  const [items, setItems] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContentBlock | null>(null);
  const [form, setForm] = useState({
    block_key: "",
    block_type: "text" as ContentBlock["block_type"],
    title: "",
    content: "",
    image_url: "",
    display_order: 0,
    is_active: true,
    start_date: "",
    end_date: "",
  });

  const fetchData = () => {
    setLoading(true);
    getContentBlocks()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({
      block_key: "",
      block_type: "text",
      title: "",
      content: "",
      image_url: "",
      display_order: 0,
      is_active: true,
      start_date: "",
      end_date: "",
    });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: ContentBlock) => {
    setEditing(item);
    setForm({
      block_key: item.block_key,
      block_type: item.block_type,
      title: item.title,
      content: item.content || "",
      image_url: item.image_url || "",
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
        await api.patch(`/admin/content/blocks/${editing.id}`, form);
      } else {
        await createContentBlock(form);
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleStatus = async (item: ContentBlock) => {
    try {
      await updateContentBlock(item.id, { is_active: !item.is_active });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteContentBlock(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Content Blocks</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
        >
          Add Block
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Block" : "Add Block"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Block Key</label>
              <input
                required
                value={form.block_key}
                onChange={(e) => setForm({ ...form, block_key: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={form.block_type}
                onChange={(e) => setForm({ ...form, block_type: e.target.value as ContentBlock["block_type"] })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="banner">Banner</option>
                <option value="promo">Promo</option>
              </select>
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
              <label className="block text-sm font-medium mb-1">Display Order</label>
              <input
                type="number"
                required
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full border rounded px-3 py-2"
                rows={3}
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
                id="cbactive"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="cbactive" className="text-sm">
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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Key</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Title</th>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Display Order</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No content blocks found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 font-mono">{item.block_key}</td>
                  <td className="px-4 py-3 capitalize">{item.block_type}</td>
                  <td className="px-4 py-3">{item.title}</td>
                  <td className="px-4 py-3">{item.store_name || "—"}</td>
                  <td className="px-4 py-3">{item.display_order}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        item.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline mr-3">
                      Edit
                    </button>
                    <button onClick={() => toggleStatus(item)} className="text-slate-600 hover:underline mr-3">
                      {item.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:underline">
                      Delete
                    </button>
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
