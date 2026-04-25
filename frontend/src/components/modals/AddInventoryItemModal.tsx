'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddInventoryItemForm({ storeId, token: _token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/stores/${storeId}/inventory`, undefined, {
        method: 'POST',
        body: JSON.stringify({
          name, current_stock: parseFloat(stock) || 0, unit,
          reorder_level: parseFloat(reorderLevel) || 0,
          cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : null,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="aiif-0">
        <label className="aiif-1">Ingredient Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Arabica Coffee Beans" />
      </div>
      <div className="aiif-2">
        <div>
          <label className="aiif-3">Current Stock</label>
          <input type="number" step="0.01" value={stock} onChange={e => setStock(e.target.value)} required />
        </div>
        <div>
          <label className="aiif-4">Unit</label>
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="kg">kg</option>
            <option value="litre">litre</option>
            <option value="pcs">pcs</option>
            <option value="g">g</option>
            <option value="ml">ml</option>
          </select>
        </div>
      </div>
      <div className="aiif-5">
        <div>
          <label className="aiif-6">Reorder Level</label>
          <input type="number" step="0.01" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} />
        </div>
        <div>
          <label className="aiif-7">Cost per Unit (RM)</label>
          <input type="number" step="0.01" value={costPerUnit} onChange={e => setCostPerUnit(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary aiif-8"  disabled={saving}>
        {saving ? 'Saving...' : 'Add Ingredient'}
      </button>
    </form>
  );
}
