'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';

interface PWASettingsPageProps {
  token: string;
}

interface PWAVersionInfo {
  version: string;
  build_date: string;
  cache_name: string;
}

const CONFIG_GROUPS: { label: string; icon: string }[] = [
  { label: 'Authentication', icon: 'fa-shield-alt' },
  { label: 'Phone Format', icon: 'fa-phone' },
  { label: 'Version & Cache', icon: 'fa-sync-alt' },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{
      position: 'relative',
      display: 'inline-block',
      width: 44,
      height: 24,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: checked ? THEME.primary : THEME.bgMuted,
        transition: '0.3s',
        borderRadius: 24,
      }}>
        <span style={{
          position: 'absolute',
          height: 18,
          width: 18,
          left: checked ? 23 : 3,
          bottom: 3,
          backgroundColor: 'white',
          transition: '0.3s',
          borderRadius: '50%',
        }} />
      </span>
    </label>
  );
}

export default function PWASettingsPage({ token }: PWASettingsPageProps) {
  const [configs, setConfigs] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedKeys, setSavedKeys] = useState<Record<string, 'ok' | 'err'>>({});
  const [savingKeys, setSavingKeys] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  
  // Version and cache management
  const [versionInfo, setVersionInfo] = useState<PWAVersionInfo | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchVersionInfo();
  }, [token]);

  async function fetchConfig() {
    setLoading(true);
    setError('');
    try {
      const editableKeys = ['otp_bypass_enabled', 'otp_bypass_code', 'pwa_phone_country_code'];
      const adminRes = await apiFetch(`/admin/config?${editableKeys.map((key) => `key=${encodeURIComponent(key)}`).join('&')}`, token);
      const publicRes = await apiFetch('/config', token);
      if (!adminRes.ok || !publicRes.ok) {
        setError('Failed to load config');
        return;
      }

      const adminData = await adminRes.json();
      const publicData = await publicRes.json();
      const data = {
        ...publicData,
        ...(adminData.configs || {}),
      };

      setConfigs(data);
      const vals: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        vals[k] = String(v ?? '');
      }
      if (!vals.pwa_phone_country_code) vals.pwa_phone_country_code = '+60';
      if (!vals.otp_bypass_enabled) vals.otp_bypass_enabled = 'false';
      if (!vals.otp_bypass_code) vals.otp_bypass_code = '';
      setEditValues(vals);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchVersionInfo() {
    setVersionLoading(true);
    try {
      // Fetch manifest from customer PWA
      const res = await fetch('https://app.loyaltysystem.uk/manifest.json', {
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setVersionInfo({
          version: data.version || '1.0.0',
          build_date: data.build_date || new Date().toISOString(),
          cache_name: `loka-pwa-v${data.version || '1.0.0'}`,
        });
      }
    } catch {
      // Fallback - try localhost
      try {
        const res = await fetch('http://localhost:3002/manifest.json', {
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          setVersionInfo({
            version: data.version || '1.0.0',
            build_date: data.build_date || new Date().toISOString(),
            cache_name: `loka-pwa-v${data.version || '1.0.0'}`,
          });
        }
      } catch {
        setVersionInfo(null);
      }
    } finally {
      setVersionLoading(false);
    }
  }

  async function triggerNewBuild() {
    setVersionLoading(true);
    setCacheCleared(false);
    try {
      // Call backend to trigger build
      const res = await apiFetch('/admin/pwa/rebuild', token, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setVersionInfo({
          version: data.version || '1.0.0',
          build_date: data.build_date || new Date().toISOString(),
          cache_name: `loka-pwa-v${data.version || '1.0.0'}`,
        });
        setCacheCleared(true);
      } else {
        setError('Failed to trigger build');
      }
    } catch {
      setError('Network error during rebuild');
    } finally {
      setVersionLoading(false);
    }
  }

  async function clearPWACache() {
    setClearingCache(true);
    setCacheCleared(false);
    try {
      // Call backend to clear cache
      const res = await apiFetch('/admin/pwa/clear-cache', token, {
        method: 'POST',
      });
      if (res.ok) {
        setCacheCleared(true);
        // Refresh version info
        await fetchVersionInfo();
      } else {
        setError('Failed to clear cache');
      }
    } catch {
      setError('Network error during cache clear');
    } finally {
      setClearingCache(false);
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
        <i className="fas fa-spinner fa-spin"></i> Loading PWA settings...
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

  const bypassEnabled = editValues.otp_bypass_enabled?.toLowerCase() === 'true';
  const bypassCode = editValues.otp_bypass_code ?? '';

  return (
    <div style={{ maxWidth: 900 }}>
      {/* OTP Bypass Warning Banner */}
      {bypassEnabled && (
        <div style={{
          background: 'rgba(209, 142, 56, 0.08)',
          border: `1px solid ${THEME.accentCopper}`,
          borderRadius: 12,
          padding: '12px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <i className="fas fa-exclamation-triangle" style={{ color: THEME.accentCopper, fontSize: 14 }}></i>
          <span style={{ fontSize: 13, color: THEME.textSecondary }}>
            OTP Bypass is <strong style={{ color: THEME.accentCopper }}>ACTIVE</strong>. Customers can sign in without a real OTP. Disable before going live.
          </span>
        </div>
      )}

      {/* Authentication Group */}
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: `1px solid ${THEME.accentLight}`,
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${THEME.accentLight}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: THEME.bgMuted,
        }}>
          <i className="fas fa-shield-alt" style={{ color: THEME.primary, fontSize: 16 }}></i>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: THEME.primary }}>Authentication</h3>
        </div>

        {/* Enable Toggle Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
          borderBottom: `1px solid ${THEME.accentLight}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 2 }}>
              Enable OTP Bypass
              {bypassEnabled && (
                <span style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  background: THEME.accentCopper,
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: 6,
                }}>Active</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: THEME.success }}>
              Allow sign-in with a fixed code instead of real OTP. For testing only.
            </div>
          </div>
          <Toggle
            checked={bypassEnabled}
            onChange={(v) => {
              setEditValues(prev => ({ ...prev, otp_bypass_enabled: v ? 'true' : 'false' }));
              setSavedKeys({});
            }}
          />
        </div>

        {/* Bypass Code Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
          opacity: bypassEnabled ? 1 : 0.5,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 2 }}>
              Bypass Code
            </div>
            <div style={{ fontSize: 12, color: THEME.success }}>
              The code customers can use instead of a real OTP
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              value={bypassCode}
              onChange={(e) => {
                setEditValues(prev => ({ ...prev, otp_bypass_code: e.target.value.replace(/[^0-9]/g, '').slice(0, 10) }));
                setSavedKeys(prev => {
                  const next = { ...prev };
                  delete next['otp_bypass_code'];
                  return next;
                });
              }}
              placeholder="e.g. 111111"
              maxLength={10}
              disabled={!bypassEnabled}
              style={{
                width: 140,
                textAlign: 'center',
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${THEME.accentLight}`,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 3,
                background: bypassEnabled ? 'white' : THEME.bgMuted,
                color: bypassEnabled ? THEME.textPrimary : THEME.textMuted,
              }}
            />
            <button
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: 13 }}
              disabled={!bypassEnabled || savingKeys['otp_bypass_code'] || bypassCode === String(configs['otp_bypass_code'] ?? '')}
              onClick={() => saveConfig('otp_bypass_code')}
            >
              {savingKeys['otp_bypass_code'] ? (
                <><i className="fas fa-spinner fa-spin"></i></>
              ) : (
                <><i className="fas fa-save"></i></>
              )}
            </button>
            {savedKeys['otp_bypass_code'] === 'ok' && (
              <span style={{ color: THEME.primary, fontSize: 12, fontWeight: 600 }}>
                <i className="fas fa-check-circle"></i>
              </span>
            )}
            {savedKeys['otp_bypass_code'] === 'err' && (
              <span style={{ color: '#DC2626', fontSize: 12, fontWeight: 600 }}>
                <i className="fas fa-exclamation-circle"></i>
              </span>
            )}
          </div>
        </div>

        {/* Enable Save Button */}
        {editValues.otp_bypass_enabled !== String(configs.otp_bypass_enabled ?? '') && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 24px 16px',
          }}>
            <button
              className="btn btn-primary"
              style={{ padding: '8px 24px', fontSize: 14 }}
              disabled={savingKeys['otp_bypass_enabled']}
              onClick={() => saveConfig('otp_bypass_enabled')}
            >
              {savingKeys['otp_bypass_enabled'] ? (
                <><i className="fas fa-spinner fa-spin"></i> Saving</>
              ) : (
                <><i className="fas fa-save"></i> Save</>
              )}
            </button>
            {savedKeys['otp_bypass_enabled'] === 'ok' && (
              <span style={{ color: THEME.primary, fontSize: 13, fontWeight: 600 }}>
                <i className="fas fa-check-circle"></i> Saved
              </span>
            )}
            {savedKeys['otp_bypass_enabled'] === 'err' && (
              <span style={{ color: '#DC2626', fontSize: 13, fontWeight: 600 }}>
                <i className="fas fa-exclamation-circle"></i> Error
              </span>
            )}
          </div>
        )}
      </div>

      {/* Phone Format Group */}
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: `1px solid ${THEME.accentLight}`,
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${THEME.accentLight}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: THEME.bgMuted,
        }}>
          <i className="fas fa-phone" style={{ color: THEME.primary, fontSize: 16 }}></i>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: THEME.primary }}>Phone Format</h3>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 2 }}>
              Default Country Code
            </div>
            <div style={{ fontSize: 12, color: THEME.success }}>
              Prepended to phone numbers on the PWA (default: +60 for Malaysia)
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              value={editValues.pwa_phone_country_code ?? '+60'}
              onChange={(e) => {
                setEditValues(prev => ({ ...prev, pwa_phone_country_code: e.target.value }));
                setSavedKeys(prev => {
                  const next = { ...prev };
                  delete next['pwa_phone_country_code'];
                  return next;
                });
              }}
              placeholder="+60"
              style={{
                width: 80,
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
              style={{ padding: '6px 14px', fontSize: 13 }}
              disabled={savingKeys['pwa_phone_country_code'] || editValues.pwa_phone_country_code === String(configs.pwa_phone_country_code ?? '+60')}
              onClick={() => saveConfig('pwa_phone_country_code')}
            >
              {savingKeys['pwa_phone_country_code'] ? (
                <><i className="fas fa-spinner fa-spin"></i></>
              ) : (
                <><i className="fas fa-save"></i></>
              )}
            </button>
            {savedKeys['pwa_phone_country_code'] === 'ok' && (
              <span style={{ color: THEME.primary, fontSize: 12, fontWeight: 600 }}>
                <i className="fas fa-check-circle"></i>
              </span>
            )}
            {savedKeys['pwa_phone_country_code'] === 'err' && (
              <span style={{ color: '#DC2626', fontSize: 12, fontWeight: 600 }}>
                <i className="fas fa-exclamation-circle"></i>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Version & Cache Management */}
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: `1px solid ${THEME.accentLight}`,
        overflow: 'hidden',
        marginBottom: 24,
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${THEME.accentLight}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: THEME.bgMuted,
        }}>
          <i className="fas fa-sync-alt" style={{ color: THEME.primary, fontSize: 16 }}></i>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: THEME.primary }}>Version & Cache</h3>
        </div>

        {/* Current Version */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
          borderBottom: `1px solid ${THEME.accentLight}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 2 }}>
              Current Version
            </div>
            <div style={{ fontSize: 12, color: THEME.success }}>
              {versionLoading ? 'Loading...' : versionInfo ? `Build: ${versionInfo.build_date}` : 'Unable to fetch version'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: THEME.primary,
              fontFamily: 'monospace',
            }}>
              {versionInfo?.version || '—'}
            </div>
            <div style={{ fontSize: 11, color: THEME.textMuted }}>
              {versionInfo?.cache_name}
            </div>
          </div>
        </div>

        {/* Force Update Button */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
          borderBottom: `1px solid ${THEME.accentLight}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 2 }}>
              Force PWA Update
            </div>
            <div style={{ fontSize: 12, color: THEME.success }}>
              Trigger a new build with incremented version. Forces all users to update.
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: '8px 20px', fontSize: 14 }}
            disabled={versionLoading}
            onClick={triggerNewBuild}
          >
            {versionLoading ? (
              <><i className="fas fa-spinner fa-spin"></i> Building...</>
            ) : (
              <><i className="fas fa-hammer"></i> New Build</>
            )}
          </button>
        </div>

        {/* Clear Cache Button */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 2 }}>
              Clear Service Worker Cache
            </div>
            <div style={{ fontSize: 12, color: THEME.success }}>
              Remove old cached files without rebuilding. Users will get fresh content on next visit.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn btn-secondary"
              style={{ 
                padding: '8px 20px', 
                fontSize: 14,
                background: 'transparent',
                border: `1px solid ${THEME.primary}`,
                color: THEME.primary,
              }}
              disabled={clearingCache}
              onClick={clearPWACache}
            >
              {clearingCache ? (
                <><i className="fas fa-spinner fa-spin"></i> Clearing...</>
              ) : (
                <><i className="fas fa-trash-alt"></i> Clear Cache</>
              )}
            </button>
            {cacheCleared && (
              <span style={{ color: THEME.primary, fontSize: 12, fontWeight: 600 }}>
                <i className="fas fa-check-circle"></i> Done
              </span>
            )}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{
        padding: '16px 24px',
        borderRadius: 16,
        background: 'white',
        border: `1px solid ${THEME.accentLight}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.primary, marginBottom: 10 }}>
          <i className="fas fa-info-circle" style={{ marginRight: 8 }}></i>
          How OTP Bypass Works
        </div>
        <ol style={{ fontSize: 12, color: THEME.textMuted, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li>Enable the toggle above to turn on bypass mode</li>
          <li>Set a numeric code (e.g. 111111) and save it</li>
          <li>On the PWA, the customer enters their phone number and taps Send OTP</li>
          <li>Instead of waiting for a real SMS, they enter the bypass code</li>
          <li>The system skips real OTP validation and logs them in immediately</li>
          <li><strong style={{ color: '#DC2626' }}>Disable the toggle before going live!</strong></li>
        </ol>
      </div>
    </div>
  );
}
