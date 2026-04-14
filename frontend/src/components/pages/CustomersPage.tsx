'use client';

import { useState, useEffect, FormEvent } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import type { CustomerItem, CustomerDetail, CustomerWalletTransaction, CustomerLoyaltyTransaction, MerchantOrder } from '@/lib/merchant-types';

interface CustomersPageProps {
  token: string;
  selectedStore: string;
}

export default function CustomersPage({ token, selectedStore }: CustomersPageProps) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [customerOrders, setCustomerOrders] = useState<MerchantOrder[]>([]);
  const [loyaltyHistory, setLoyaltyHistory] = useState<CustomerLoyaltyTransaction[]>([]);
  const [walletHistory, setWalletHistory] = useState<CustomerWalletTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = selectedStore !== 'all' ? `?store_id=${selectedStore}` : '';
    apiFetch(`/admin/customers${params}`, token)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.customers || []);
        setCustomers(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, selectedStore]);

  async function openCustomerDetail(customerId: number) {
    setDetailLoading(true);
    setSelectedCustomer(null);
    setEditingCustomer(false);
    try {
      const [detailRes, ordersRes, loyaltyRes, walletRes] = await Promise.all([
        apiFetch(`/admin/customers/${customerId}`, token),
        apiFetch(`/admin/customers/${customerId}/orders`, token),
        apiFetch(`/admin/customers/${customerId}/loyalty-history`, token),
        apiFetch(`/admin/customers/${customerId}/wallet-history`, token),
      ]);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setSelectedCustomer(detail);
        setEditName(detail.name || '');
        setEditPhone(detail.phone || '');
        setEditEmail(detail.email || '');
      }
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setCustomerOrders(Array.isArray(data) ? data : (data.orders || []));
      }
      if (loyaltyRes.ok) {
        const data = await loyaltyRes.json();
        setLoyaltyHistory(Array.isArray(data) ? data : (data.history || []));
      }
      if (walletRes.ok) {
        const data = await walletRes.json();
        setWalletHistory(Array.isArray(data) ? data : (data.transactions || []));
      }
    } catch {} finally { setDetailLoading(false); }
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedCustomer) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await apiFetch(`/admin/customers/${selectedCustomer.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ name: editName, phone: editPhone, email: editEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.detail || `Failed (${res.status})`);
        return;
      }
      // Refresh detail
      setEditingCustomer(false);
      await openCustomerDetail(selectedCustomer.id);
      // Refresh list
      const params = selectedStore !== 'all' ? `?store_id=${selectedStore}` : '';
      const listRes = await apiFetch(`/admin/customers${params}`, token);
      if (listRes.ok) {
        const data = await listRes.json();
        setCustomers(Array.isArray(data) ? data : (data.customers || []));
      }
    } catch { setEditError('Network error'); } finally { setEditSaving(false); }
  }

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>All Customers</h3>
      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 400 }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
          <i className="fas fa-users" style={{ fontSize: 40, marginBottom: 16 }}></i>
          <p>{search ? 'No customers match your search' : 'No customers found'}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Tier</th>
                <th>Points</th>
                <th>Total Orders</th>
                <th>Total Spent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => openCustomerDetail(c.id)}>
                  <td style={{ fontWeight: 500 }}>{c.name || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.email || '-'}</td>
                  <td><span className="badge badge-blue">{c.tier || 'Standard'}</span></td>
                  <td>{c.points} pts</td>
                  <td>{c.total_orders}</td>
                  <td>{formatRM(c.total_spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCustomer && (
        <div className="modal-overlay" onClick={() => { setSelectedCustomer(null); setEditingCustomer(false); }}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Customer Detail</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {!editingCustomer && (
                  <button className="btn btn-sm" onClick={() => setEditingCustomer(true)}><i className="fas fa-edit"></i> Edit</button>
                )}
                <button className="btn btn-sm" onClick={() => { setSelectedCustomer(null); setEditingCustomer(false); }}><i className="fas fa-times"></i></button>
              </div>
            </div>
            {detailLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>
            ) : (
              <>
                {/* ── Profile & Balances ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                  <div className="card">
                    <h4 style={{ marginBottom: 12 }}>Profile</h4>
                    {editingCustomer ? (
                      <form onSubmit={handleEditSubmit}>
                        {editError && (
                          <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                            <i className="fas fa-exclamation-circle"></i> {editError}
                          </div>
                        )}
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Name</label>
                          <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Customer name" />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Phone</label>
                          <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+60 12-345 6789" />
                          <div style={hintStyle}>Used for passwordless login. Changing this will change how the customer logs in.</div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={labelStyle}>Email</label>
                          <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="customer@email.com" />
                          <div style={hintStyle}>Recovery channel — used to verify identity if phone is lost.</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
                          <button type="button" className="btn" onClick={() => setEditingCustomer(false)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p><strong>Name:</strong> {selectedCustomer.name || '-'}</p>
                        <p><strong>Phone:</strong> {selectedCustomer.phone || '-'}</p>
                        <p><strong>Email:</strong> {selectedCustomer.email || (
                          <span style={{ color: '#D97706', fontWeight: 500 }}>Not set — recommend adding for account recovery</span>
                        )}</p>
                        <p><strong>Tier:</strong> <span className="badge badge-blue">{selectedCustomer.tier || 'Standard'}</span></p>
                        <p><strong>Joined:</strong> {selectedCustomer.created_at ? new Date(selectedCustomer.created_at).toLocaleDateString() : '-'}</p>
                      </>
                    )}
                  </div>
                  <div className="card">
                    <h4 style={{ marginBottom: 12 }}>Balances</h4>
                    <p><strong>Loyalty Points:</strong> {selectedCustomer.points} pts</p>
                    <p><strong>Wallet Balance:</strong> {formatRM(selectedCustomer.wallet_balance || 0)}</p>
                    <p><strong>Total Orders:</strong> {selectedCustomer.total_orders}</p>
                    <p><strong>Total Spent:</strong> {formatRM(selectedCustomer.total_spent)}</p>
                  </div>
                </div>

                {/* ── Recent Orders ── */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ marginBottom: 12 }}>Recent Orders</h4>
                  {customerOrders.length === 0 ? (
                    <p style={{ color: '#94A3B8' }}>No orders</p>
                  ) : (
                    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #ECF1F7' }}>
                      <table>
                        <thead><tr><th>Order #</th><th>Type</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>
                          {customerOrders.slice(0, 10).map(o => (
                            <tr key={o.id}>
                              <td style={{ fontWeight: 500 }}>{o.order_number}</td>
                              <td style={{ textTransform: 'capitalize' }}>{o.order_type?.replace('_', ' ')}</td>
                              <td>{formatRM(o.total)}</td>
                              <td><span className={`badge ${o.status === 'completed' ? 'badge-green' : o.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>{o.status}</span></td>
                              <td>{new Date(o.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── Loyalty & Wallet History ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="card">
                    <h4 style={{ marginBottom: 12 }}>Loyalty History</h4>
                    {loyaltyHistory.length === 0 ? (
                      <p style={{ color: '#94A3B8' }}>No loyalty transactions</p>
                    ) : (
                      loyaltyHistory.slice(0, 10).map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #EDF2F8', fontSize: 13 }}>
                          <span>{t.description || t.type}</span>
                          <span style={{ color: t.type === 'earn' ? '#059669' : '#EF4444', fontWeight: 600 }}>
                            {t.type === 'earn' ? '+' : '-'}{t.points} pts
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="card">
                    <h4 style={{ marginBottom: 12 }}>Wallet History</h4>
                    {walletHistory.length === 0 ? (
                      <p style={{ color: '#94A3B8' }}>No wallet transactions</p>
                    ) : (
                      walletHistory.slice(0, 10).map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #EDF2F8', fontSize: 13 }}>
                          <span>{t.description || t.type}</span>
                          <span style={{ color: t.type === 'top_up' || t.type === 'refund' ? '#059669' : '#EF4444', fontWeight: 600 }}>
                            {t.type === 'top_up' || t.type === 'refund' ? '+' : '-'}{formatRM(t.amount)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };
