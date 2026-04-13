"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";

interface TableItem {
  id: string;
  number: string;
  capacity: number;
  qrCodeUrl: string;
  isActive: boolean;
}

export default function TablesPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tableNumber, setTableNumber] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [saving, setSaving] = useState(false);
  const [printTable, setPrintTable] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    try {
      const data = await api.request<TableItem[]>("/admin/tables");
      setTables(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  async function addTable(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.request<TableItem>("/admin/tables", {
        method: "POST",
        body: JSON.stringify({
          number: tableNumber,
          capacity: parseInt(capacity) || 4,
        }),
      });
      setTableNumber("");
      setCapacity("4");
      setShowForm(false);
      await loadTables();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function deleteTable(id: string) {
    if (!confirm("Delete this table?")) return;
    try {
      await api.request<void>(`/admin/tables/${id}`, { method: "DELETE" });
      await loadTables();
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--color-navy)]" />
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Table Management</h1>
          <p className="text-sm text-gray-500">
            Manage tables and their QR codes
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <i className="fa-solid fa-plus" />
          Add Table
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Add New Table</h3>
          <form onSubmit={addTable} className="flex items-end gap-4">
            <div className="w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Table Number
              </label>
              <input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="e.g. A1"
                required
              />
            </div>
            <div className="w-32">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Capacity
              </label>
              <input
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-50">
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : "Add"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="card py-16 text-center">
          <i className="fa-solid fa-chair mb-3 text-4xl text-gray-300" />
          <p className="text-gray-500">No tables configured</p>
          <button onClick={() => setShowForm(true)} className="btn btn-primary mt-4">
            Add Your First Table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <div key={table.id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-white text-lg font-bold">
                    {table.number}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      Table {table.number}
                    </p>
                    <p className="text-sm text-gray-500">
                      {table.capacity} seats
                    </p>
                  </div>
                </div>
                <span className={`badge ${table.isActive ? "badge-green" : "badge-gray"}`}>
                  {table.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              {table.qrCodeUrl && (
                <div className="mb-3 flex justify-center rounded-xl bg-white p-4 border border-gray-100">
                  <img
                    src={table.qrCodeUrl}
                    alt={`QR Code for Table ${table.number}`}
                    className="h-36 w-36"
                  />
                </div>
              )}

              <div className="flex gap-2">
                {table.qrCodeUrl && (
                  <button
                    onClick={() => setPrintTable(table.id === printTable ? null : table.id)}
                    className="btn btn-sm flex-1"
                  >
                    <i className="fa-solid fa-print" />
                    Print QR
                  </button>
                )}
                <button
                  onClick={() => deleteTable(table.id)}
                  className="btn btn-sm text-red-500"
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>

              {printTable === table.id && (
                <div className="mt-3 rounded-xl bg-gray-50 p-3 text-center text-sm text-gray-500">
                  <p className="font-medium text-gray-700">Print Instructions</p>
                  <p className="mt-1">Right-click the QR code above and select &quot;Print&quot; or save the image first.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
