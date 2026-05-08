"use client";

import { useEffect, useState } from "react";
import {
  getPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderLineItem,
} from "@/lib/api";

export default function PurchaseOrdersPage() {
  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({
    supplier_id: "",
    store_id: "1",
    expected_delivery: "",
    items: [{ item_id: "", quantity: "", unit_cost: "" }] as { item_id: string; quantity: string; unit_cost: string }[],
  });

  const fetchData = () => {
    setLoading(true);
    getPurchaseOrders({ status: statusFilter || undefined })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const resetForm = () => {
    setForm({
      supplier_id: "",
      store_id: "1",
      expected_delivery: "",
      items: [{ item_id: "", quantity: "", unit_cost: "" }],
    });
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      supplier_id: Number(form.supplier_id),
      store_id: Number(form.store_id),
      expected_delivery: form.expected_delivery,
      items: form.items
        .filter((i) => i.item_id && i.quantity)
        .map((i) => ({ item_id: Number(i.item_id), quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) || 0 })),
    };
    try {
      await createPurchaseOrder(payload);
      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReceive = async (id: number) => {
    if (!confirm("Mark this purchase order as received?")) return;
    try {
      await receivePurchaseOrder(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm("Cancel this purchase order?")) return;
    try {
      await cancelPurchaseOrder(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-700";
      case "pending":
        return "bg-amber-100 text-amber-700";
      case "approved":
        return "bg-green-100 text-green-700";
      case "received":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const addLineItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { item_id: "", quantity: "", unit_cost: "" }],
    }));
  };

  const updateLineItem = (index: number, field: string, value: string) => {
    setForm((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const removeLineItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Purchase Orders</h1>
        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700 transition"
          >
            Create PO
          </button>
        </div>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      {showForm && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">New Purchase Order</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Supplier ID</label>
                <input required type="number" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Store ID</label>
                <input required type="number" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Expected Delivery</label>
                <input required type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} className="w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Line Items</label>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div>
                      <label className="text-xs text-gray-500">Item ID</label>
                      <input required type="number" value={item.item_id} onChange={(e) => updateLineItem(idx, "item_id", e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Quantity</label>
                      <input required type="number" value={item.quantity} onChange={(e) => updateLineItem(idx, "quantity", e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Unit Cost</label>
                      <input type="number" step="0.01" value={item.unit_cost} onChange={(e) => updateLineItem(idx, "unit_cost", e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <button type="button" onClick={() => removeLineItem(idx)} className="text-red-600 hover:underline text-sm">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addLineItem} className="mt-2 text-sm text-blue-600 hover:underline">+ Add line item</button>
            </div>
            <div className="flex gap-2">
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
              <th className="text-left px-4 py-3 font-semibold">PO Number</th>
              <th className="text-left px-4 py-3 font-semibold">Supplier</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Total</th>
              <th className="text-left px-4 py-3 font-semibold">Order Date</th>
              <th className="text-left px-4 py-3 font-semibold">Expected Delivery</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No purchase orders found.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 font-mono">{item.po_number}</td>
                  <td className="px-4 py-3">{item.supplier_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">RM {item.total.toFixed(2)}</td>
                  <td className="px-4 py-3">{new Date(item.order_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{item.expected_delivery ? new Date(item.expected_delivery).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    {item.status === "pending" || item.status === "approved" ? (
                      <>
                        <button onClick={() => handleReceive(item.id)} className="text-green-600 hover:underline mr-3">Receive</button>
                        <button onClick={() => handleCancel(item.id)} className="text-red-600 hover:underline">Cancel</button>
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
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
