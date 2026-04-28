'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { StoreSelector, Select, DataTable, Pagination, Drawer, Input } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { MerchantStaffMember, MerchantStore } from '@/lib/merchant-types';

interface StaffPageProps {
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  stores: MerchantStore[];
  onStoreChange: (storeId: string) => void;
}

// ACL Lookup: user_type_id → label
const USER_TYPES = [
  { id: 1, label: 'HQ Management' },
  { id: 2, label: 'Store Management' },
  { id: 3, label: 'Store' },
];

// ACL Lookup: user_type_id → role_id options
const ROLES_BY_TYPE: Record<number, { id: number; label: string }[]> = {
  1: [
    { id: 1, label: 'Admin' },
    { id: 2, label: 'Brand Owner' },
    { id: 7, label: 'HQ Staff' },
  ],
  2: [
    { id: 3, label: 'Manager' },
    { id: 4, label: 'Assistant Manager' },
  ],
  3: [
    { id: 5, label: 'Staff' },
  ],
};

// Display colors by user_type_id
const USER_TYPE_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#EEF2FF', text: '#4338CA' },
  2: { bg: '#FFEDD5', text: '#C2410C' },
  3: { bg: '#F0FDF4', text: '#166534' },
};


const PAGE_SIZE = 20;

export default function StaffPage({ selectedStore, storeObj: _storeObj, token: _token, stores, onStoreChange }: StaffPageProps) {
  const activeStoreId = selectedStore !== 'all' && selectedStore ? selectedStore : '';
  const isHQ = selectedStore === 'all';

  // Staff list state
  const [staffList, setStaffList] = useState<MerchantStaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // View mode
  const [_viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingStaff, setEditingStaff] = useState<MerchantStaffMember | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; email: string; password: string } | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ name: string; email: string; password: string } | null>(null);

  useEffect(() => {
    if (tempPassword) { const t = setTimeout(() => setTempPassword(null), 120000); return () => clearTimeout(t); }
  }, [tempPassword]);
  useEffect(() => {
    if (resetPasswordResult) { const t = setTimeout(() => setResetPasswordResult(null), 120000); return () => clearTimeout(t); }
  }, [resetPasswordResult]);

  // Form fields (ACL integer-based)
  const [name, setName] = useState('');
  const [userTypeId, setUserTypeId] = useState(1);
  const [roleId, setRoleId] = useState(1);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedStoreIds, setSelectedStoreIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // Store picker modal
  const [showStoreModal, setShowStoreModal] = useState(false);

  // Real stores only (id > 0), exclude HQ
  const realStores = stores.filter(s => String(s.id) !== '0');

  // ── Fetch staff with pagination ──
  const fetchStaff = useCallback(async (p: number) => {
    if (!isHQ && !activeStoreId) return;
    setLoading(true);
    try {
      const endpoint = isHQ
        ? `/admin/hq-staff?page=${p}&page_size=${PAGE_SIZE}`
        : `/admin/stores/${activeStoreId}/staff?page=${p}&page_size=${PAGE_SIZE}`;
      const res = await apiFetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setStaffList(Array.isArray(data) ? data : (data.items || []));
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch {
      setStaffList([]);
    } finally { setLoading(false); }
  }, [isHQ, selectedStore]);

  useEffect(() => { fetchStaff(1); }, [fetchStaff]);

  // Re-fetch page 1 when store changes
  useEffect(() => {
    setViewMode('list');
    setEditingStaff(null);
    setError('');
    setConfirmDelete(null);
    setTempPassword(null);
    setResetPasswordResult(null);
  }, [selectedStore]);

  function handleUserTypeChange(newTypeId: number) {
    setUserTypeId(newTypeId);
    const roles = ROLES_BY_TYPE[newTypeId];
    if (roles && roles.length > 0) setRoleId(roles[0].id);
  }

  function openCreate() {
    setEditingStaff(null);
    setName('');
    if (isHQ) {
      setUserTypeId(1);
      setRoleId(1);
    } else {
      setUserTypeId(3);
      setRoleId(5);
    }
    setPhone(''); setEmail(''); setPinCode(''); setIsActive(true);
    setSelectedStoreIds(isHQ ? [] : [parseInt(selectedStore)]);
    setError('');
    setViewMode('form');
    setDrawerOpen(true);
  }

  function openEdit(s: MerchantStaffMember) {
    setEditingStaff(s);
    setName(s.name);
    setUserTypeId(s.user_type_id ?? 3);
    setRoleId(s.role_id ?? 5);
    setPhone(s.phone || '');
    setEmail(s.email || '');
    setPinCode('');
    setIsActive(s.is_active);
    // Pre-populate store assignments (exclude HQ store 0)
    const assigns = s.store_assignments || [];
    setSelectedStoreIds(assigns.map(a => a.store_id).filter(id => id > 0));
    setError('');
    setViewMode('form');
    setDrawerOpen(true);
  }

  function closeForm() {
    setDrawerOpen(false);
    setViewMode('list');
    setEditingStaff(null);
    setError('');
    fetchStaff(page);
  }

  function getDisplayRole(s: MerchantStaffMember): string {
    return s.user_role || s.role;
  }

  function getDisplayUserType(s: MerchantStaffMember): string {
    if (s.user_type) return s.user_type;
    if (s.user_type_id) {
      const found = USER_TYPES.find(t => t.id === s.user_type_id);
      if (found) return found.label;
    }
    return 'Store';
  }

  function toggleStoreCheckbox(storeId: number) {
    setSelectedStoreIds(prev =>
      prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId]
    );
  }

  async function handleSubmit() {
    setSaving(true); setError('');

    const payload: any = {
      name,
      user_type_id: userTypeId,
      role_id: roleId,
      phone,
      is_active: isActive,
      store_ids: isHQ ? selectedStoreIds : [parseInt(selectedStore), ...selectedStoreIds.filter(id => id !== parseInt(selectedStore))],
    };
    if (email) payload.email = email;
    if (pinCode) payload.pin_code = pinCode;

    try {
      if (isHQ && !editingStaff) {
        const res = await apiFetch('/admin/hq-staff', undefined, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
        const data = await res.json();
        if (data.temp_password && email) setTempPassword({ name, email, password: data.temp_password });
        closeForm();
      } else if (editingStaff) {
        if (!editingStaff.id) { setError('Staff record has no ID — create a new one instead'); return; }
        if (isHQ) payload.store_ids = selectedStoreIds;
        const res = await apiFetch(`/admin/staff/${editingStaff.id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
        closeForm();
      } else {
        const res = await apiFetch(`/admin/stores/${selectedStore}/staff`, undefined, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
        const data = await res.json();
        if (data.temp_password && email) setTempPassword({ name, email, password: data.temp_password });
        closeForm();
      }
    } catch (err: any) { setError(err.message || 'Network error'); } finally { setSaving(false); }
  }

  async function toggleActive(s: MerchantStaffMember) {
    setError('');
    try {
      const res = await apiFetch(`/admin/staff/${s.id}`, undefined, { method: 'PUT', body: JSON.stringify({ is_active: !s.is_active }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to toggle'); return; }
      fetchStaff(page);
    } catch (err: any) { setError(err.message || 'Network error'); }
  }

  async function handleDelete(id: number) {
    const deleteId = id || 0;
    if (!deleteId) { setError('Cannot delete: no valid ID'); return; }
    try {
      const res = await apiFetch(`/admin/staff/${deleteId}`, undefined, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Delete failed'); return; }
      setConfirmDelete(null);
      fetchStaff(page);
    } catch { setError('Network error'); }
  }

  async function handleResetPassword(s: MerchantStaffMember) {
    const staffId = s.id || s.user_id;
    if (!staffId) { setError('Staff record has no ID — cannot reset password'); return; }
    setError('');
    try {
      const res = await apiFetch(`/admin/staff/${staffId}/reset-password`, undefined, { method: 'POST' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Reset failed'); return; }
      const data = await res.json();
      setResetPasswordResult({ name: data.name || s.name, email: data.email, password: data.temp_password || data.password });
    } catch (err: any) { setError(err.message || 'Network error'); }
  }

  function renderUserTypeBadge(s: MerchantStaffMember) {
    const utId = s.user_type_id ?? 3;
    const colors = USER_TYPE_COLORS[utId];
    const label = getDisplayUserType(s);
    if (colors) {
      return <span className="stm-badge" style={{ background: colors.bg, color: colors.text }}>{label}</span>;
    }
    return <span className="badge badge-gray">{label}</span>;
  }

  const drawerTitle = editingStaff ? `Edit: ${editingStaff.name}` : 'New Staff';
  const availableRoles = ROLES_BY_TYPE[userTypeId] || [];

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle}>
        {/* Store picker modal */}
        {showStoreModal && (
           <div className="stm-0" onClick={() => setShowStoreModal(false)}>
             <div className="stm-1" onClick={e => e.stopPropagation()}>
               <div className="stm-2">
                 <h4 className="stm-3">Assign to Stores</h4>
                <button className="btn btn-sm" onClick={() => setShowStoreModal(false)}><i className="fas fa-times"></i></button>
              </div>
              <div className="stm-4">Select which stores this staff member should have access to.</div>
              {realStores.map(s => (
                <label key={s.id} className="sp-store-row" style={{ background: selectedStoreIds.includes(s.id) ? THEME.bgMuted : 'white', border: `1px solid ${THEME.accentLight}` }}>
                  <input
                    type="checkbox"
                    checked={selectedStoreIds.includes(s.id)}
                    onChange={() => toggleStoreCheckbox(s.id)}
                    className="stm-5"
                  />
                  <span className="stm-6">{s.name}</span>
                </label>
              ))}
              {realStores.length === 0 && (
                <div className="sp-7">No stores available</div>
              )}
              <div className="sp-8">
                <button className="btn" onClick={() => setShowStoreModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => setShowStoreModal(false)}>
                  Done ({selectedStoreIds.length} selected)
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="sp-9">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}
        <div className="df-section">
          <div className="df-grid-2-wide-short">
            <div className="df-field">
              <label className="df-label">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Ahmad bin Ali" />
              <div className="df-hint">Full name of the staff member</div>
            </div>
            <div className="df-field">
              <label className="df-label">User Type *</label>
              <Select
                value={String(userTypeId)}
                onChange={(val) => handleUserTypeChange(parseInt(val))}
                options={USER_TYPES.map(t => ({ value: String(t.id), label: t.label }))}
              />
              <div className="df-hint">Dashboard access level</div>
            </div>
          </div>
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">Email <span>(optional)</span></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ahmad@zus.com" />
              <div className="df-hint">Auto-creates login account</div>
            </div>
            <div className="df-field">
              <label className="df-label">Role *</label>
              <Select
                value={String(roleId)}
                onChange={(val) => setRoleId(parseInt(val))}
                options={availableRoles.map(r => ({ value: String(r.id), label: r.label }))}
              />
              <div className="df-hint">Position</div>
            </div>
          </div>
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">Store Assignments</label>
              <button className="btn" onClick={() => setShowStoreModal(true)} style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  {selectedStoreIds.length === 0 ? 'No stores assigned' :
                    selectedStoreIds.length === 1 ? realStores.find(s => s.id === selectedStoreIds[0])?.name || `${selectedStoreIds.length} store`
                      : `${selectedStoreIds.length} stores selected`}
                </span>
                <span><i className="fas fa-store"></i></span>
              </button>
              <div className="df-hint">Click to select stores</div>
            </div>
            <div className="df-field">
              <label className="df-label">PIN Code <span>(optional)</span></label>
              <input value={pinCode} onChange={e => setPinCode(e.target.value)} placeholder="4-6 digit" maxLength={6} />
              <div className="df-hint">{editingStaff ? 'Leave blank to keep' : 'For POS clock-in'}</div>
            </div>
          </div>
        </div>
        <div className="df-actions">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginRight: 'auto' }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
            Active
          </label>
          <button className="btn" onClick={closeForm}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : editingStaff ? 'Update' : 'Create'}</button>
        </div>
      </Drawer>

      {/* LIST VIEW */}
      <div className="sp-18">
        <div className="sp-19">
          <StoreSelector
            stores={stores.filter(s => String(s.id) !== '0')}
            selectedStore={selectedStore}
            onChange={onStoreChange}
            allLabel="All Stores (HQ view)"
          />
        </div>
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Staff</button>
      </div>

      {error && (
        <div className="sp-20">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {tempPassword && (
        <div className="cdp-notice" style={{ opacity: 1, transition: 'opacity 0.5s', animation: 'fadeOut 2min forwards' }}>
          <div className="cdp-notice-content">
            <div>
              <div className="cdp-notice-title">
                <i className="fas fa-check-circle" style={{ color: '#16A34A', marginRight: 6 }}></i>
                Staff account created: {tempPassword.name}
              </div>
              <div className="cdp-notice-body">
                <span><strong>Email:</strong> {tempPassword.email}</span>
                <span><strong>Password:</strong> <code style={{ background: '#DCFCE7', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>{tempPassword.password}</code></span>
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setTempPassword(null)} style={{ flexShrink: 0 }}><i className="fas fa-times"></i></button>
          </div>
          <button className="cdp-notice-copy" onClick={() => {
            const msg = `Your new login credentials:\nEmail: ${tempPassword.email}\nPassword: ${tempPassword.password}\n\nPlease change your password after first login.`;
            navigator.clipboard.writeText(msg);
          }}>
            <i className="fas fa-copy" style={{ marginRight: 4 }}></i> Copy for WhatsApp / Email
          </button>
        </div>
      )}

      {resetPasswordResult && (
        <div className="cdp-notice" style={{ opacity: 1, transition: 'opacity 0.5s', animation: 'fadeOut 2min forwards' }}>
          <div className="cdp-notice-content">
            <div>
              <div className="cdp-notice-title">
                <i className="fas fa-check-circle" style={{ color: '#16A34A', marginRight: 6 }}></i>
                Password Reset: {resetPasswordResult.name}
              </div>
              <div className="cdp-notice-body">
                <span><strong>Email:</strong> {resetPasswordResult.email}</span>
                <span><strong>Password:</strong> <code style={{ background: '#DCFCE7', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>{resetPasswordResult.password}</code></span>
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setResetPasswordResult(null)} style={{ flexShrink: 0 }}><i className="fas fa-times"></i></button>
          </div>
          <button className="cdp-notice-copy" onClick={() => {
            const msg = `Your new login credentials:\nEmail: ${resetPasswordResult.email}\nPassword: ${resetPasswordResult.password}\n\nPlease change your password after first login.`;
            navigator.clipboard.writeText(msg);
          }}>
            <i className="fas fa-copy" style={{ marginRight: 4 }}></i> Copy for WhatsApp / Email
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="sp-27">
        <div className="sp-28">
          <span className="sp-29"><i className="fas fa-user-tie"></i></span>
          Showing <strong className="sp-30">{staffList.length}</strong> of <strong className="sp-31">{total}</strong> staff
        </div>
        <div className="sp-32">
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable<MerchantStaffMember>
        data={staffList}
        columns={[
          { key: 'name', header: 'Staff', render: (s) => (
            <div>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {renderUserTypeBadge(s)}
                <span className="badge badge-blue">{getDisplayRole(s)}</span>
              </div>
            </div>
          )},
          { key: 'email', header: 'Contact', render: (s) => (
            <div>
              {s.email ? (
                <div>{s.email} <span className="badge badge-green sp-37">Has Login</span></div>
              ) : <div className="sp-38">No login</div>}
              {s.phone && <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.phone}</div>}
            </div>
          )},
          { key: 'store_assignments', header: 'Stores', render: (s) => {
            const realAssignments = (s.store_assignments || []).filter(a => a.store_id > 0);
            return realAssignments.length > 0 ? (
              <div className="sp-34">
                {realAssignments.map(a => (
                  <span key={a.store_id} className="badge badge-gray sp-35">{a.store_name}</span>
                ))}
              </div>
            ) : <span className="sp-36">—</span>;
          }},
          { key: 'actions', header: 'Actions', render: (s) => {
            const rowKey = s.id ?? s.user_id ?? `user-${s.id}`;
            return (
              <div className="sp-actions">
                <button className="btn btn-sm" onClick={() => toggleActive(s)} title={s.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
                  <i className={`fas ${s.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ fontSize: 20, color: s.is_active ? '#16A34A' : '#9CA3AF' }}></i>
                </button>
                <button className="btn btn-sm" onClick={() => openEdit(s)} title="Edit"><i className="fas fa-edit"></i></button>
                <button className="btn btn-sm" onClick={() => s.email ? handleResetPassword(s) : setError('Add an email to enable login access.')} title={s.email ? 'Reset password' : 'No login'}><i className="fas fa-key" style={{ color: s.email ? undefined : THEME.accentLight }}></i></button>
                {confirmDelete === rowKey ? (
                  <>
                    <button className="btn btn-sm sp-confirm" onClick={() => handleDelete(s.id || s.user_id || 0)}>Confirm</button>
                    <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-sm sp-delete" onClick={() => setConfirmDelete(rowKey)} title="Deactivate"><i className="fas fa-trash"></i></button>
                )}
              </div>
            );
          }},
        ]}
        loading={loading && staffList.length === 0}
        emptyMessage={isHQ ? 'No HQ staff yet.' : 'No staff members yet.'}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchStaff} loading={loading} />
    </div>
  );
}
