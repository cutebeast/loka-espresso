'use client';

export function StatCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 24, padding: '22px 20px', border: '1px solid #EDF2F7', boxShadow: '0 6px 12px -6px rgba(0,47,108,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      </div>
      <i className={`fas ${icon}`} style={{ fontSize: 28, color }}></i>
    </div>
  );
}
