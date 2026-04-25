'use client';

import React, { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { AddCustomizationForm } from '@/components/Modals';
import type { MerchantMenuItem } from '@/lib/merchant-types';

interface CustomizationManagerProps {
  storeId: number;
  item: MerchantMenuItem;
  token: string;
  onClose: () => void;
}

export default function CustomizationManager({ storeId, item, token, onClose }: CustomizationManagerProps) {
  const [options, setOptions] = useState<Array<{ id: number; name: string; price_adjustment: number; is_active: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/items/${item.id}/customizations`);
      if (res.ok) setOptions(await res.json());
    } catch (err) { console.error('Failed to fetch customizations:', err); } finally { setLoading(false); }
  }, [item.id]);

  React.useEffect(() => { loadOptions(); }, [loadOptions]);

  async function deleteOption(optId: number) {
    await apiFetch(`/admin/customizations/${optId}`, undefined, { method: 'DELETE' });
    loadOptions();
  }

  return (
    <div>
      <AddCustomizationForm storeId={storeId} itemId={item.id} token={token} onClose={loadOptions} />
      <div style={{ marginTop: 20, borderTop: '1px solid #EDF2F8', paddingTop: 16 }}>
        <h4 style={{ marginBottom: 12 }}>Current Options ({options.length})</h4>
        {loading ? <div style={{ color: '#64748B' }}>Loading...</div> : options.length === 0 ? (
          <div style={{ color: '#94A3B8', textAlign: 'center', padding: 20 }}>No customization options yet</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {options.map(opt => (
              <div key={opt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F8FAFC', borderRadius: 10 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{opt.name}</span>
                  {opt.price_adjustment > 0 && <span style={{ marginLeft: 8, color: '#059669', fontWeight: 600 }}>+RM {opt.price_adjustment.toFixed(2)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${opt.is_active ? 'badge-green' : 'badge-gray'}`}>{opt.is_active ? 'Active' : 'Inactive'}</span>
                  <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => deleteOption(opt.id)}><i className="fas fa-trash"></i></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
