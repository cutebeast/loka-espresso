'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/merchant-api';

interface PWASettingsPageProps {
  token: string;
}

interface PWAVersionInfo {
  version: string;
  build_date: string;
  cache_name: string;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`psp-toggle-label ${disabled ? 'cursor-not-allowed opacity-0-5' : 'cursor-pointer opacity-1'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="t-0"
      />
      <span className={`psp-toggle-track ${checked ? 'psp-toggle-track-on' : 'psp-toggle-track-off'}`}>
        <span className={`psp-toggle-thumb ${checked ? 'psp-toggle-thumb-on' : 'psp-toggle-thumb-off'}`} />
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
      const adminRes = await apiFetch(`/admin/config?${editableKeys.map((key) => `key=${encodeURIComponent(key)}`).join('&')}`);
      const publicRes = await apiFetch('/config');
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
      // Build the customer app URL from the same API base (replace admin subdomain)
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
      // Derive customer app origin: strip /api/v1 and replace admin. with app.
      const adminOrigin = apiBase.replace(/\/api\/v1\/?$/, '');
      const appOrigin = adminOrigin.replace('//admin.', '//app.');
      const manifestUrl = `${appOrigin}/manifest.json`;

      const res = await fetch(manifestUrl, {
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
    } finally {
      setVersionLoading(false);
    }
  }

  async function triggerNewBuild() {
    setVersionLoading(true);
    setCacheCleared(false);
    try {
      // Call backend to trigger build
      const res = await apiFetch('/admin/pwa/rebuild', undefined, {
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
      const res = await apiFetch('/admin/pwa/clear-cache', undefined, {
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
      <div className="psp-1">
        <i className="fas fa-spinner fa-spin"></i> Loading PWA settings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="psp-2">
        <i className="fas fa-exclamation-circle"></i> {error}
      </div>
    );
  }

  const bypassEnabled = editValues.otp_bypass_enabled?.toLowerCase() === 'true';
  const bypassCode = editValues.otp_bypass_code ?? '';

  return (
    <div className="psp-3">
      {/* OTP Bypass Warning Banner */}
      {bypassEnabled && (
        <div className="psp-4">
          <span className="psp-5"><i className="fas fa-exclamation-triangle"></i></span>
          <span className="psp-6">
            OTP Bypass is <strong className="psp-7">ACTIVE</strong>. Customers can sign in without a real OTP. Disable before going live.
          </span>
        </div>
      )}

      {/* Authentication Group */}
      <div className="psp-8">
        <div className="psp-9">
          <span className="psp-10"><i className="fas fa-shield-alt"></i></span>
          <h3 className="psp-11">Authentication</h3>
        </div>

        {/* Enable Toggle Row */}
        <div className="psp-12">
          <div className="psp-13">
            <div className="psp-14">
              Enable OTP Bypass
              {bypassEnabled && (
                <span className="psp-15">Active</span>
              )}
            </div>
            <div className="psp-16">
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
        <div className={`psp-bypass-row ${bypassEnabled ? 'opacity-1' : 'opacity-0-5'}`}>
          <div className="psp-17">
            <div className="psp-18">
              Bypass Code
            </div>
            <div className="psp-19">
              The code customers can use instead of a real OTP
            </div>
          </div>
          <div className="psp-20">
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
              className={`psp-bypass-input ${bypassEnabled ? 'psp-bypass-input-active' : 'psp-bypass-input-inactive'}`}
            />
            <button
              className="btn btn-primary psp-21"
              
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
              <span className="psp-22">
                <i className="fas fa-check-circle"></i>
              </span>
            )}
            {savedKeys['otp_bypass_code'] === 'err' && (
              <span className="psp-23">
                <i className="fas fa-exclamation-circle"></i>
              </span>
            )}
          </div>
        </div>

        {/* Enable Save Button */}
        {editValues.otp_bypass_enabled !== String(configs.otp_bypass_enabled ?? '') && (
          <div className="psp-24">
            <button
              className="btn btn-primary psp-25"
              
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
              <span className="psp-26">
                <i className="fas fa-check-circle"></i> Saved
              </span>
            )}
            {savedKeys['otp_bypass_enabled'] === 'err' && (
              <span className="psp-27">
                <i className="fas fa-exclamation-circle"></i> Error
              </span>
            )}
          </div>
        )}
      </div>

      {/* Phone Format Group */}
      <div className="psp-28">
        <div className="psp-29">
          <span className="psp-30"><i className="fas fa-phone"></i></span>
          <h3 className="psp-31">Phone Format</h3>
        </div>

        <div className="psp-32">
          <div className="psp-33">
            <div className="psp-34">
              Default Country Code
            </div>
            <div className="psp-35">
              Prepended to phone numbers on the PWA (default: +60 for Malaysia)
            </div>
          </div>
          <div className="psp-36">
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
              className="psp-37"
            />
            <button
              className="btn btn-primary psp-38"
              
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
              <span className="psp-39">
                <i className="fas fa-check-circle"></i>
              </span>
            )}
            {savedKeys['pwa_phone_country_code'] === 'err' && (
              <span className="psp-40">
                <i className="fas fa-exclamation-circle"></i>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Version & Cache Management */}
      <div className="psp-41">
        <div className="psp-42">
          <span className="psp-43"><i className="fas fa-sync-alt"></i></span>
          <h3 className="psp-44">Version & Cache</h3>
        </div>

        {/* Current Version */}
        <div className="psp-45">
          <div className="psp-46">
            <div className="psp-47">
              Current Version
            </div>
            <div className="psp-48">
              {versionLoading ? 'Loading...' : versionInfo ? `Build: ${versionInfo.build_date}` : 'Unable to fetch version'}
            </div>
          </div>
          <div className="psp-49">
            <div className="psp-50">
              {versionInfo?.version || '—'}
            </div>
            <div className="psp-51">
              {versionInfo?.cache_name}
            </div>
          </div>
        </div>

        {/* Force Update Button */}
        <div className="psp-52">
          <div className="psp-53">
            <div className="psp-54">
              Force PWA Update
            </div>
            <div className="psp-55">
              Trigger a new build with incremented version. Forces all users to update.
            </div>
          </div>
          <button
            className="btn btn-primary psp-56"
            
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
        <div className="psp-57">
          <div className="psp-58">
            <div className="psp-59">
              Clear Service Worker Cache
            </div>
            <div className="psp-60">
              Remove old cached files without rebuilding. Users will get fresh content on next visit.
            </div>
          </div>
          <div className="psp-61">
            <button
              className="btn btn-secondary psp-62"
              
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
              <span className="psp-63">
                <i className="fas fa-check-circle"></i> Done
              </span>
            )}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="psp-64">
        <div className="psp-65">
          <span className="psp-66"><i className="fas fa-info-circle"></i></span>
          How OTP Bypass Works
        </div>
        <ol className="psp-67">
          <li>Enable the toggle above to turn on bypass mode</li>
          <li>Set a numeric code (e.g. 111111) and save it</li>
          <li>On the PWA, the customer enters their phone number and taps Send OTP</li>
          <li>Instead of waiting for a real SMS, they enter the bypass code</li>
          <li>The system skips real OTP validation and logs them in immediately</li>
          <li><strong className="psp-68">Disable the toggle before going live!</strong></li>
        </ol>
      </div>
    </div>
  );
}
