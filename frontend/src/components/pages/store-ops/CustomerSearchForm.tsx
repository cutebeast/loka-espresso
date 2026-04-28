'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export interface CustomerResult {
  id: number;
  name: string | null;
  phone: string | null;
  wallet_balance?: number;  // from list endpoint (may be stale — refresh from detail endpoint)
}

interface CustomerSearchFormProps {
  onCustomerFound: (customer: CustomerResult) => void;
  children?: React.ReactNode;
}

export default function CustomerSearchForm({ onCustomerFound, children }: CustomerSearchFormProps) {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const res = await apiFetch(`/admin/customers?search=${encodeURIComponent(phone.trim())}&page=1&page_size=20`);
      if (!res.ok) { setError('Search failed'); return; }
      const data = await res.json();
      const items: CustomerResult[] = data.items || [];
      if (items.length === 0) {
        setError(`No customer found with phone "${phone}"`);
        return;
      }
      const searchDigits = phone.trim().replace(/\D/g, '');
      const exact = items.find(c => (c.phone || '').replace(/\D/g, '') === searchDigits);
      if (exact) {
        onCustomerFound(exact);
        setResults([]);
      } else {
        setResults(items);
      }
    } catch {
      setError('Network error searching customer');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="card csf-card">
      <h3 className="csf-title">Step 1: Find Customer</h3>
      <form onSubmit={handleSearch} className="csf-form">
        <div className="csf-input-wrap">
          <label className="csf-label">Phone Number</label>
          <input
            value={phone}
            onChange={e => { setPhone(e.target.value); setResults([]); setError(''); }}
            placeholder="e.g. 0102901234"
            className="csf-input"
          />
        </div>
        <div className="csf-actions">
          <button type="submit" className="btn btn-primary csf-btn" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
          {children}
        </div>
      </form>

      {error && (
        <div className="csf-error">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="csf-results">
          <div className="csf-results-header">
            <i className="fas fa-users"></i> {results.length} customers found — tap to select
          </div>
          {results.map(c => (
            <button
              key={c.id}
              className="csf-result-item"
              onClick={() => { onCustomerFound(c); setResults([]); }}
            >
              <div className="csf-result-name">{c.name || 'Unnamed'}</div>
              <div className="csf-result-phone">{c.phone}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
