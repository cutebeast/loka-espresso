"use client";

import { useState, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import type { MenuCategory, MenuItem } from "@/lib/types";

interface CategoryForm {
  name: string;
  icon: string;
  sortOrder: number;
}

interface ItemForm {
  name: string;
  description: string;
  price: string;
  category: string;
  isAvailable: boolean;
  preparationTime: string;
  image: string;
}

const EMPTY_CATEGORY: CategoryForm = { name: "", icon: "", sortOrder: 0 };
const EMPTY_ITEM: ItemForm = {
  name: "",
  description: "",
  price: "",
  category: "",
  isAvailable: true,
  preparationTime: "",
  image: "",
};

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);

  const loadMenu = useCallback(async () => {
    try {
      const data = await api.request<MenuCategory[]>("/admin/menu");
      setCategories(data);
      if (data.length > 0 && !activeCategory) {
        setActiveCategory(data[0].id);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  async function saveCategory() {
    setSaving(true);
    try {
      if (editingCategoryId) {
        await api.request<MenuCategory>(`/admin/menu/categories/${editingCategoryId}`, {
          method: "PATCH",
          body: JSON.stringify(categoryForm),
        });
      } else {
        await api.request<MenuCategory>("/admin/menu/categories", {
          method: "POST",
          body: JSON.stringify(categoryForm),
        });
      }
      setShowCategoryModal(false);
      setEditingCategoryId(null);
      setCategoryForm(EMPTY_CATEGORY);
      await loadMenu();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category and all its items?")) return;
    try {
      await api.request<void>(`/admin/menu/categories/${id}`, { method: "DELETE" });
      await loadMenu();
    } catch {}
  }

  async function saveItem() {
    setSaving(true);
    try {
      const payload = {
        ...itemForm,
        price: parseFloat(itemForm.price) || 0,
        preparationTime: parseInt(itemForm.preparationTime) || undefined,
      };
      if (editingItemId) {
        await api.request<MenuItem>(`/admin/menu/items/${editingItemId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api.request<MenuItem>("/admin/menu/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowItemModal(false);
      setEditingItemId(null);
      setItemForm(EMPTY_ITEM);
      await loadMenu();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailability(item: MenuItem) {
    try {
      await api.request<MenuItem>(`/admin/menu/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isAvailable: !item.isAvailable }),
      });
      await loadMenu();
    } catch {}
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    try {
      await api.request<void>(`/admin/menu/items/${id}`, { method: "DELETE" });
      await loadMenu();
    } catch {}
  }

  function openEditCategory(cat: MenuCategory) {
    setEditingCategoryId(cat.id);
    setCategoryForm({ name: cat.name, icon: cat.icon ?? "", sortOrder: cat.sortOrder });
    setShowCategoryModal(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      description: item.description ?? "",
      price: String(item.price),
      category: item.category,
      isAvailable: item.isAvailable,
      preparationTime: String(item.preparationTime ?? ""),
      image: item.image ?? "",
    });
    setShowItemModal(true);
  }

  function openAddItem() {
    setEditingItemId(null);
    setItemForm({ ...EMPTY_ITEM, category: activeCategory ?? "" });
    setShowItemModal(true);
  }

  const currentCategory = categories.find((c) => c.id === activeCategory);

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
          <h1 className="text-2xl font-bold text-gray-900">Menu Management</h1>
          <p className="text-sm text-gray-500">Manage your menu categories and items</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingCategoryId(null);
              setCategoryForm(EMPTY_CATEGORY);
              setShowCategoryModal(true);
            }}
            className="btn"
          >
            <i className="fa-solid fa-folder-plus" />
            Add Category
          </button>
          <button onClick={openAddItem} className="btn btn-primary">
            <i className="fa-solid fa-plus" />
            Add Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Categories
            </h3>
            <div className="space-y-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm cursor-pointer transition-colors ${
                    activeCategory === cat.id
                      ? "bg-[var(--color-navy)]/5 text-[var(--color-navy)] font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <div className="flex items-center gap-2">
                    {cat.icon && <i className={`fa-solid ${cat.icon} w-4 text-center text-xs`} />}
                    <span>{cat.name}</span>
                    <span className="text-xs text-gray-400">({cat.items.length})</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }}
                      className="rounded p-1 text-gray-400 hover:text-[var(--color-navy)]"
                    >
                      <i className="fa-solid fa-pen text-xs" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                      className="rounded p-1 text-gray-400 hover:text-red-500"
                    >
                      <i className="fa-solid fa-trash text-xs" />
                    </button>
                  </div>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-400">No categories</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {currentCategory?.name ?? "Select a category"}
              </h2>
              {currentCategory && (
                <span className="text-sm text-gray-500">
                  {currentCategory.items.length} items
                </span>
              )}
            </div>

            {currentCategory && currentCategory.items.length === 0 ? (
              <div className="py-12 text-center">
                <i className="fa-solid fa-utensils mb-3 text-4xl text-gray-300" />
                <p className="text-gray-500">No items in this category</p>
                <button onClick={openAddItem} className="btn btn-primary mt-4">
                  <i className="fa-solid fa-plus" />
                  Add First Item
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Price</th>
                      <th>Prep Time</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentCategory?.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            {item.image ? (
                              <img
                                src={item.image}
                                alt={item.name}
                                className="h-10 w-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                                <i className="fa-solid fa-image text-gray-400" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{item.name}</p>
                              {item.description && (
                                <p className="text-xs text-gray-400 line-clamp-1">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="font-medium">${item.price.toFixed(2)}</td>
                        <td className="text-gray-500">
                          {item.preparationTime ? `${item.preparationTime} min` : "—"}
                        </td>
                        <td>
                          <button
                            onClick={() => toggleAvailability(item)}
                            className={`badge cursor-pointer ${
                              item.isAvailable ? "badge-green" : "badge-red"
                            }`}
                          >
                            {item.isAvailable ? "Available" : "Unavailable"}
                          </button>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEditItem(item)}
                              className="btn btn-sm"
                            >
                              <i className="fa-solid fa-pen text-xs" />
                            </button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="btn btn-sm text-red-500"
                            >
                              <i className="fa-solid fa-trash text-xs" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingCategoryId ? "Edit Category" : "Add Category"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <input
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="Category name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Icon (Font Awesome)</label>
                <input
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                  placeholder="e.g. fa-burger"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Sort Order</label>
                <input
                  type="number"
                  value={categoryForm.sortOrder}
                  onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowCategoryModal(false)} className="btn">Cancel</button>
              <button onClick={saveCategory} disabled={saving} className="btn btn-primary disabled:opacity-50">
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingItemId ? "Edit Item" : "Add Item"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                <input
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="Item name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  placeholder="Item description"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Prep Time (min)</label>
                  <input
                    type="number"
                    value={itemForm.preparationTime}
                    onChange={(e) => setItemForm({ ...itemForm, preparationTime: e.target.value })}
                    placeholder="15"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={itemForm.category}
                  onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Image URL</label>
                <input
                  value={itemForm.image}
                  onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemForm.isAvailable}
                  onChange={(e) => setItemForm({ ...itemForm, isAvailable: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">Available</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setShowItemModal(false)} className="btn">Cancel</button>
              <button onClick={saveItem} disabled={saving} className="btn btn-primary disabled:opacity-50">
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
