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
  const [options, setOptions] = useState<Array<{ id: number; name: string; option_type: string; price_adjustment: number; is_active: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/items/${item.id}/customizations`);
      if (res.ok) setOptions(await res.json());
    } catch (err) { console.error('Failed to fetch customizations:', err); } finally { setLoading(false); }
  }, [item.id]);

  React.useEffect(() => { loadOptions(); }, [loadOptions]);

  async function toggleOption(optId: number, currentActive: boolean) {
    await apiFetch(`/admin/customizations/${optId}`, undefined, { method: 'PUT', body: JSON.stringify({ is_active: !currentActive }) });
    loadOptions();
  }

  return (
    <div>
      <AddCustomizationForm storeId={storeId} itemId={item.id} token={token} onClose={loadOptions} />
      <div className="cm-0">
        <h4 className="cm-1">Current Options ({options.length})</h4>
        {loading ? <div className="cm-2">Loading...</div> : options.length === 0 ? (
          <div className="cm-3">No customization options yet</div>
        ) : (
          <div className="cm-4">
            {options.map(opt => (
              <div key={opt.id} className="cm-5">
                <div>
                  {opt.option_type && <span className="badge badge-blue cm-7">{opt.option_type}</span>}
                  <span className="cm-6">{opt.name}</span>
                  {opt.price_adjustment > 0 && <span className="cm-7">+RM {opt.price_adjustment.toFixed(2)}</span>}
                </div>
                <div className="cm-8">
                  <button className="btn btn-sm" onClick={() => toggleOption(opt.id, opt.is_active)} title={opt.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
                    <i className={`fas ${opt.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ fontSize: 20, color: opt.is_active ? '#16A34A' : '#9CA3AF' }}></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="cm-10">
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
