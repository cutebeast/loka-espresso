"use client";

import { useEffect, useState } from "react";
import { api, getVouchers, createVoucher, updateVoucherStatus, type Voucher } from "@/lib/api";

export default function VouchersPage() {
  const [items, setItems] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [form, setForm] = useState({
    code: "",
    title: "",
    type: "percentage",
    discount_value: 0,
    valid_from: "",
    valid_until: "",
    max_uses: 0,
    used_count: 0,
    status: "active" as "active" | "inactive",
  });

  const fetchData = () => {
    setLoading(true);
    getVouchers()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setForm({
      code: "",
      title: "",
      type: "percentage",
      discount_value: 0,
      valid_from: "",
      valid_until: "",
      max_uses: 0,
      used_count: 0,
      status: "active",
    });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (item: Voucher) => {
    setEditing(item);
    setForm({
      code: item.code,
      title: item.title,
      type: item.type,
      discount_value: item.discount_value,
      valid_from: item.valid_from ? item.valid_from.slice(0, 10) : "",
      valid_until: item.valid_until ? item.valid_until.slice(0, 10) : "",
      max_uses: item.max_uses,
      used_count: item.used_count,
      status: item.status,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/admin/vouchers/${editing.id}`, form);
      } else {
        await createVoucher(form);
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleStatus = async (item: Voucher) => {
    const next = item.status === "active" ? "inactive" : "active";
    try {
      await updateVoucherStatus(item.id, next);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Vouchers</h1>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
        >
          Add Voucher
        </button>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Voucher" : "Add Voucher"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
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
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Discount Value</label>
              <input
                type="number"
                required
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valid From</label>
              <input
                type="date"
                required
                value={form.valid_from}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valid Until</label>
              <input
                type="date"
                required
                value={form.valid_until}
                onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Uses</label>
              <input
                type="number"
                required
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: Number(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <input
                id="vstatus"
                type="checkbox"
                checked={form.status === "active"}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.checked ? "active" : "inactive" })
                }
              />
              <label htmlFor="vstatus" className="text-sm">
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
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Title</th>
              <th className="text-left px-4 py-3 font-semibold">Type</th>
              <th className="text-left px-4 py-3 font-semibold">Discount</th>
              <th className="text-left px-4 py-3 font-semibold">Valid From</th>
              <th className="text-left px-4 py-3 font-semibold">Valid Until</th>
              <th className="text-left px-4 py-3 font-semibold">Uses</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-500">
                  No vouchers found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 font-mono">{item.code}</td>
                  <td className="px-4 py-3">{item.title}</td>
                  <td className="px-4 py-3 capitalize">{item.type}</td>
                  <td className="px-4 py-3">{item.discount_value}</td>
                  <td className="px-4 py-3">
                    {item.valid_from ? new Date(item.valid_from).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {item.valid_until ? new Date(item.valid_until).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {item.used_count} / {item.max_uses}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        item.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:underline mr-3">
                      Edit
                    </button>
                    <button onClick={() => toggleStatus(item)} className="text-slate-600 hover:underline">
                      {item.status === "active" ? "Deactivate" : "Activate"}
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
