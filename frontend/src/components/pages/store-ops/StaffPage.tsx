'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { StoreSelector, Select, DataTable, type ColumnDef, Pagination, Drawer, Input } from '@/components/ui';
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

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.textPrimary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.textMuted, marginTop: 2 };
const PAGE_SIZE = 20;

export default function StaffPage({ selectedStore, storeObj, token, stores, onStoreChange }: StaffPageProps) {
  const isHQ = selectedStore === 'all';

  // Staff list state
  const [staffList, setStaffList] = useState<MerchantStaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // View mode
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingStaff, setEditingStaff] = useState<MerchantStaffMember | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; email: string; password: string } | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ name: string; email: string; password: string } | null>(null);

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
    setLoading(true);
    try {
      const endpoint = isHQ
        ? `/admin/hq-staff?page=${p}&page_size=${PAGE_SIZE}`
        : `/admin/stores/${selectedStore}/staff?page=${p}&page_size=${PAGE_SIZE}`;
      const res = await apiFetch(endpoint, token);
      if (res.ok) {
        const data = await res.json();
        setStaffList(Array.isArray(data) ? data : (data.staff || []));
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch {
      setStaffList([]);
    } finally { setLoading(false); }
  }, [token, isHQ, selectedStore]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        const res = await apiFetch('/admin/hq-staff', token, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
        const data = await res.json();
        setViewMode('list');
        setEditingStaff(null);
        if (data.temp_password && email) setTempPassword({ name, email, password: data.temp_password });
        fetchStaff(1);
      } else if (editingStaff) {
        if (isHQ) payload.store_ids = selectedStoreIds;
        const res = await apiFetch(`/admin/staff/${editingStaff.id}`, token, { method: 'PUT', body: JSON.stringify(payload) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
        closeForm();
      } else {
        const res = await apiFetch(`/admin/stores/${selectedStore}/staff`, token, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
        const data = await res.json();
        setViewMode('list');
        setEditingStaff(null);
        fetchStaff(1);
        if (data.temp_password && email) setTempPassword({ name, email, password: data.temp_password });
      }
    } catch (err: any) { setError(err.message || 'Network error'); } finally { setSaving(false); }
  }

  async function toggleActive(s: MerchantStaffMember) {
    setError('');
    try {
      const res = await apiFetch(`/admin/staff/${s.id}`, token, { method: 'PUT', body: JSON.stringify({ is_active: !s.is_active }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Failed to toggle'); return; }
      fetchStaff(page);
    } catch (err: any) { setError(err.message || 'Network error'); }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/admin/staff/${id}`, token, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Delete failed'); return; }
      setConfirmDelete(null);
      fetchStaff(page);
    } catch { setError('Network error'); }
  }

  async function handleResetPassword(s: MerchantStaffMember) {
    setError('');
    try {
      const res = await apiFetch(`/admin/staff/${s.id}/reset-password`, token, { method: 'POST' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Reset failed'); return; }
      const data = await res.json();
      setResetPasswordResult({ name: s.name, email: data.email, password: data.temp_password });
    } catch (err: any) { setError(err.message || 'Network error'); }
  }

  const pageTitle = isHQ ? 'Staff Management' : `Staff · ${storeObj?.name}`;

  function renderUserTypeBadge(s: MerchantStaffMember) {
    const utId = s.user_type_id ?? 3;
    const colors = USER_TYPE_COLORS[utId];
    const label = getDisplayUserType(s);
    if (colors) {
      return <span style={{ background: colors.bg, color: colors.text, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{label}</span>;
    }
    return <span className="badge badge-gray">{label}</span>;
  }

  const drawerTitle = editingStaff ? `Edit: ${editingStaff.name}` : 'New Staff';
  const availableRoles = ROLES_BY_TYPE[userTypeId] || [];

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} width={560}>
        {/* Store picker modal */}
        {showStoreModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowStoreModal(false)}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 400, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ margin: 0 }}>Assign to Stores</h4>
                <button className="btn btn-sm" onClick={() => setShowStoreModal(false)}><i className="fas fa-times"></i></button>
              </div>
              <div style={{ ...hintStyle, marginBottom: 12 }}>Select which stores this staff member should have access to.</div>
              {realStores.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: selectedStoreIds.includes(s.id) ? THEME.bgMuted : 'white', border: `1px solid ${selectedStoreIds.includes(s.id) ? THEME.accentLight : THEME.accentLight}` }}>
                  <input
                    type="checkbox"
                    checked={selectedStoreIds.includes(s.id)}
                    onChange={() => toggleStoreCheckbox(s.id)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</span>
                </label>
              ))}
              {realStores.length === 0 && (
                <div style={{ textAlign: 'center', color: THEME.primaryLight, padding: 20 }}>No stores available</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => setShowStoreModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => setShowStoreModal(false)}>
                  Done ({selectedStoreIds.length} selected)
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          {error && (
            <div style={{ background: '#FEE2E2', color: '#A83232', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <Input label="Name *" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Ahmad bin Ali" />
                <div style={hintStyle}>Full name of the staff member</div>
              </div>
              <div>
                <label style={labelStyle}>User Type *</label>
                <Select
                  value={String(userTypeId)}
                  onChange={(val) => handleUserTypeChange(parseInt(val))}
                  options={USER_TYPES.map(t => ({ value: String(t.id), label: t.label }))}
                />
                <div style={hintStyle}>Determines dashboard access level</div>
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <Select
                  value={String(roleId)}
                  onChange={(val) => setRoleId(parseInt(val))}
                  options={availableRoles.map(r => ({ value: String(r.id), label: r.label }))}
                />
                <div style={hintStyle}>Specific position within the type</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Store Assignments</label>
                <button type="button" className="btn" onClick={() => setShowStoreModal(true)} style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {selectedStoreIds.length === 0 ? 'No stores assigned' :
                      selectedStoreIds.length === 1 ? realStores.find(s => s.id === selectedStoreIds[0])?.name || `${selectedStoreIds.length} store`
                        : `${selectedStoreIds.length} stores selected`}
                  </span>
                  <i className="fas fa-store" style={{ color: THEME.textMuted }}></i>
                </button>
                <div style={hintStyle}>Click to select which stores this staff can access</div>
              </div>
              <div>
                <Input label="Email (optional)" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. ahmad@zus.com" />
                <div style={hintStyle}>Adding email auto-creates a login account</div>
              </div>
              <div>
                <Input label="PIN Code (optional)" value={pinCode} onChange={e => setPinCode(e.target.value)} placeholder="4-6 digit PIN" maxLength={6} />
                <div style={hintStyle}>{editingStaff ? 'Leave blank to keep current' : 'For POS clock-in'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editingStaff ? 'Update' : 'Create'}</button>
              <button type="button" className="btn" onClick={closeForm}>Cancel</button>
              <div style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
                Active
              </label>
            </div>
          </form>
        </div>
      </Drawer>

      {/* LIST VIEW */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        <div style={{ background: '#FEE2E2', color: '#A83232', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {tempPassword && (
        <div style={{ background: '#ECFDF5', color: '#065F46', padding: '12px 16px', borderRadius: 12, marginBottom: 12, fontSize: 13, border: '1px solid #A7F3D0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong><i className="fas fa-check-circle"></i> Staff account created!</strong>
              <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 14, background: 'white', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
                Email: {tempPassword.email} &nbsp;|&nbsp; Password: <strong>{tempPassword.password}</strong>
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setTempPassword(null)}><i className="fas fa-times"></i></button>
          </div>
        </div>
      )}

      {resetPasswordResult && (
        <div style={{ background: THEME.bgMuted, color: THEME.success, padding: '12px 16px', borderRadius: 12, marginBottom: 12, fontSize: 13, border: `1px solid ${THEME.accentLight}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong><i className="fas fa-key"></i> Password reset for {resetPasswordResult.name}</strong>
              <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 14, background: 'white', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
                Email: {resetPasswordResult.email} &nbsp;|&nbsp; New Password: <strong>{resetPasswordResult.password}</strong>
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setResetPasswordResult(null)}><i className="fas fa-times"></i></button>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
        marginTop: 20,
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-user-tie" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{staffList.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> staff
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable<MerchantStaffMember>
        data={staffList}
        columns={[
          { key: 'name', header: 'Name', render: (s) => <span style={{ fontWeight: 500 }}>{s.name}</span> },
          { key: 'user_type_id', header: 'User Type', render: (s) => renderUserTypeBadge(s) },
          { key: 'role', header: 'Role', render: (s) => <span className="badge badge-blue">{getDisplayRole(s)}</span> },
          { key: 'store_assignments', header: 'Stores', render: (s) => {
            const realAssignments = (s.store_assignments || []).filter(a => a.store_id > 0);
            return realAssignments.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {realAssignments.map(a => (
                  <span key={a.store_id} className="badge badge-gray" style={{ fontSize: 10 }}>{a.store_name}</span>
                ))}
              </div>
            ) : <span style={{ color: THEME.textMuted }}>—</span>;
          }},
          { key: 'email', header: 'Email', render: (s) => s.email ? (
            <span>{s.email} <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>Has Login</span></span>
          ) : <span style={{ color: THEME.textMuted }}>No login</span> },
          { key: 'phone', header: 'Phone', render: (s) => s.phone || '—' },
          { key: 'is_active', header: 'Status', render: (s) => (
            <button onClick={() => toggleActive(s)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
              <span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
            </button>
          )},
          { key: 'actions', header: 'Actions', render: (s) => {
            const rowKey = s.id ?? `user-${s.user_id}`;
            return (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => openEdit(s)} title="Edit"><i className="fas fa-edit"></i></button>
                <button className="btn btn-sm" onClick={() => s.email ? handleResetPassword(s) : setError('Add an email to enable login access.')} title={s.email ? 'Reset password' : 'No login'}><i className="fas fa-key" style={{ color: s.email ? undefined : THEME.accentLight }}></i></button>
                {confirmDelete === rowKey ? (
                  <>
                    <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(s.id!)}>Confirm</button>
                    <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(rowKey)} title="Deactivate"><i className="fas fa-trash"></i></button>
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
