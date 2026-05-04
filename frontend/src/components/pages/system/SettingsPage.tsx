'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/merchant-api';

interface ConfigDef {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'string' | 'boolean';
}

const CONFIG_GROUPS: { label: string; icon: string; items: ConfigDef[] }[] = [
  {
    label: 'Order Settings',
    icon: 'fa-receipt',
    items: [
      { key: 'delivery_fee', label: 'Delivery Fee (RM)', description: 'Standard delivery fee charged to customers', type: 'number' },
      { key: 'min_order_delivery', label: 'Min Order for Delivery (RM)', description: 'Minimum order amount required for delivery orders', type: 'number' },
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
    label: 'Referral Settings',
    icon: 'fa-user-plus',
    items: [
      { key: 'referral_reward_points', label: 'Reward Points', description: 'Loyalty points awarded to referrer when referral places first order', type: 'number' },
      { key: 'referral_min_orders', label: 'Min Orders', description: 'Minimum orders the referred user must place before referrer gets reward', type: 'number' },
    ],
  },
  {
    label: 'Integrations',
    icon: 'fa-plug',
    items: [
      { key: 'pos_integration_enabled', label: 'POS Integration', description: 'Enable POS API integration (applies to all stores)', type: 'boolean' },
      { key: 'delivery_integration_enabled', label: 'Delivery Integration', description: 'Enable delivery API integration (applies to all stores)', type: 'boolean' },
      { key: 'payment_gateway_provider', label: 'Payment Gateway', description: 'Provider name (e.g. stripe, touchngo, none)', type: 'string' },
    ],
  },
  {
    label: 'Auth Settings',
    icon: 'fa-shield',
    items: [
      { key: 'otp_rate_limit', label: 'OTP Rate Limit', description: 'Max OTP requests per minute per IP (0 = unlimited)', type: 'number' },
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

export default function SettingsPage() {
  const [configs, setConfigs] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedKeys, setSavedKeys] = useState<Record<string, 'ok' | 'err'>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    setLoading(true);
    setError('');
    try {
      const allKeys = CONFIG_GROUPS.flatMap(g => g.items.map(i => i.key));
      const params = new URLSearchParams();
      for (const k of allKeys) { params.append('key', k); }
      const res = await apiFetch(`/admin/config?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const configs = data.configs || {};
        setConfigs(configs);
        const vals: Record<string, string> = {};
        for (const [k, v] of Object.entries(configs)) {
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
      const res = await apiFetch(`/admin/config?key=${encodeURIComponent(key)}`, undefined, {
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
      <div className="set-0">
        <i className="fas fa-spinner fa-spin"></i> Loading settings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="set-1">
        <i className="fas fa-exclamation-circle"></i> {error}
      </div>
    );
  }

  return (
    <div className="set-2">
      <div className="set-3">
        {CONFIG_GROUPS.map(group => (
          <div
            key={group.label}
            className="set-4"
          >
            <div
              className="set-5"
            >
              <span className="set-6"><i className={`fas ${group.icon}`}></i></span>
              <h3 className="set-7">{group.label}</h3>
            </div>
            <div className="set-8">
              {group.items.map(item => {
                const currentVal = editValues[item.key] ?? '';
                const status = savedKeys[item.key];
                const saving = savingKeys[item.key];
                const changed = currentVal !== String(configs[item.key] ?? '');

                return (
                  <div
                    key={item.key}
                    className="set-9"
                  >
                    <div className="set-10">
                      <div className="set-11">
                        {item.label}
                      </div>
                      <div className="set-12">{item.description}</div>
                    </div>
                    <div className="set-13">
                      {item.type === 'boolean' ? (
                        <select
                          value={currentVal}
                          onChange={e => {
                            setEditValues(prev => ({ ...prev, [item.key]: e.target.value }));
                            setSavedKeys(prev => {
                              const next = { ...prev };
                              delete next[item.key];
                              return next;
                            });
                          }}
                          className="set-14"
                        >
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      ) : (
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
                          className="set-14"
                        />
                      )}
                      <button
                        className="btn btn-primary set-save-btn"
                        style={{
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
                        <span className="set-15">
                          <i className="fas fa-check-circle"></i> Saved
                        </span>
                      )}
                      {status === 'err' && (
                        <span className="set-16">
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
