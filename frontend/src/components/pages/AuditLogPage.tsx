'use client';

import type { MerchantAuditEntry, MerchantStore } from '@/lib/merchant-types';

interface AuditLogPageProps {
  auditLog: MerchantAuditEntry[];
  stores: MerchantStore[];
}

export default function AuditLogPage({ auditLog, stores }: AuditLogPageProps) {
  return (
    <div>
      <h3 style={{ marginBottom: 20 }}>Audit Log</h3>
      {auditLog.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
          <i className="fas fa-history" style={{ fontSize: 40, marginBottom: 16 }}></i>
          <p>No audit log entries</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Who</th><th>Action</th><th>IP</th><th>Location</th><th>Status</th></tr>
            </thead>
            <tbody>
              {auditLog.map(entry => {
                const storeName = entry.store_id
                  ? (stores.find(s => s.id === entry.store_id)?.name || `Store ${entry.store_id}`)
                  : 'All Stores';
                return (
                  <tr key={entry.id}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td style={{ fontWeight: 500 }}>{entry.user_email || 'System'}</td>
                    <td>
                      <span className="badge badge-blue" style={{ textTransform: 'none', fontFamily: 'monospace', fontSize: 11 }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: '#64748B', fontFamily: 'monospace' }}>{entry.ip_address || '-'}</td>
                    <td>{storeName}</td>
                    <td>
                      <span className={`badge ${entry.status === 'success' ? 'badge-green' : entry.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
