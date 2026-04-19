'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';

interface SettingsPageProps {
  token: string;
}

interface ConfigDef {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'string';
}

const CONFIG_GROUPS: { label: string; icon: string; items: ConfigDef[] }[] = [
  {
    label: 'Order Settings',
    icon: 'fa-receipt',
    items: [
      { key: 'delivery_fee', label: 'Delivery Fee (RM)', description: 'Standard delivery fee charged to customers', type: 'number' },
      { key: 'min_order', label: 'Min Order (RM)', description: 'Minimum order amount for delivery', type: 'number' },
      { key: 'min_delivery_order', label: 'Min Order for Delivery (RM)', description: 'Minimum order amount required for delivery', type: 'number' },
      { key: 'currency', label: 'Currency', description: 'Default currency code for all prices', type: 'string' },
    ],
  },
  {
    label: 'Loyalty Settings',
    icon: 'fa-medal',
    items: [
      { key: 'earn_rate', label: 'Earn Rate', description: 'Points earned per RM1 spent', type: 'number' },
    ],
  },
  {
    label: 'Store Settings',
    icon: 'fa-store',
    items: [
      { key: 'pickup_lead_minutes', label: 'Pickup Lead Time (min)', description: 'Default lead time in minutes for pickup orders', type: 'number' },
    ],
  },
];

export default function SettingsPage({ token }: SettingsPageProps) {
  const [configs, setConfigs] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedKeys, setSavedKeys] = useState<Record<string, 'ok' | 'err'>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfig();
  }, [token]);

  async function fetchConfig() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/config', token);
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
        const vals: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          vals[k] = String(v);
        }
        setEditValues(vals);
      } else {
        setError('Failed to load config');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig(key: string) {
    const raw = editValues[key] ?? '';
    const body = { value: raw };
    setSavingKeys(prev => ({ ...prev, [key]: true }));
    setSavedKeys(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const res = await apiFetch(`/admin/config?key=${encodeURIComponent(key)}`, token, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setConfigs(prev => ({ ...prev, [key]: raw }));
        setSavedKeys(prev => ({ ...prev, [key]: 'ok' }));
      } else {
        setSavedKeys(prev => ({ ...prev, [key]: 'err' }));
      }
    } catch {
      setSavedKeys(prev => ({ ...prev, [key]: 'err' }));
    } finally {
      setSavingKeys(prev => ({ ...prev, [key]: false }));
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: THEME.success }}>
        <i className="fas fa-spinner fa-spin"></i> Loading settings...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '12px 16px', borderRadius: 10 }}>
        <i className="fas fa-exclamation-circle"></i> {error}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'grid', gap: 24 }}>
        {CONFIG_GROUPS.map(group => (
          <div
            key={group.label}
            style={{
              background: 'white',
              borderRadius: 16,
              border: `1px solid ${THEME.accentLight}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 24px',
                borderBottom: `1px solid ${THEME.accentLight}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: THEME.bgMuted,
              }}
            >
              <i className={`fas ${group.icon}`} style={{ color: THEME.primary, fontSize: 16 }}></i>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: THEME.primary }}>{group.label}</h3>
            </div>
            <div style={{ padding: '8px 24px 20px' }}>
              {group.items.map(item => {
                const currentVal = editValues[item.key] ?? '';
                const status = savedKeys[item.key];
                const saving = savingKeys[item.key];
                const changed = currentVal !== String(configs[item.key] ?? '');

                return (
                  <div
                    key={item.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '14px 0',
                      borderBottom: `1px solid ${THEME.accentLight}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 2 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 12, color: THEME.success }}>{item.description}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type={item.type === 'number' ? 'number' : 'text'}
                        step={item.type === 'number' ? 'any' : undefined}
                        value={currentVal}
                        onChange={e => {
                          setEditValues(prev => ({ ...prev, [item.key]: e.target.value }));
                          setSavedKeys(prev => {
                            const next = { ...prev };
                            delete next[item.key];
                            return next;
                          });
                        }}
                        style={{
                          width: 140,
                          textAlign: 'right',
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: `1px solid ${THEME.accentLight}`,
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      />
                      <button
                        className="btn btn-primary"
                        style={{
                          padding: '6px 14px',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          opacity: !changed || saving ? 0.5 : 1,
                        }}
                        disabled={!changed || saving}
                        onClick={() => saveConfig(item.key)}
                      >
                        {saving ? (
                          <><i className="fas fa-spinner fa-spin"></i> Saving</>
                        ) : (
                          <><i className="fas fa-save"></i> Save</>
                        )}
                      </button>
                      {status === 'ok' && (
                        <span style={{ color: THEME.primary, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <i className="fas fa-check-circle"></i> Saved
                        </span>
                      )}
                      {status === 'err' && (
                        <span style={{ color: '#DC2626', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <i className="fas fa-exclamation-circle"></i> Error
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
