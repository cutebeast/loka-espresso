"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import type { Voucher } from "@/lib/types";

interface VoucherForm {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minOrderAmount: string;
  maxDiscount: string;
  maxUses: string;
  startsAt: string;
  expiresAt: string;
}

const EMPTY_FORM: VoucherForm = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minOrderAmount: "",
  maxDiscount: "",
  maxUses: "",
  startsAt: "",
  expiresAt: "",
};

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VoucherForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadVouchers = useCallback(async () => {
    try {
      const data = await api.request<Voucher[]>("/admin/vouchers");
      setVouchers(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVouchers();
  }, [loadVouchers]);

  async function saveVoucher() {
    setSaving(true);
    try {
      const payload = {
        code: form.code.toUpperCase(),
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue) || 0,
        minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : undefined,
        maxDiscount: form.maxDiscount ? parseFloat(form.maxDiscount) : undefined,
        maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
        startsAt: form.startsAt || undefined,
        expiresAt: form.expiresAt || undefined,
      };
      if (editingId) {
        await api.request<Voucher>(`/admin/vouchers/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api.request<Voucher>("/admin/vouchers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadVouchers();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function deactivateVoucher(id: string) {
    try {
      await api.request<Voucher>(`/admin/vouchers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isValid: false }),
      });
      await loadVouchers();
    } catch {}
  }

  function openEdit(voucher: Voucher) {
    setEditingId(voucher.id);
    setForm({
      code: voucher.code,
      description: voucher.description ?? "",
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      minOrderAmount: voucher.minOrderAmount ? String(voucher.minOrderAmount) : "",
      maxDiscount: voucher.maxDiscount ? String(voucher.maxDiscount) : "",
      maxUses: "",
      startsAt: "",
      expiresAt: voucher.expiresAt ?? "",
    });
    setShowModal(true);
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
          <h1 className="text-2xl font-bold text-gray-900">Vouchers</h1>
          <p className="text-sm text-gray-500">
            Create and manage discount vouchers
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY_FORM);
            setShowModal(true);
          }}
          className="btn btn-primary"
        >
          <i className="fa-solid fa-plus" />
          Create Voucher
        </button>
      </div>

      {vouchers.length === 0 ? (
        <div className="card py-16 text-center">
          <i className="fa-solid fa-ticket mb-3 text-4xl text-gray-300" />
          <p className="text-gray-500">No vouchers yet</p>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary mt-4"
          >
            Create Your First Voucher
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vouchers.map((voucher) => (
            <div key={voucher.id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-[var(--color-navy)]">
                    {voucher.code}
                  </span>
                  <span
                    className={`badge ${voucher.isValid ? "badge-green" : "badge-gray"}`}
                  >
                    {voucher.isValid ? "Active" : "Inactive"}
                  </span>
                </div>
                <button
                  onClick={() => openEdit(voucher)}
                  className="rounded p-1 text-gray-400 hover:text-[var(--color-navy)]"
                >
                  <i className="fa-solid fa-pen text-sm" />
                </button>
              </div>

              {voucher.description && (
                <p className="mb-3 text-sm text-gray-500">{voucher.description}</p>
              )}

              <div className="mb-3 rounded-xl bg-[var(--color-bg)] p-3">
                <p className="text-2xl font-bold text-[var(--color-navy)]">
                  {voucher.discountType === "percentage"
                    ? `${voucher.discountValue}%`
                    : `$${voucher.discountValue.toFixed(2)}`}
                  <span className="text-sm font-normal text-gray-500"> OFF</span>
                </p>
                {voucher.minOrderAmount && (
                  <p className="text-xs text-gray-500">
                    Min. order: ${voucher.minOrderAmount.toFixed(2)}
                  </p>
                )}
                {voucher.maxDiscount && (
                  <p className="text-xs text-gray-500">
                    Max discount: ${voucher.maxDiscount.toFixed(2)}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between text-sm">
                {voucher.expiresAt && (
                  <span className="text-gray-400">
                    Exp: {new Date(voucher.expiresAt).toLocaleDateString()}
                  </span>
                )}
                {voucher.isValid && (
                  <button
                    onClick={() => deactivateVoucher(voucher.id)}
                    className="text-red-500 hover:underline"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingId ? "Edit Voucher" : "Create Voucher"}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Code</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="SUMMER2024"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Discount Type</label>
                  <select
                    value={form.discountType}
                    onChange={(e) =>
                      setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })
                    }
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Discount Value {form.discountType === "percentage" ? "(%)" : "($)"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    placeholder="10"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Min Order ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.minOrderAmount}
                    onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Max Discount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.maxDiscount}
                    onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                    placeholder="No limit"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Max Uses</label>
                  <input
                    type="number"
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Starts At</label>
                  <input
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Expires At</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="btn">
                Cancel
              </button>
              <button
                onClick={saveVoucher}
                disabled={saving}
                className="btn btn-primary disabled:opacity-50"
              >
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
